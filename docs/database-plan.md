# Database Plan

QuickFill uses Neon Postgres for durable production state.

## Tables

- `app_users`: Clerk user mapping and email identity.
- `subscriptions`: current subscription state by user.
- `stripe_events`: idempotency ledger for Stripe webhooks.
- `usage_events`: append-only usage telemetry.
- `audit_events`: admin and security-relevant activity.

## Principles

- Redis may speed up reads, but Postgres remains the durable record.
- Stripe webhooks should be idempotent through `stripe_events`.
- Usage data should be append-only so reporting can be rebuilt.
- New schema changes should be added as migrations under `db/migrations/`.
