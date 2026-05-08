# Maintenance Runbook

## After Every Deploy

1. Confirm Vercel deployment is Ready.
2. Visit the homepage and pricing page.
3. Open the editor and confirm a PDF can be loaded.
4. Check `/api/usage` returns a non-500 response.
5. Review Vercel logs for new errors.

## Weekly

- Check Stripe failed webhook events.
- Review Vercel usage, function invocations, and error rate.
- Confirm database storage and compute remain within plan.
- Run a smoke check against production.

## Monthly

- Reconcile Stripe subscriptions with stored subscription records.
- Review rate-limit policy and abuse patterns.
- Export or snapshot key operational records.

## Incident Response

- If production breaks after a deploy, use Vercel Instant Rollback first.
- If billing access is wrong, verify Stripe event delivery and subscription records.
- If database connectivity fails, check `DATABASE_URL` and Neon resource status.
