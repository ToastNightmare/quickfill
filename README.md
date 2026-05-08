# QuickFill

QuickFill is a Next.js app for filling Australian PDF forms quickly, safely, and accurately.

## Core Stack

- Next.js App Router on Vercel
- Clerk authentication
- Stripe subscriptions
- Neon Postgres for durable billing and usage state
- Upstash Redis for rate limits and fast counters
- OpenAI-assisted field detection

## Local Development

```bash
pnpm install
pnpm dev
```

## Verification

```bash
pnpm verify:app
pnpm load:smoke
```

## Database

The production database is Neon Postgres. The foundation migration lives at `db/migrations/0001_foundation.sql`.

```bash
pnpm db:migrate
```

## Long-Term Maintenance

Start with `CODEX_CONTINUITY.md`, then use the docs in `docs/` for scaling, database, and operating procedures.
