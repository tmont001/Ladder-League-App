# Ladder League — Pilot QA Checklist

## Tester Information

| Field | Value |
|---|---|
| **Tester name** | |
| **Date** | |
| **Device** | |
| **Browser / version** | |
| **OS** | |
| **League name used** | |
| **Production URL** | |

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Pass |
| ❌ | Fail |
| ⚠️ | Pass with notes |
| — | Not applicable / skipped |

---

## 1. Organizer Sign-In

| # | Check | Result | Notes |
|---|---|---|---|
| 1.1 | Magic Link sign-in flow loads without error | | |
| 1.2 | Entering email and clicking Send Link shows confirmation message | | |
| 1.3 | Magic Link email is received within 2 minutes | | |
| 1.4 | Clicking the link signs in and lands on My Leagues | | |
| 1.5 | Re-requesting a new link works after the first link is used | | |
| 1.6 | Expired link shows a clear error message, not a blank screen | | |

---

## 2. Player Code Sign-In

| # | Check | Result | Notes |
|---|---|---|---|
| 2.1 | Player code entry form is visible on home screen | | |
| 2.2 | Valid code enters the league dashboard | | |
| 2.3 | Invalid code shows a clear error message | | |
| 2.4 | Code persists after browser refresh (player stays in league) | | |
| 2.5 | Returning to the URL re-enters the correct player session | | |

---

## 3. Round Robin League Creation

| # | Check | Result | Notes |
|---|---|---|---|
| 3.1 | New League flow starts correctly from My Leagues | | |
| 3.2 | Round Robin mode selected; Rounds slider appears | | |
| 3.3 | Auto-advance rounds toggle is visible and interactive | | |
| 3.4 | Step 2 displays Round 1 Preview when ≥ 2 players are added | | |
| 3.5 | Rounds stepper in the review panel adjusts the preview | | |
| 3.6 | Launch dialog appears and confirms launch | | |
| 3.7 | League appears in My Leagues after launch | | |
| 3.8 | Full schedule is generated in the Schedule tab | | |

---

## 4. Ladder League Creation

| # | Check | Result | Notes |
|---|---|---|---|
| 4.1 | Ladder mode selected; Rounds slider is hidden | | |
| 4.2 | Challenge window slider is visible | | |
| 4.3 | Auto-advance toggle is hidden | | |
| 4.4 | "Ladder matches are created when challenges are accepted" text appears | | |
| 4.5 | Step 2 shows no Round 1 Preview | | |
| 4.6 | Step 2 shows "How Ladder Works" card | | |
| 4.7 | Launch succeeds with no HTTP error | | |
| 4.8 | No pre-scheduled matches in Schedule tab | | |

---

## 5. Player Codes

| # | Check | Result | Notes |
|---|---|---|---|
| 5.1 | Codes screen appears immediately after launch | | |
| 5.2 | Each player has a unique code | | |
| 5.3 | "Copy code" button works | | |
| 5.4 | "Copy invite message" includes URL and code | | |
| 5.5 | Players panel accessible from league header after launch | | |
| 5.6 | Codes remain correct after page refresh | | |

---

## 6. Organizer Score Entry

| # | Check | Result | Notes |
|---|---|---|---|
| 6.1 | "Enter Score" button appears on an active match | | |
| 6.2 | Score form accepts valid set scores | | |
| 6.3 | Score is recorded immediately without player confirmation | | |
| 6.4 | Standings update after score entry | | |
| 6.5 | Score entry is blocked on Ended or Archived leagues | | |

---

## 7. Player Score Submission

| # | Check | Result | Notes |
|---|---|---|---|
| 7.1 | Player can see and open their match | | |
| 7.2 | Score submission form appears and accepts values | | |
| 7.3 | Submission shows a pending/confirmation state | | |
| 7.4 | Opponent receives a notification after submission | | |

---

## 8. Score Confirmation

| # | Check | Result | Notes |
|---|---|---|---|
| 8.1 | Opponent sees "Confirm" and "Dispute" options | | |
| 8.2 | Confirming records the score and updates standings | | |
| 8.3 | Match shows as completed after confirmation | | |

---

## 9. Score Dispute

| # | Check | Result | Notes |
|---|---|---|---|
| 9.1 | Clicking Dispute flags the match | | |
| 9.2 | Disputed match is visible in the organizer's dashboard | | |
| 9.3 | Organizer can enter the official score to resolve it | | |
| 9.4 | Resolved score updates standings correctly | | |

---

## 10. Ladder Challenges

| # | Check | Result | Notes |
|---|---|---|---|
| 10.1 | Challenges tab is visible in Ladder league | | |
| 10.2 | Organizer can open Issue Challenge dialog | | |
| 10.3 | Only eligible targets appear (within challenge window) | | |
| 10.4 | Challenge is created and visible in the tab | | |
| 10.5 | Challenged player receives a notification | | |
| 10.6 | Player can accept a challenge | | |
| 10.7 | Accepted challenge creates a match in the schedule | | |
| 10.8 | Player can decline a challenge | | |
| 10.9 | Declined challenge closes without creating a match | | |
| 10.10 | Issuing a challenge outside the window is blocked with an error | | |

---

## 11. League Switching

| # | Check | Result | Notes |
|---|---|---|---|
| 11.1 | My Leagues shows all launched leagues | | |
| 11.2 | Navigating between leagues shows the correct league data | | |
| 11.3 | No data from one league leaks into another | | |

---

## 12. Ended League — Read-Only Behavior

