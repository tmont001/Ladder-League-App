Ladder League — Local Setup

Minimal instructions to run the API and frontend locally.

Prerequisites

- Node.js (16+)
- npm
- PostgreSQL / Supabase (optional; needed to run migrations)

Quick start

1. Install dependencies

```bash
npm install
```

2. Create a `.env` with your Postgres connection string

```
DATABASE_URL=postgres://user:pass@host:5432/dbname
```

3. Run the DB migration (choose one):

- Using psql (quick):

```bash
psql "$DATABASE_URL" -f supabase/migrations/001_create_ladder_schema.sql
```

- Using Supabase CLI: import the SQL file as a migration into your Supabase project (see Supabase docs).

4. Start the API server

```bash
npm run start:api
```

- API server defaults to port `4000` (set `PORT` env to override).
- Open API docs at: http://localhost:4000/docs

5. Start the frontend (React app)

```bash
npm start
```

Background jobs

- Expire challenges (run periodically):

```bash
node backend/jobs/expireChallengesJob.js
```

- Auto-approve matches job (run periodically):

```bash
node backend/jobs/autoApproveMatchesJob.js
```

Notes

- The API expects a `DATABASE_URL` env var.
- Email delivery is stubbed to `outbox_emails`; integrate SendGrid/Mailgun later.
- Movement rules, settings, and seeds live in `league_settings` (JSONB). Default settings are provided in the migration comments.

Next steps (suggested)

- Wire frontend flows to the API endpoints in `/api/*`.
- Implement notifications and background worker scheduling (cron or serverless scheduled functions).
