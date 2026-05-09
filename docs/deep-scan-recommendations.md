# QuickFill Deep Scan Recommendations

Last updated: 2026-05-09

This is the permanent backlog for keeping QuickFill stable as it grows. Keep this file focused on recommendations that affect reliability, revenue, security, or the ability to support many users over time.

## Already Completed

- Production database is connected through Neon Postgres.
- Initial database schema is installed.
- Redis-backed rate limits are in place for high-risk flows.
- Stripe live products and Pro pricing are configured.
- Stripe webhooks are idempotent through the `stripe_events` table when the database is available.
- Admin operations dashboard exists at `/admin/ops`.
- Admin health endpoint exists at `/api/admin/health`.
- Daily Vercel cron health monitor exists at `/api/cron/health-check`.
- Production smoke script exists as `pnpm smoke:production`.
- Stripe reconciliation script exists as `pnpm billing:reconcile`.
- Broken admin user links to the removed customer-detail route have been removed.

## Highest Priority

1. Add `CRON_SECRET` in Vercel Production and Preview.
   The scheduled monitor route requires this secret. Without it, Vercel can deploy the cron route, but the protected health check cannot be trusted.

2. Add `QUICKFILL_ALERT_EMAILS` in Vercel.
   Health-check failures should notify a real inbox. Use `QUICKFILL_ALERT_FROM` only if the default sender is not verified in Resend.

3. Enable Vercel Web Analytics and Speed Insights.
   Web Analytics gives product traffic visibility. Speed Insights gives real-user performance visibility. These are dashboard actions, then the app can be tuned from real data.

4. Enable two-factor authentication on the Vercel account.
   This protects production deploy access and domain control.

5. Decide Business annual pricing.
   Either create the annual Business Stripe price and set `STRIPE_BUSINESS_ANNUAL_PRICE_ID`, or keep Business annual hidden from public checkout paths.

## Next Engineering Work

1. Rebuild customer detail as a small, safe admin view.
   Previous dynamic customer detail work broke the production build. Reintroduce it later in a very small slice: stored app data first, Stripe details second, tests third.

2. Add a recurring billing reconciliation rhythm.
   Run `pnpm billing:reconcile` monthly and after any Stripe webhook changes. Use `pnpm billing:reconcile --strict` when you want mismatches to fail the run.

3. Make production smoke checks part of release habit.
   Default checks now cover `/` and `/pricing`. Add more public paths through `QUICKFILL_SMOKE_PATHS` or `QUICKFILL_MONITOR_PATHS` when those routes become critical.

4. Add durable backup/export procedure.
   Before QuickFill has thousands of users, define how subscription records, usage events, and audit events are backed up or exported.

5. Add a load-test threshold document.
   Define acceptable response times and error rates for checkout, usage, PDF fill, and auth-protected flows before any large marketing push.

## Scaling Watchlist For 10,000+ Users

- Upgrade Vercel from Hobby before serious public traffic.
- Move the cron schedule from daily to hourly after upgrading Vercel.
- Track Neon database storage, compute, and connection behavior before the free tier becomes tight.
- Keep Redis rate limiting enabled and review abuse patterns weekly.
- Monitor Stripe webhook delivery after every billing change.
- Keep the Vercel deployment rollback path clear and documented.

## Useful Official References

- Vercel cron jobs: https://vercel.com/docs/cron-jobs
- Vercel `vercel.json` cron configuration: https://vercel.com/docs/project-configuration/vercel-json
- Vercel Web Analytics: https://vercel.com/docs/analytics
- Vercel Speed Insights: https://vercel.com/docs/speed-insights
- Vercel deployment protection and automation bypass: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
