# Production Activation Status

Last updated: 2026-05-09

## Done

- Stripe account connected in live mode.
- Pro monthly, Pro annual, and Business monthly prices configured.
- One active live Stripe subscription exists.
- Neon Postgres resource created and connected to Vercel.
- Production and Preview database environment variables provisioned.
- Initial database schema created.
- Root `proxy.ts` added for Next.js production routing.
- Vercel install/build settings added.
- Production foundation docs added.
- Latest verified production build passed on commit `07b2b1f` (`Update maintenance runbook for ops health`).
- Admin ops health page added at `/admin/ops`.
- Admin health endpoint expanded at `/api/admin/health`.
- Production smoke checklist added in `docs/production-smoke-checklist.md`.

## Known Warnings

- Business annual Stripe price is not configured yet. Either add `STRIPE_BUSINESS_ANNUAL_PRICE_ID` or keep Business annual hidden from public purchase paths.
- Vercel Web Analytics is not enabled from the dashboard yet.
- Vercel Speed Insights is not enabled from the dashboard yet.
- The Vercel personal dashboard shows a secure-account recommendation for two-factor authentication.

## Stripe Snapshot

- Pro monthly: `price_1THN0xDHSWqka0tSkdGgAf8v` at A$12/month.
- Pro annual: `price_1TUgtxDHSWqka0tSe6I8pfzz` at A$100/year.
- Business monthly: `price_1THN0wDHSWqka0tSBC150r3j` at A$29/month.
- Business annual: not configured.

## Next Checks

- Visit `/admin/ops` as an admin and confirm no blockers.
- Confirm `/api/admin/health` works for an admin account.
- Run the production smoke checklist end to end.
- Confirm Stripe webhook events are received after a checkout test.
- Enable Vercel Web Analytics and Speed Insights from the dashboard.
