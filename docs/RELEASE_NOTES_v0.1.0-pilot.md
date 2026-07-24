# Release Notes — v0.1.0-pilot

**Release type:** Pilot  
**Status:** Production — first external pilot  
**Date:** 2025

---

## What's Included

### Multi-League Organizer Workspace

Organizers can create and manage multiple leagues from a single account. Each league is independent with its own players, schedule, scores, standings, and lifecycle state. Organizers can switch between leagues without signing in again.

### Magic Link Authentication

Organizers sign in via a one-time email link. No password is required. Sessions persist across page loads within the same browser until the session expires.

### Player Access Codes

Each player receives a unique access code generated at league launch. Players enter the code to access their league view — no account creation or password required. Codes are scoped per league; a player in multiple leagues has a separate code for each.

### Supported Sports

Tennis, Pickleball, and Padel are supported. All three sports share the same league structures, scoring flows, lifecycle, and challenge mechanics. Tennis and Padel use set/game scoring; Pickleball uses a point-game format.

### Singles and Doubles

Both Singles and Doubles formats are supported for Round Robin leagues. Match format options include Best of 1, Best of 3, and Best of 5. Doubles is Singles-based for Ladder challenges in this release.

### Round Robin Mode

A full match schedule is generated at launch using the circle-method round-robin algorithm. The number of rounds is configurable from 2 to 16. Standings are derived from match results (wins, sets, games). Round 1 matchups are previewed before launch. Byes are handled automatically for odd player counts.

### Ladder Mode

In Ladder mode, no schedule is pre-generated. Players move up the rankings by issuing and accepting challenges. The challenge window (how many positions above themselves a player may challenge) is set at league creation. Match results update ladder positions in real time.

### Score Confirmation and Disputes

Players submit their own match scores, which require confirmation by the opponent before they are recorded. Opponents can confirm or dispute. Disputed matches are flagged for organizer review. Organizers may enter official scores at any time without requiring player confirmation.

### Challenges and Notifications

Ladder challenges trigger in-app notifications for the challenged player. Score submissions trigger notifications for the opponent. Notifications appear in the header bell icon with an unread badge count.

### League Lifecycle

Leagues progress through a defined lifecycle:

- **Active** — in progress; all actions available.
- **Ended** — season complete; all data preserved read-only.
- **Archived** — ended and tidied away; still fully readable.

Organizers can End, Archive, Restore, Duplicate, and Delete leagues. All state transitions are gated by confirmation dialogs.

### Duplication as a New Season

A league can be duplicated to start a fresh season with the same players and settings. The duplicated league has no match history and issues new player codes.

### Responsive Interface

The application is designed for both desktop and mobile browsers. All core flows — joining with a code, submitting scores, issuing challenges — are accessible on small screens without a native app.

### Accessibility Improvements

Focus management, keyboard navigation, scroll lock, and ARIA attributes are implemented across all modals and dialogs. High-contrast color ratios are maintained in both light and dark modes.

### Atomic League Launch

League creation is performed in a single atomic database transaction. Either the full league (players, teams, schedule, codes) is created successfully or nothing is committed — no partial state.

### Production Error-Handling Foundation

User-facing error messages are safe and generic. Internal system details, database errors, and infrastructure information are not exposed to end users. All score submissions, challenge actions, and lifecycle transitions are validated on the server before being applied.

---

## Known Limitations

- **Doubles challenges are not yet available.** In Ladder mode, the challenge flow is limited to Singles. Doubles leagues can be created and scored, but Ladder challenges between doubles teams are disabled in this release.
- **No email or push notifications.** Notifications are in-app only. Players must open the app to see that an opponent submitted a score or issued a challenge.
- **Organizer session expiry requires a new Magic Link.** There is no persistent "remember me" session. If the browser is closed or the session expires, the organizer must request a new link.
- **Single league per player code.** A player who participates in multiple leagues held by the same organizer requires a separate code for each league. There is no unified player account.
- **No scheduling integration.** The app records scores and manages standings but does not schedule court times, send calendar invitations, or integrate with external booking systems.
- **No match time or location fields.** Match records do not currently include court number, scheduled time, or location data.
- **Ratings are set at launch only.** Player ratings used for seeding are captured at the time of league creation. They are not updated automatically based on match outcomes.
