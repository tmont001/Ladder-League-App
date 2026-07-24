# Tennis Ladder League App

A web app for running a tennis club's ladder league — players join a league, get ranked, and challenge each other to matches to move up the ladder.

## Features

- League setup flow for organizers (multi-step configuration)
- Launch codes for players to join a league
- Player picker and ranked ladder view
- Supabase-backed authentication and data storage

## Tech Stack

- **Frontend:** React
- **Backend:** Node.js/Express, PostgreSQL
- **Auth & Data:** Supabase
- **API docs:** Swagger/OpenAPI (via `swagger-ui-express`)

## Getting Started

```bash
npm install
cp .env.example .env   # add your Supabase URL and anon key
npm start
```

## Project Structure

```
src/
  components/   # LeagueSetup, LaunchCodesScreen, HomeScreen, PlayerPicker, PlayerJoinScreen
  context/       # app-level React context
  lib/           # Supabase client and API helpers
  utils/
supabase/
  schema.sql     # database schema
```

## Pilot Documentation

| Document                                                         | Audience                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Organizer Guide](docs/PILOT_ORGANIZER_GUIDE.md)                 | League organizers — creating leagues, managing players, score entry, lifecycle |
| [Player Guide](docs/PILOT_PLAYER_GUIDE.md)                       | Players — joining with a code, submitting scores, issuing challenges           |
| [QA Checklist](docs/PILOT_QA_CHECKLIST.md)                       | Testers — structured pass/fail checklist covering all pilot flows              |
| [Support Runbook](docs/PILOT_SUPPORT_RUNBOOK.md)                 | App operator — troubleshooting guide with escalation steps                     |
| [Feedback Log](docs/pilot-feedback.md)                           | All pilot participants — issue template and prioritized summary table          |
| [Release Notes v0.1.0-pilot](docs/RELEASE_NOTES_v0.1.0-pilot.md) | All stakeholders — feature summary and known limitations                       |

## Status

Ready for first external pilot
