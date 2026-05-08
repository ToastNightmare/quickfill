# Production Smoke Checklist

Use this after every production deploy and before any public launch, ad spend, or larger customer invite.

## Automated Checks

1. Confirm the newest Vercel deployment is `Ready`.
2. Confirm the scheduled `/api/cron/health-check` run is succeeding after `CRON_SECRET` is configured.
3. Run `pnpm smoke:production` for a manual public smoke check when working locally or from CI.
4. Review recent `ops_health_check_ok` and `ops_health_check_failed` rows in `audit_events` if production behavior looks unusual.

## Owner Check

1. Confirm the newest Vercel deployment is `Ready` and assigned to `getquickfill.com`.
2. Visit `https://getquickfill.com` in a private browser window.
3. Open the pricing area and confirm the visible plans and prices match Stripe.
4. Sign in with an owner/admin account.
5. Open `/admin` and then `/admin/ops`; confirm there are no blockers.
6. Open `/dashboard`; confirm usage and billing state load without a full-page error.

## Core Customer Flow

1. Start from the homepage.
2. Open the editor.
3. Upload a known-good PDF.
4. Add or detect at least one field.
5. Fill the field.
6. Download the completed PDF.
7. Confirm the download opens locally and contains the filled value.

## Billing Flow

1. Start checkout for QuickFill Pro monthly.
2. Confirm Stripe Checkout opens with the correct product and price.
3. Cancel checkout and confirm the app returns cleanly.
4. For a paid test, complete checkout with a real low-risk owner test account.
5. After checkout, confirm the dashboard shows Pro access.
6. Check Stripe webhook delivery for `checkout.session.completed` and subscription updates.
7. Confirm the admin analytics event count updates for checkout and subscription events.

## Platform Checks

1. Review Vercel runtime logs for new errors.
2. Confirm `/api/admin/health` returns `ok: true` for an admin account.
3. Confirm `/api/usage` does not return a server error for a signed-in user.
4. Confirm rate limiting remains configured through Upstash Redis.
5. Check Neon storage and compute usage.
6. Check Stripe failed webhooks and failed payments.

## Launch Readiness Gates

- Database, Redis, Stripe, and Clerk must be green before growth traffic.
- Business annual pricing must either be configured or hidden from public purchase paths.
- Vercel Web Analytics and Speed Insights should be enabled before marketing pushes.
- Any new red runtime error after deployment should be fixed before inviting more users.
