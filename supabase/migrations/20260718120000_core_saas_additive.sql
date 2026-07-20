-- ══════════════════════════════════════════════════════════════════
-- CORE SAAS COMPLETION — ADDITIVE MIGRATION
-- File: supabase/migrations/20260718120000_core_saas_additive.sql
--
-- Adds three feature groups without touching any existing schema,
-- grants, or policies:
--
--   A. Multi-league organizer workspace
--        list_my_leagues() — returns every league the signed-in
--        organizer owns, derived from auth.uid() via league_organizers.
--
--   B. Secure challenge lifecycle
--        create_notification_internal — internal helper (no browser grant)
--        create_challenge_secure      — player-authenticated challenge; full
--                                       server-side validation of all rules.
--        create_challenge_for_organizer — organizer-authenticated challenge;
--                                         runs the same validation as the
--                                         player path and creates a pending
--                                         challenge (challenged player must
--                                         accept before match is created).
--        respond_to_challenge_secure  — challenged player accepts or declines;
--                                       accept atomically creates the match.
--
--        DOUBLES CHALLENGE DESIGN DECISION
--        The current product has no coherent doubles challenge model:
--        addChallenge in LeagueContext hardcodes p1_player_id/p2_player_id
--        regardless of mode, which would violate FK constraints in doubles.
--        Rather than invent a model silently, both RPCs explicitly reject
--        doubles leagues with RAISE EXCEPTION 'doubles_challenges_not_supported'.
--        The front-end shows "Doubles challenges are coming soon."
--        A separate design decision is required to define: which player on a
--        doubles team issues/receives a challenge, which team member confirms
--        accept/decline, and how team_id maps to challenger_team_id.
--
--   C. Secure notifications (player-only)
--        fetch_my_notifications       — token-authenticated notification fetch.
--        mark_my_notifications_read   — token-authenticated mark-read (all or
--                                       specific IDs).
--        CREATE OR REPLACE on submit / confirm / dispute / resolve RPCs to
--        generate notifications via create_notification_internal after each
--        successful state transition.
--
-- Security pattern (consistent with prior migrations):
--   • SECURITY DEFINER + SET search_path = '' on every function.
--   • Fully qualified table references throughout.
--   • REVOKE ALL FROM PUBLIC, anon, authenticated before GRANT.
--   • Least-privilege EXECUTE grants.
--   • No dynamic SQL.
--
-- Prerequisites:
--   • 20260717140000_secure_player_match_lifecycle.sql applied.
--   • resolve_player_from_token, get_match_participant_side,
--     validate_match_result_payload, assert_league_organizer all exist.
--
-- What this migration does NOT touch:
--   • No existing table, column, policy, or grant is modified.
--   • No existing RPC is dropped.
--   • No direct INSERT / UPDATE privileges are revoked here.
--     Use 20260718130000_core_saas_lockdown.sql for that step.
--
-- Rollback: supabase/rollback/20260718120000_core_saas_additive_rollback.sql
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- A. ORGANIZER RPC: list_my_leagues
-- Returns every league the authenticated organizer owns, with participant
-- counts suitable for a league-card display.  The user_id is derived entirely
-- from auth.uid() — the caller cannot supply or spoof it.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.list_my_leagues()
RETURNS TABLE (
  league_id          uuid,
  name               text,
  sport              text,
  singles_or_doubles text,
  mode               text,
  format             text,
  rounds             int,
  challenge_spots    int,
  player_count       bigint,
  team_count         bigint,
  created_at         timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    lo.league_id,
    l.name,
    l.sport,
    l.singles_or_doubles,
    l.mode,
    l.format,
    l.rounds,
    l.challenge_spots,
    (SELECT COUNT(*) FROM ladder.players p WHERE p.league_id = l.id)
      AS player_count,
    (SELECT COUNT(*) FROM ladder.teams   t WHERE t.league_id = l.id)
      AS team_count,
    l.created_at
  FROM ladder.league_organizers lo
  JOIN ladder.leagues l ON l.id = lo.league_id
  WHERE lo.user_id = auth.uid()
  ORDER BY l.created_at DESC;
$$;

REVOKE ALL ON FUNCTION ladder.list_my_leagues()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.list_my_leagues()
  TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- B-0. INTERNAL HELPER: create_notification_internal
-- Inserts a notification row.  A 5-minute idempotency window prevents
-- duplicate rows when an RPC is retried after a transient network error.
-- SECURITY DEFINER with no browser EXECUTE grant — callable only from other
-- SECURITY DEFINER functions in the ladder schema.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.create_notification_internal(
  p_player_id    uuid,
  p_league_id    uuid,
  p_type         text,
  p_message      text,
  p_match_id     uuid DEFAULT NULL,
  p_challenge_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ladder.notifications n
    WHERE n.player_id            = p_player_id
      AND n.type                 = p_type
      AND n.related_match_id     IS NOT DISTINCT FROM p_match_id
      AND n.related_challenge_id IS NOT DISTINCT FROM p_challenge_id
      AND n.created_at           > now() - INTERVAL '5 minutes'
  ) THEN
    INSERT INTO ladder.notifications (
      player_id, league_id, type, message,
      related_match_id, related_challenge_id
    ) VALUES (
      p_player_id, p_league_id, p_type, p_message,
      p_match_id, p_challenge_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.create_notification_internal(uuid, uuid, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
-- No GRANT: internal use only.


-- ═════════════════════════════════════════════════════════════════════════════
-- B-1. INTERNAL HELPER: validate_challenge_rules_internal
-- Validates all challenge business rules for both player and organizer paths.
-- Raises a named exception on violation.  Returns no_response_days.
--
-- Active-challenge definition used for max-active and duplicate checks:
--   • status = 'pending'
--   • status = 'accepted' AND linked match NOT in terminal state
--     (terminal = 'confirmed' or 'skipped')
-- No expiration transition is performed server-side: pending challenges whose
-- expires_at is in the past are detected client-side and displayed as expired.
-- Attempts to accept or decline an expired challenge are rejected by
-- respond_to_challenge_secure (challenge_expired exception).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.validate_challenge_rules_internal(
  p_challenger_id uuid,
  p_challenged_id uuid,
  p_league_id     uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenger_league  uuid;
  v_challenger_status  text;
  v_mode               text;
  v_singles_or_doubles text;
  v_challenge_spots    int;
  v_cooldown_days      int;
  v_rematch_lock_days  int;
  v_max_active         int;
  v_no_response_days   int;
  v_challenged_league  uuid;
  v_challenged_status  text;
  v_challenger_rank    int;
  v_challenged_rank    int;
  v_active_count       int;
BEGIN
  -- 1. Verify challenger belongs to the stated league and is active
  SELECT league_id, status
    INTO v_challenger_league, v_challenger_status
    FROM ladder.players
   WHERE id = p_challenger_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenger_player_not_found';
  END IF;

  IF v_challenger_league IS DISTINCT FROM p_league_id THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  IF v_challenger_status <> 'active' THEN
    RAISE EXCEPTION 'player_inactive';
  END IF;

  -- 2. Load league settings
  SELECT mode, singles_or_doubles, challenge_spots,
         challenge_cooldown_days, rematch_lock_days,
         max_active_challenges, no_response_days
    INTO v_mode, v_singles_or_doubles, v_challenge_spots,
         v_cooldown_days, v_rematch_lock_days,
         v_max_active, v_no_response_days
    FROM ladder.leagues
   WHERE id = p_league_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'league_not_found';
  END IF;

  -- 3. Doubles challenges not yet supported
  IF v_singles_or_doubles = 'doubles' THEN
    RAISE EXCEPTION 'doubles_challenges_not_supported';
  END IF;

  -- 4. Challenges require ladder mode
  IF v_mode <> 'ladder' THEN
    RAISE EXCEPTION 'challenges_require_ladder_mode';
  END IF;

  -- 5. Verify challenged player: same league, active
  SELECT league_id, status
    INTO v_challenged_league, v_challenged_status
    FROM ladder.players
   WHERE id = p_challenged_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenged_player_not_found';
  END IF;

  IF v_challenged_league IS DISTINCT FROM p_league_id THEN
    RAISE EXCEPTION 'not_same_league';
  END IF;

  IF v_challenged_status <> 'active' THEN
    RAISE EXCEPTION 'challenged_player_inactive';
  END IF;

  -- 6. No self-challenge
  IF p_challenger_id = p_challenged_id THEN
    RAISE EXCEPTION 'self_challenge';
  END IF;

  -- 7. Get current rankings
  SELECT rank INTO v_challenger_rank
    FROM ladder.rankings
   WHERE player_id = p_challenger_id AND league_id = p_league_id;

  SELECT rank INTO v_challenged_rank
    FROM ladder.rankings
   WHERE player_id = p_challenged_id AND league_id = p_league_id;

  IF v_challenger_rank IS NULL OR v_challenged_rank IS NULL THEN
    RAISE EXCEPTION 'ranking_not_found';
  END IF;

  -- 8. Challenged must be ranked higher (lower number) and within challenge_spots
  IF v_challenged_rank >= v_challenger_rank THEN
    RAISE EXCEPTION 'challenge_target_below_rank';
  END IF;

  IF (v_challenger_rank - v_challenged_rank) > v_challenge_spots THEN
    RAISE EXCEPTION 'challenge_out_of_range';
  END IF;

  -- 9. Max active challenges: pending + accepted-with-live-match
  SELECT COUNT(*) INTO v_active_count
    FROM ladder.challenges c
   WHERE c.challenger_player_id = p_challenger_id
     AND c.league_id            = p_league_id
     AND (
       c.status = 'pending'
       OR (
         c.status = 'accepted'
         AND (
           c.match_id IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM ladder.matches m
              WHERE m.id     = c.match_id
                AND m.status IN ('confirmed', 'skipped')
           )
         )
       )
     );

  IF v_active_count >= v_max_active THEN
    RAISE EXCEPTION 'max_active_challenges_reached';
  END IF;

  -- 10. No duplicate active challenge between this pair in either direction
  IF EXISTS (
    SELECT 1 FROM ladder.challenges c
     WHERE c.league_id = p_league_id
       AND (
         (c.challenger_player_id = p_challenger_id AND c.challenged_player_id = p_challenged_id)
         OR
         (c.challenger_player_id = p_challenged_id AND c.challenged_player_id = p_challenger_id)
       )
       AND (
         c.status = 'pending'
         OR (
           c.status = 'accepted'
           AND (
             c.match_id IS NULL
             OR NOT EXISTS (
               SELECT 1 FROM ladder.matches m
                WHERE m.id     = c.match_id
                  AND m.status IN ('confirmed', 'skipped')
             )
           )
         )
       )
  ) THEN
    RAISE EXCEPTION 'duplicate_challenge';
  END IF;

  -- 11. Cooldown: challenger must not have issued any challenge within cooldown_days
  IF v_cooldown_days > 0 AND EXISTS (
    SELECT 1 FROM ladder.challenges
     WHERE challenger_player_id = p_challenger_id
       AND league_id            = p_league_id
       AND created_at           > now() - (v_cooldown_days || ' days')::interval
  ) THEN
    RAISE EXCEPTION 'challenge_cooldown_active';
  END IF;

  -- 12. Rematch lock: no confirmed match between these two within rematch_lock_days
  IF v_rematch_lock_days > 0 AND EXISTS (
    SELECT 1 FROM ladder.matches
     WHERE league_id    = p_league_id
       AND status       = 'confirmed'
       AND (
         (p1_player_id = p_challenger_id AND p2_player_id = p_challenged_id)
         OR
         (p1_player_id = p_challenged_id AND p2_player_id = p_challenger_id)
       )
       AND confirmed_at > now() - (v_rematch_lock_days || ' days')::interval
  ) THEN
    RAISE EXCEPTION 'rematch_lock_active';
  END IF;

  RETURN v_no_response_days;
END;
$$;

REVOKE ALL ON FUNCTION ladder.validate_challenge_rules_internal(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
-- No GRANT: internal use only.


-- ═════════════════════════════════════════════════════════════════════════════
-- B-2. PLAYER RPC: create_challenge_secure
-- Player-authenticated (token-based) challenge creation.
-- Resolves the session token to a player_id, then delegates all business-rule
-- validation to validate_challenge_rules_internal.
-- On success: inserts a 'pending' challenge and notifies the challenged player.
-- Returns: the new challenge UUID.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.create_challenge_secure(
  p_token         text,
  p_challenged_id uuid,
  p_league_id     uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenger_id    uuid;
  v_challenger_name  text;
  v_no_response_days int;
  v_challenge_id     uuid;
BEGIN
  -- 1. Resolve challenger from token (validates token, checks active status)
  v_challenger_id := ladder.resolve_player_from_token(p_token);

  -- 2. Validate all challenge business rules (also verifies challenger is in p_league_id)
  v_no_response_days := ladder.validate_challenge_rules_internal(
    v_challenger_id, p_challenged_id, p_league_id
  );

  -- 3. Fetch challenger name for notification (validation has already passed)
  SELECT name INTO v_challenger_name
    FROM ladder.players
   WHERE id = v_challenger_id;

  -- 4. Insert the pending challenge
  INSERT INTO ladder.challenges (
    league_id, challenger_player_id, challenged_player_id,
    status, expires_at
  )
  VALUES (
    p_league_id, v_challenger_id, p_challenged_id,
    'pending', now() + (v_no_response_days || ' days')::interval
  )
  RETURNING id INTO v_challenge_id;

  -- 5. Notify the challenged player
  PERFORM ladder.create_notification_internal(
    p_challenged_id,
    p_league_id,
    'challenge_received',
    v_challenger_name || ' has challenged you. You have '
      || v_no_response_days || ' days to respond.',
    NULL,
    v_challenge_id
  );

  RETURN v_challenge_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.create_challenge_secure(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.create_challenge_secure(text, uuid, uuid)
  TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- B-3. ORGANIZER RPC: create_challenge_for_organizer
-- Organizer-authenticated (JWT-based) challenge creation.
-- Follows the same lifecycle as player challenges: creates a pending challenge
-- and notifies the challenged player.  The challenged player must accept
-- before a match is created.  Delegates all business-rule validation to
-- validate_challenge_rules_internal.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.create_challenge_for_organizer(
  p_league_id     uuid,
  p_challenger_id uuid,
  p_challenged_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenger_name  text;
  v_no_response_days int;
  v_challenge_id     uuid;
BEGIN
  -- 1. Verify caller is an organizer of this league
  PERFORM ladder.assert_league_organizer(p_league_id);

  -- 2. Validate all challenge business rules (same path as player challenges)
  v_no_response_days := ladder.validate_challenge_rules_internal(
    p_challenger_id, p_challenged_id, p_league_id
  );

  -- 3. Fetch challenger name for notification
  SELECT name INTO v_challenger_name
    FROM ladder.players
   WHERE id = p_challenger_id;

  -- 4. Insert a pending challenge — challenged player must accept or decline
  INSERT INTO ladder.challenges (
    league_id, challenger_player_id, challenged_player_id,
    status, expires_at
  )
  VALUES (
    p_league_id, p_challenger_id, p_challenged_id,
    'pending', now() + (v_no_response_days || ' days')::interval
  )
  RETURNING id INTO v_challenge_id;

  -- 5. Notify the challenged player
  PERFORM ladder.create_notification_internal(
    p_challenged_id,
    p_league_id,
    'challenge_received',
    v_challenger_name || ' has challenged you. You have '
      || v_no_response_days || ' days to respond.',
    NULL,
    v_challenge_id
  );

  RETURN v_challenge_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.create_challenge_for_organizer(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.create_challenge_for_organizer(uuid, uuid, uuid)
  TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- B-3. PLAYER RPC: respond_to_challenge_secure
-- Token-authenticated challenge response: accept or decline.
--
-- Validates:
--   • Token → active player in the challenge's league (cross-league replay guard)
--   • Only the challenged player (challenged_player_id) may respond
--   • Challenge must be in 'pending' status
--   • Challenge must not be expired
--
-- On accept: atomically creates the match, links it to the challenge,
--   marks challenge 'accepted', notifies the challenger.
-- On decline: marks challenge 'declined', notifies the challenger.
-- Returns: new match UUID on accept, NULL on decline.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.respond_to_challenge_secure(
  p_token        text,
  p_challenge_id uuid,
  p_accept       boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id        uuid;
  v_player_league    uuid;
  v_challenger_id    uuid;
  v_challenged_id    uuid;
  v_challenge_league uuid;
  v_challenge_status text;
  v_expires_at       timestamptz;
  v_current_round    int;
  v_match_id         uuid;
  v_challenged_name  text;
BEGIN
  v_player_id := ladder.resolve_player_from_token(p_token);

  SELECT league_id INTO v_player_league
    FROM ladder.players
   WHERE id = v_player_id;

  SELECT challenger_player_id, challenged_player_id,
         league_id, status, expires_at
    INTO v_challenger_id, v_challenged_id,
         v_challenge_league, v_challenge_status, v_expires_at
    FROM ladder.challenges
   WHERE id = p_challenge_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenge_not_found';
  END IF;

  -- Cross-league token replay guard
  IF v_player_league IS DISTINCT FROM v_challenge_league THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  -- Only the challenged player may respond
  IF v_player_id <> v_challenged_id THEN
    RAISE EXCEPTION 'not_challenged_player';
  END IF;

  -- Challenge must be pending
  IF v_challenge_status <> 'pending' THEN
    RAISE EXCEPTION 'challenge_not_pending';
  END IF;

  -- Challenge must not be expired
  IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
    RAISE EXCEPTION 'challenge_expired';
  END IF;

  SELECT name INTO v_challenged_name
    FROM ladder.players
   WHERE id = v_challenged_id;

  IF p_accept THEN
    SELECT COALESCE(MAX(round_number), 1)
      INTO v_current_round
      FROM ladder.matches
     WHERE league_id = v_challenge_league;

    INSERT INTO ladder.matches (
      league_id, round_number, type, is_bye,
      p1_player_id, p2_player_id, status
    )
    VALUES (
      v_challenge_league, v_current_round, 'challenge', false,
      v_challenger_id, v_challenged_id, 'pending'
    )
    RETURNING id INTO v_match_id;

    UPDATE ladder.challenges
       SET status   = 'accepted',
           match_id = v_match_id
     WHERE id = p_challenge_id;

    PERFORM ladder.create_notification_internal(
      v_challenger_id, v_challenge_league, 'challenge_accepted',
      v_challenged_name || ' accepted your challenge. Your match is ready.',
      v_match_id, p_challenge_id
    );

    RETURN v_match_id;

  ELSE
    UPDATE ladder.challenges
       SET status = 'declined'
     WHERE id = p_challenge_id;

    PERFORM ladder.create_notification_internal(
      v_challenger_id, v_challenge_league, 'challenge_declined',
      v_challenged_name || ' declined your challenge.',
      NULL, p_challenge_id
    );

    RETURN NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.respond_to_challenge_secure(text, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.respond_to_challenge_secure(text, uuid, boolean)
  TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- C-1. PLAYER RPC: fetch_my_notifications
-- Token-authenticated notification fetch.
-- The token identifies the player; no player_id is accepted from the caller.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.fetch_my_notifications(p_token text)
RETURNS TABLE (
  id                   uuid,
  league_id            uuid,
  type                 text,
  message              text,
  read                 boolean,
  related_match_id     uuid,
  related_challenge_id uuid,
  created_at           timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_player_id uuid;
BEGIN
  v_player_id := ladder.resolve_player_from_token(p_token);

  RETURN QUERY
    SELECT
      n.id, n.league_id, n.type, n.message, n.read,
      n.related_match_id, n.related_challenge_id, n.created_at
    FROM ladder.notifications n
    WHERE n.player_id = v_player_id
    ORDER BY n.created_at DESC
    LIMIT 30;
END;
$$;

REVOKE ALL ON FUNCTION ladder.fetch_my_notifications(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.fetch_my_notifications(text)
  TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- C-2. PLAYER RPC: mark_my_notifications_read
-- Token-authenticated mark-read.
-- If p_notification_ids is NULL, marks all unread notifications for this
-- player as read.  Otherwise marks only the specified IDs (belonging to
-- this player).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.mark_my_notifications_read(
  p_token            text,
  p_notification_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id uuid;
BEGIN
  v_player_id := ladder.resolve_player_from_token(p_token);

  IF p_notification_ids IS NULL THEN
    UPDATE ladder.notifications
       SET read = true
     WHERE player_id = v_player_id
       AND read      = false;
  ELSE
    UPDATE ladder.notifications
       SET read = true
     WHERE player_id = v_player_id
       AND id        = ANY(p_notification_ids)
       AND read      = false;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.mark_my_notifications_read(text, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.mark_my_notifications_read(text, uuid[])
  TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- C-3. UPDATED: submit_match_result_secure
-- Identical to the prior version except: after updating the match status,
-- notifies the opposing player(s) that a score needs confirmation.
-- Singles: notifies the single opposing player.
-- Doubles: notifies every member of the opposing team.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.submit_match_result_secure(
  p_token    text,
  p_match_id uuid,
  p_result   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id      uuid;
  v_status         text;
  v_is_bye         boolean;
  v_p1_player      uuid;
  v_p2_player      uuid;
  v_p1_team        uuid;
  v_p2_team        uuid;
  v_league_id      uuid;
  v_submitter_side int;
  v_opp_player     uuid;
  v_opp_team       uuid;
  v_member         record;
BEGIN
  v_player_id := ladder.resolve_player_from_token(p_token);

  SELECT status, is_bye,
         p1_player_id, p2_player_id,
         p1_team_id,   p2_team_id,
         league_id
    INTO v_status, v_is_bye,
         v_p1_player, v_p2_player,
         v_p1_team,   v_p2_team,
         v_league_id
    FROM ladder.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_is_bye        THEN RAISE EXCEPTION 'bye_match';        END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'match_not_pending'; END IF;

  v_submitter_side := ladder.get_match_participant_side(v_player_id, p_match_id);

  PERFORM ladder.validate_match_result_payload(p_match_id, p_result);

  UPDATE ladder.matches
     SET status             = 'awaiting_confirmation',
         result             = p_result,
         submitted_by       = v_player_id,
         submitted_at       = now(),
         auto_confirm_after = now() + interval '48 hours'
   WHERE id = p_match_id;

  -- Notify opponent(s) that a score needs confirmation
  IF v_p1_player IS NOT NULL OR v_p2_player IS NOT NULL THEN
    v_opp_player := CASE WHEN v_submitter_side = 1 THEN v_p2_player ELSE v_p1_player END;
    IF v_opp_player IS NOT NULL THEN
      PERFORM ladder.create_notification_internal(
        v_opp_player, v_league_id, 'score_submitted',
        'A score was submitted for your match. Please confirm or dispute.',
        p_match_id, NULL
      );
    END IF;
  ELSE
    v_opp_team := CASE WHEN v_submitter_side = 1 THEN v_p2_team ELSE v_p1_team END;
    IF v_opp_team IS NOT NULL THEN
      FOR v_member IN
        SELECT player_id FROM ladder.team_members WHERE team_id = v_opp_team
      LOOP
        PERFORM ladder.create_notification_internal(
          v_member.player_id, v_league_id, 'score_submitted',
          'A score was submitted for your match. Please confirm or dispute.',
          p_match_id, NULL
        );
      END LOOP;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.submit_match_result_secure(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.submit_match_result_secure(text, uuid, jsonb)
  TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- C-4. UPDATED: confirm_match_result_secure
-- Identical to prior version except: after confirming, notifies the original
-- submitter that their score has been confirmed.
-- Singles: notifies the submitted_by player.
-- Doubles: notifies every member of the submitter's team.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.confirm_match_result_secure(
  p_token    text,
  p_match_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id      uuid;
  v_status         text;
  v_submitted_by   uuid;
  v_submitter_side int;
  v_confirmer_side int;
  v_p1_team        uuid;
  v_p2_team        uuid;
  v_league_id      uuid;
  v_submitter_team uuid;
  v_member         record;
BEGIN
  v_player_id := ladder.resolve_player_from_token(p_token);

  SELECT status, submitted_by, p1_team_id, p2_team_id, league_id
    INTO v_status, v_submitted_by, v_p1_team, v_p2_team, v_league_id
    FROM ladder.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;

  IF v_status <> 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'match_not_awaiting_confirmation';
  END IF;

  IF v_submitted_by IS NULL THEN
    RAISE EXCEPTION 'invalid_match_state';
  END IF;

  v_confirmer_side := ladder.get_match_participant_side(v_player_id, p_match_id);
  v_submitter_side := ladder.get_match_participant_side(v_submitted_by, p_match_id);

  IF v_submitter_side = v_confirmer_side THEN
    RAISE EXCEPTION 'cannot_confirm_own_submission';
  END IF;

  UPDATE ladder.matches
     SET status       = 'confirmed',
         confirmed_by = v_player_id,
         confirmed_at = now()
   WHERE id = p_match_id;

  -- Notify the original submitter
  IF v_p1_team IS NULL AND v_p2_team IS NULL THEN
    PERFORM ladder.create_notification_internal(
      v_submitted_by, v_league_id, 'score_confirmed',
      'Your submitted score has been confirmed.',
      p_match_id, NULL
    );
  ELSE
    v_submitter_team := CASE WHEN v_submitter_side = 1 THEN v_p1_team ELSE v_p2_team END;
    FOR v_member IN
      SELECT player_id FROM ladder.team_members WHERE team_id = v_submitter_team
    LOOP
      PERFORM ladder.create_notification_internal(
        v_member.player_id, v_league_id, 'score_confirmed',
        'Your submitted score has been confirmed.',
        p_match_id, NULL
      );
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.confirm_match_result_secure(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.confirm_match_result_secure(text, uuid)
  TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- C-5. UPDATED: open_match_dispute_secure
-- Identical to prior version except: after inserting the dispute, notifies
-- the original submitter that their score is being disputed.
-- Singles: notifies the submitted_by player.
-- Doubles: notifies every member of the submitter's team.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.open_match_dispute_secure(
  p_token         text,
  p_match_id      uuid,
  p_reason        text,
  p_counter_score jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id      uuid;
  v_status         text;
  v_submitted_by   uuid;
  v_submitter_side int;
  v_disputer_side  int;
  v_trimmed_reason text;
  v_p1_team        uuid;
  v_p2_team        uuid;
  v_league_id      uuid;
  v_submitter_team uuid;
  v_member         record;
BEGIN
  v_player_id      := ladder.resolve_player_from_token(p_token);
  v_trimmed_reason := trim(p_reason);

  IF v_trimmed_reason IS NULL OR v_trimmed_reason = '' THEN
    RAISE EXCEPTION 'reason_empty';
  END IF;

  IF length(v_trimmed_reason) > 1000 THEN
    RAISE EXCEPTION 'reason_too_long';
  END IF;

  SELECT status, submitted_by, p1_team_id, p2_team_id, league_id
    INTO v_status, v_submitted_by, v_p1_team, v_p2_team, v_league_id
    FROM ladder.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;

  IF v_status <> 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'match_not_awaiting_confirmation';
  END IF;

  IF v_submitted_by IS NULL THEN
    RAISE EXCEPTION 'invalid_match_state';
  END IF;

  v_disputer_side  := ladder.get_match_participant_side(v_player_id, p_match_id);
  v_submitter_side := ladder.get_match_participant_side(v_submitted_by, p_match_id);

  IF v_submitter_side = v_disputer_side THEN
    RAISE EXCEPTION 'cannot_dispute_own_submission';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ladder.disputes
     WHERE match_id = p_match_id
       AND status   <> 'resolved'
  ) THEN
    RAISE EXCEPTION 'dispute_already_open';
  END IF;

  UPDATE ladder.matches
     SET status = 'disputed'
   WHERE id = p_match_id;

  INSERT INTO ladder.disputes (
    match_id, opened_by, reason, counter_score, status, auto_escalate_after
  ) VALUES (
    p_match_id, v_player_id, v_trimmed_reason, p_counter_score, 'open',
    now() + interval '24 hours'
  );

  -- Notify the submitter their score is disputed
  IF v_p1_team IS NULL AND v_p2_team IS NULL THEN
    PERFORM ladder.create_notification_internal(
      v_submitted_by, v_league_id, 'score_disputed',
      'Your submitted score has been disputed. The organizer will review.',
      p_match_id, NULL
    );
  ELSE
    v_submitter_team := CASE WHEN v_submitter_side = 1 THEN v_p1_team ELSE v_p2_team END;
    FOR v_member IN
      SELECT player_id FROM ladder.team_members WHERE team_id = v_submitter_team
    LOOP
      PERFORM ladder.create_notification_internal(
        v_member.player_id, v_league_id, 'score_disputed',
        'Your submitted score has been disputed. The organizer will review.',
        p_match_id, NULL
      );
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.open_match_dispute_secure(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.open_match_dispute_secure(text, uuid, text, jsonb)
  TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- C-6. UPDATED: resolve_dispute_for_organizer
-- Identical to prior version except: after resolving, notifies all match
-- participants that the dispute has been resolved.
-- Singles: notifies p1_player_id and p2_player_id.
-- Doubles: notifies every member of both teams.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.resolve_dispute_for_organizer(
  p_match_id   uuid,
  p_resolution text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_league_id uuid;
  v_status    text;
  v_p1_player uuid;
  v_p2_player uuid;
  v_p1_team   uuid;
  v_p2_team   uuid;
  v_member    record;
BEGIN
  SELECT league_id, status,
         p1_player_id, p2_player_id,
         p1_team_id,   p2_team_id
    INTO v_league_id, v_status,
         v_p1_player, v_p2_player,
         v_p1_team,   v_p2_team
    FROM ladder.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  PERFORM ladder.assert_league_organizer(v_league_id);

  IF v_status NOT IN ('disputed', 'awaiting_confirmation') THEN
    RAISE EXCEPTION 'match_not_resolvable';
  END IF;

  UPDATE ladder.matches
     SET status       = 'confirmed',
         confirmed_by = NULL,
         confirmed_at = now()
   WHERE id = p_match_id;

  UPDATE ladder.disputes
     SET status      = 'resolved',
         resolution  = p_resolution,
         resolved_by = NULL,
         resolved_at = now()
   WHERE match_id = p_match_id
     AND status   <> 'resolved';

  -- Notify all participants
  IF v_p1_player IS NOT NULL OR v_p2_player IS NOT NULL THEN
    IF v_p1_player IS NOT NULL THEN
      PERFORM ladder.create_notification_internal(
        v_p1_player, v_league_id, 'dispute_resolved',
        'A dispute for your match has been resolved by the organizer.',
        p_match_id, NULL
      );
    END IF;
    IF v_p2_player IS NOT NULL THEN
      PERFORM ladder.create_notification_internal(
        v_p2_player, v_league_id, 'dispute_resolved',
        'A dispute for your match has been resolved by the organizer.',
        p_match_id, NULL
      );
    END IF;
  ELSE
    FOR v_member IN
      SELECT player_id FROM ladder.team_members
       WHERE team_id IN (v_p1_team, v_p2_team)
    LOOP
      PERFORM ladder.create_notification_internal(
        v_member.player_id, v_league_id, 'dispute_resolved',
        'A dispute for your match has been resolved by the organizer.',
        p_match_id, NULL
      );
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.resolve_dispute_for_organizer(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.resolve_dispute_for_organizer(uuid, text)
  TO authenticated;

COMMIT;