| # | Check | Result | Notes |
|---|---|---|---|
| 12.1 | End League action is available in an Active league | | |
| 12.2 | Confirm dialog appears before ending | | |
| 12.3 | League status changes to Ended | | |
| 12.4 | Score entry is blocked with a clear message | | |
| 12.5 | Challenge issuance is blocked | | |
| 12.6 | All historical data (scores, standings) remains visible | | |

---

## 13. Archive and Restore

| # | Check | Result | Notes |
|---|---|---|---|
| 13.1 | Archive action is available on an Ended league | | |
| 13.2 | Archived league moves to the archive view | | |
| 13.3 | Archived league is still readable (no data loss) | | |
| 13.4 | Restore moves the league back to the main list as Ended | | |

---

## 14. Duplicate as New Season

| # | Check | Result | Notes |
|---|---|---|---|
| 14.1 | Duplicate action opens a name-entry dialog | | |
| 14.2 | New league is created with the same players and settings | | |
| 14.3 | Duplicated league has no match history | | |
| 14.4 | Duplicated league has new player codes | | |
| 14.5 | Round Robin duplicate generates a fresh schedule after launch | | |
| 14.6 | Ladder duplicate has no pre-scheduled matches | | |

---

## 15. Deletion

| # | Check | Result | Notes |
|---|---|---|---|
| 15.1 | Delete action prompts for the league name | | |
| 15.2 | Wrong name prevents deletion | | |
| 15.3 | Correct name confirms and deletes | | |
| 15.4 | Deleted league no longer appears in My Leagues | | |

---

## 16. Notifications

| # | Check | Result | Notes |
|---|---|---|---|
| 16.1 | Bell icon appears in the league header | | |
| 16.2 | Unread count badge appears when new notifications exist | | |
| 16.3 | Opening notifications marks them as read | | |
| 16.4 | Score submission triggers notification for opponent | | |
| 16.5 | Challenge creation triggers notification for challenged player | | |

---

## 17. Mobile Layout

| # | Check | Result | Notes |
|---|---|---|---|
| 17.1 | Home / join screen is usable on a small screen | | |
| 17.2 | League dashboard tabs are reachable on mobile | | |
| 17.3 | Score entry form is usable without horizontal scrolling | | |
| 17.4 | Challenge form is usable on mobile | | |
| 17.5 | My Leagues list is legible on mobile | | |
| 17.6 | Modals do not overflow the viewport | | |

---

## 18. Light and Dark Mode

| # | Check | Result | Notes |
|---|---|---|---|
| 18.1 | App respects device light/dark mode preference | | |
| 18.2 | All text is readable in both modes | | |
| 18.3 | Buttons and input fields are visible in both modes | | |
| 18.4 | No invisible-on-background text in either mode | | |

---

## 19. Console and Network Errors

| # | Check | Result | Notes |
|---|---|---|---|
| 19.1 | No unhandled errors in browser console on page load | | |
| 19.2 | No red network requests (4xx/5xx) on normal flows | | |
| 19.3 | Failed RPC calls show user-friendly messages, not raw errors | | |
| 19.4 | Supabase or database error details are not exposed to users | | |

---

## 20. Padel Sport

| # | Check | Result | Notes |
|---|---|---|---|
| 20.1 | Padel appears as a selectable sport in league creation | | |
| 20.2 | Padel icon renders in the sport selector | | |
| 20.3 | **Singles Round Robin** — Padel selected; round count and set/game format controls visible | | |
| 20.4 | **Singles Round Robin** — Round 1 Preview shows after players are added | | |
| 20.5 | **Singles Round Robin** — Launch succeeds; schedule is generated; player codes issued | | |
| 20.6 | **Singles Round Robin** — Score entry uses set/game format (not Pickleball point format) | | |
| 20.7 | **Doubles Round Robin** — Padel Doubles launch succeeds; teams are formed correctly | | |
| 20.8 | **Doubles Round Robin** — Doubles schedule is generated; codes issued | | |
| 20.9 | **Singles Ladder** — Padel selected; Rounds slider hidden; challenge window visible | | |
| 20.10 | **Singles Ladder** — Launch succeeds; no pre-scheduled matches; challenges available | | |
| 20.11 | **Singles Ladder** — Issuing a challenge works; accepted challenge creates a match | | |
| 20.12 | Padel league icon appears correctly on My Leagues cards | | |
| 20.13 | Padel league icon appears correctly in the dashboard header | | |
| 20.14 | **Duplication** — Duplicate a Padel league; new league preserves sport = Padel | | |
| 20.15 | **Duplication** — Duplicated Padel Round Robin generates a fresh schedule | | |
| 20.16 | **Duplication** — Duplicated Padel Ladder has no pre-scheduled matches | | |
| 20.17 | Switching Tennis → Padel → Pickleball does not lose player list or mode selection | | |
| 20.18 | Existing Tennis leagues still load and score correctly | | |
| 20.19 | Existing Pickleball leagues still load and score correctly | | |

---

## Summary

| Category | Pass | Fail | Notes |
|---|---|---|---|
| Organizer Sign-In | | | |
| Player Code Sign-In | | | |
| Round Robin Creation | | | |
| Ladder Creation | | | |
| Player Codes | | | |
| Score Entry | | | |
| Player Submission | | | |
| Confirmation | | | |
| Dispute | | | |
| Challenges | | | |
| League Switching | | | |
| Ended Read-Only | | | |
| Archive / Restore | | | |
| Duplicate | | | |
| Deletion | | | |
| Notifications | | | |
| Mobile | | | |
| Light/Dark Mode | | | |
| Console/Network | | | |
| **Padel Sport** | | | |
| **Total** | | | |
