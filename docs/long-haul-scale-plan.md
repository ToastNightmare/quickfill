# QuickFill Long-Haul Scale Plan

This is the standing plan for growing QuickFill toward 10,000+ users without losing reliability, trust, or billing accuracy.

## Current Priorities

1. Keep PDF editing and export correctness protected by automated tests.
2. Keep production deploys observable through Vercel, the admin ops page, and health checks.
3. Keep billing and usage state reconciled between Stripe, Redis, and Postgres.
4. Upgrade infrastructure before traffic pushes against free or hobby limits.
5. Make operational knowledge permanent in docs, scripts, and admin tools.

## Product Reliability

- Keep whiteout below user-added text, checkbox, comb, date, and signature fields in editor state and export order.
- Add regression tests whenever a PDF rendering, coordinate, layering, or export bug is fixed.
- Maintain a small fixture pack of PDFs that represent real customer forms: simple PDF, AcroForm, scanned-looking PDF, multi-page form, and boxed character form.
- Before release campaigns, run a manual PDF upload/fill/download test on production.
- Track failed exports in admin logs and review them weekly.

## Production Monitoring

- Use `/admin/ops` before and after every production deploy.
- Use `/api/admin/health` for machine-readable admin-only health checks.
- Keep `/api/cron/health-check` active with `CRON_SECRET` configured.
- Enable Vercel Web Analytics and Speed Insights from the Vercel dashboard.
- Keep Sentry configured for production error triage.
- Configure `QUICKFILL_ALERT_EMAILS` and verified Resend sender settings for monitor failures.

## Data and Billing

- Neon Postgres is the system of record for durable operational and subscription data.
- Upstash Redis is used for rate limits, usage counters, and short-lived operational lists.
- Stripe webhook events must be reviewed after every billing change.
- Run `pnpm billing:reconcile` monthly and `pnpm billing:reconcile --strict` before major billing changes.
- Do not launch a pricing option until the corresponding Stripe price id is configured in Production and Preview.

## Scaling Triggers

Upgrade or revisit architecture when any of these are true:

- Vercel function invocations or CPU usage regularly approach Hobby limits.
- Neon storage or compute reaches 70% of the current plan.
- Redis command volume or rate-limit keys grow faster than expected.
- PDF exports start timing out for normal customer forms.
- Failed-download rate rises above 1% for a day.
- Stripe webhook failures appear after a deploy.
- Support reports cluster around upload, export, payment, or sign-in.

## 10,000+ User Readiness

Before sustained growth campaigns:

1. Upgrade Vercel to Pro or the appropriate business tier.
2. Upgrade Neon beyond the free tier and define backup/export policy.
3. Confirm Redis limits and retention are appropriate for traffic.
4. Confirm Sentry, Vercel logs, and admin health checks are active.
5. Add at least one production smoke automation that checks homepage, pricing, sign-in redirect, and a safe API health route.
6. Review rate limits for uploads, exports, checkout starts, support forms, and auth-adjacent endpoints.
7. Add a written incident rollback path for Vercel deploys and Stripe billing issues.

## Backlog Worth Doing Next

- Visible layer controls in the editor panel: bring forward, send backward, bring to front, send to back.
- Export fixture tests for whiteout plus text/signature over the same area.
- Admin page section for recent failed downloads and recent health check runs.
- A production smoke script that can run safely with a QA token.
- A release checklist in GitHub pull requests before merging major editor, billing, or auth changes.
