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

## Status

Actively developed — local/dev setup, not yet deployed to production.
