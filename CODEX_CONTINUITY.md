# QuickFill Continuity

QuickFill's permanent source of truth is this repository and the Vercel project connected to `master`.

## Production Foundation

- Vercel project: `quickfill`
- Production domains: `getquickfill.com`, `www.getquickfill.com`
- Database: Neon Postgres resource `neon-blue-pillar`
- Billing: Stripe subscriptions for Pro and Business tiers
- Cache/rate limits: Upstash Redis

## Operating Rules

1. Commit durable changes to GitHub `master` or a reviewed branch.
2. Keep secrets in Vercel environment variables only.
3. Apply database migrations before code that depends on new tables.
4. Verify production after every deploy with the homepage, pricing, editor, checkout, and usage flow.

## Money Path Notes

- Checkout must treat Stripe as the source of truth for paid access.
- If a signed-in user has a past-due Stripe subscription, route them to repair the open invoice or billing portal before creating a new checkout session.
- If the app loses the cached Stripe customer mapping, recover it by matching the signed-in email to the existing Stripe customer and cache the mapping again.

## Current Status

The database schema has been provisioned and this repo contains the migration, health check, billing store, entitlement lookup, rate-limit policy, and long-haul runbooks needed to keep building QuickFill.