# Ladder League — Pilot Support Runbook

**Audience:** App operator and support contact for the pilot period.

This runbook covers known support scenarios, who can resolve them, and the
correct resolution steps. Always prefer the least invasive action. Never delete
data to resolve a support issue unless the reporter explicitly consents and
engineering has confirmed it is safe.

---

## Separation of Responsibility

| Role             | Scope                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| **Organizer**    | Actions within the league dashboard — resending codes, re-entering scores, ending seasons |
| **App operator** | Account-level and deployment-level issues — checking the live site, clearing edge cases   |
| **Engineering**  | Code defects, unexpected database state, infrastructure failures                          |

---

## 1. Organizer Magic Link Not Received

**Symptoms:** Organizer submitted their email but received no link.

**Organizer steps:**

1. Check the spam / junk folder for an email from the app's domain.
2. Wait up to 5 minutes — email delivery can be delayed.
3. Try requesting a new link. Only one link is valid at a time.
4. Try a different email client or browser to rule out a rendering issue.

**Operator steps:**

1. Confirm the email address is correct and matches the organizer's registered address.
2. Check whether email delivery is operational (Supabase Auth email logs if accessible).
3. If the issue persists across multiple attempts, escalate to engineering.

**Engineering:**

- Investigate email provider delivery status and Supabase Auth configuration.

---

## 2. Expired Organizer Session

**Symptoms:** Organizer is signed in but the app returns them to the sign-in screen.

**Organizer steps:**

1. Request a new Magic Link.
2. Click the new link promptly after it arrives — links are single-use and expire.
3. Do not navigate away from the sign-in page while waiting for the link.

**Operator steps:**

- No action needed unless the organizer reports that new links consistently fail.

---

## 3. Player Code Rejected

**Symptoms:** Player enters their code and receives an error.

**Organizer steps:**

1. Open the league → header → **Players** panel.
2. Locate the player's code and confirm it matches what was sent.
3. Resend the invite message via "Copy invite message" and share it again.
4. Ask the player to try in a private/incognito browser window to rule out cached state.

**Common causes:**

- Typo in the code (codes are case-sensitive).
- Player entered the code for a different league.
- Player is at the wrong URL.

**Operator steps:**

- If codes consistently fail for all players on a league, escalate to engineering.

---

## 4. League Not Visible to Organizer

**Symptoms:** Organizer is signed in but does not see a specific league in My Leagues.

**Organizer steps:**

1. Check that the correct email address was used to sign in (the one that created the league).
2. Refresh the page.
3. If the league is Ended, look for an archived section in My Leagues.

**Operator steps:**

- Verify the organizer signed in with the same email that launched the league.
- If the league is missing after a deployment, escalate to engineering.

---

## 5. Stale Page After Deployment

**Symptoms:** App behaves unexpectedly after an update — buttons missing, old layout, JavaScript errors.

**Organizer and player steps:**

1. Hard refresh the page:
   - Mac/Windows Chrome: `Cmd+Shift+R` / `Ctrl+Shift+R`
   - Safari: hold `Shift` and click the refresh button
2. If that does not work, clear browser cache for the site (Settings → Privacy → Clear browsing data → limit to the site).
3. Try opening the URL in a fresh incognito window.

**Operator steps:**

- Confirm the deployment completed successfully.
- Check that the CDN has served the new build (cache headers).

---

## 6. Score Cannot Be Entered

**Symptoms:** "Record Official Score" button is missing or score form fails to submit.

**Organizer steps:**

1. Confirm the league is **Active** (not Ended or Archived — scores are read-only in those states).
2. Refresh the page and try again.
3. Check the browser console for a visible error message and note it.

**Player steps:**

1. Confirm the match is yours and that it is in the correct state (not already scored).
2. Refresh and try again.
3. If the form submits but the score does not appear, report it with the league name and match details.

**Operator steps:**

- If the organizer cannot enter a score on an Active league, escalate to engineering with the league ID and the error seen.

---

## 7. Challenge Cannot Be Issued

**Symptoms:** Issue Challenge button is missing, the target dropdown shows no eligible players, or submission fails.

**Organizer / player steps:**

1. Confirm the league is **Active**.
2. Confirm the challenger is not already ranked at the top — there must be someone in range above them.
3. Confirm the challenge window setting allows the intended challenge (e.g., within 2 spots above).
4. Refresh and try again.
5. If submission fails with an error, note the message and report it.

**Operator steps:**

- Verify the challenge window setting in the league's Settings panel.
- If the issue is not configuration-related, escalate to engineering.

---

## 8. Challenge Accepted But Match Not Visible

**Symptoms:** A challenge was accepted but no match appears in the schedule.

**Organizer / player steps:**

1. Refresh the page.
2. Check the **Schedule** tab — the match may appear there rather than in the Challenges tab.
3. If the match does not appear after a refresh, report the league name, challenger, and challenged player.

**Operator steps:**

- If the match is genuinely missing after acceptance, escalate to engineering. Do not attempt to manually create records.

---

## 9. Ended or Archived League Is Read-Only

**Symptoms:** A user cannot enter scores or issues challenges on an Ended or Archived league.

This is **expected behavior**. Ended and Archived leagues are intentionally read-only.

**Resolution:**

- If the league was ended prematurely, engineering can restore it to Active status. Log the request with the league name and reason.
- Organizers cannot undo End League themselves. Escalate to engineering if restoration is needed.

---

## 10. Mobile Display Issue

**Symptoms:** Layout is broken, text overlaps, or buttons are not tappable on mobile.

**User steps:**

1. Refresh the page.
2. Try rotating the device (landscape vs. portrait).
3. Try a different browser (Chrome, Safari, Firefox).
4. If using a very small screen (< 360px wide), note the device model and report it.

**Operator steps:**

- Document the device, OS version, and browser.
- Test on the same device if possible.
- Escalate if the issue is reproducible and blocks a core flow.

---

## 11. Persistent Console or Network Error

**Symptoms:** Browser developer tools show repeated errors; features are degraded.

**Organizer / player steps:**

1. Hard refresh.
2. Try an incognito window.
3. Note the exact error message (copy the red text from the Console tab).

**Operator steps:**

1. Check the Supabase dashboard for service status.
2. Check Vercel deployment logs for build or runtime errors.
3. Note the exact error and the URL that failed.
4. Escalate to engineering with the error text and network response code.

**Engineering:**

- Investigate RPC failures, authentication errors, or infrastructure issues based on the specific error.

---

## 12. Safe Browser Refresh

A normal refresh (`F5` or `Cmd+R`) reloads the page without clearing session data.
A hard refresh (`Cmd+Shift+R` or `Ctrl+Shift+R`) reloads and ignores cached files.

**Situations where a hard refresh is always safe:**

- After any deployment
- When the app behaves unexpectedly
- When a new feature is not visible despite being deployed

---

## 13. When Not to Delete Data

**Do not delete leagues, matches, or player records** to resolve a support issue unless:

- Engineering has confirmed the data is recoverable or expendable.
- The reporter explicitly consents.

If data must be cleared, document the action and the reason before proceeding.

---

## 14. When Engineering Investigation Is Required

Escalate to engineering when:

- An error persists across multiple browsers and devices after a hard refresh.
- A score submission, challenge, or launch fails consistently (not a one-off).
- A league that was Active disappears or shows incorrect status.
- Any error exposes internal system details to a user.
- A match or standings record appears to have incorrect data after a confirmed score.
- Any security or data-access concern is reported (e.g., a player seeing another player's data).

When escalating, include:

1. League name
2. Action that was being performed
3. Exact error message or screenshot
4. Browser and device
5. Time of occurrence
