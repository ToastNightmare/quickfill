# Maintenance Runbook

## After Every Deploy

1. Confirm Vercel deployment is Ready.
2. Visit the homepage and pricing page.
3. Sign in with an admin account and open `/admin/ops`.
4. Confirm `/api/admin/health` reports no blockers.
5. Open the editor and confirm a PDF can be loaded.
6. Check `/api/usage` returns a non-500 response.
7. Review Vercel logs for new errors.
8. Review Stripe webhook delivery if billing code changed.
9. Run `pnpm smoke:production` when a normal terminal is available.

## Scheduled Health Monitor

- Vercel runs `/api/cron/health-check` daily from `vercel.json` while the project is on Hobby.
- Move the schedule to hourly after upgrading to Vercel Pro.
- The route requires `CRON_SECRET` in Vercel Production and Preview environment variables.
- The monitor checks the public homepage, database, Redis, Stripe config, Clerk config, and optional alerting tools.
- Each run writes an `ops_health_check_ok` or `ops_health_check_failed` event to `audit_events` when the database is reachable.
- Alerts are sent through Resend when `RESEND_API_KEY` and `QUICKFILL_ALERT_EMAILS` are configured.
- Set `QUICKFILL_ALERT_FROM` if the default `QuickFill <alerts@getquickfill.com>` sender is not verified in Resend.
- Set `QUICKFILL_MONITOR_PATHS` as a comma-separated list to check more public paths, for example `/,/pricing`.
- Run `pnpm smoke:production` for a manual public smoke check.

## Weekly

- Check Stripe failed webhook events.
- Review Vercel usage, function invocations, and error rate.
- Confirm database storage and compute remain within plan.
- Run a smoke check against production using `docs/production-smoke-checklist.md`.
- Review `/admin/analytics` for checkout, subscription, usage, and failed-download signals.
- Check `/admin/ops` for missing optional services before marketing or support pushes.
- Review `docs/deep-scan-recommendations.md` and move one priority item forward.

## Monthly

- Run `pnpm billing:reconcile` and investigate any mismatches.
- Run `pnpm billing:reconcile --strict` before major billing changes.
- Review rate-limit policy and abuse patterns.
- Export or snapshot key operational records.
- Confirm admin emails and support access are still correct.
- Review pricing, limits, and plan copy against Stripe products.

## Scaling Watchlist

- Upgrade Vercel plan before sustained production traffic exceeds Hobby limits.
- Upgrade Neon before storage or compute approaches the free-tier ceiling.
- Keep Redis rate limiting enabled before public launch campaigns.
- Add Business annual pricing before offering annual Business checkout.
- Enable Vercel Web Analytics and Speed Insights from the dashboard.
- Define a backup/export procedure for subscriptions, usage events, and audit events.

## Incident Response

- If production breaks after a deploy, use Vercel Instant Rollback first.
- If billing access is wrong, verify Stripe event delivery and subscription records, then run `pnpm billing:reconcile`.
- If database connectivity fails, check `DATABASE_URL` and Neon resource status.
- If rate limits fail open or closed, check Upstash Redis environment variables and usage.
- If a build fails, open the newest Vercel build logs and fix the first TypeScript or install error before retrying.
