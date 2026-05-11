# QuickFill Launch Readiness

This checklist is the standing launch pass for QuickFill before paid marketing, public announcements, or large traffic pushes.

## Signup

- Confirm `/sign-up` works for new users from homepage, pricing, and checkout redirects.
- Confirm post-signup redirects return users to the intended flow, especially `/checkout` and `/editor`.
- Confirm the free value proposition is visible before account creation.

## Pricing

- Confirm monthly and annual Pro pricing match Stripe price IDs.
- Confirm annual savings copy remains accurate when prices change.
- Confirm the signed-in Pro state does not show another upgrade CTA.
- Confirm the free plan limit copy matches the actual enforcement limit.

## Payment

- Confirm `/api/stripe/checkout` returns JSON errors, never raw server failures.
- Confirm checkout attempts are rate-limited.
- Confirm Stripe Checkout has promotion codes enabled.
- Confirm `checkout_session_created`, `checkout_session_failed`, and `subscription_started` are visible in analytics.
- Confirm webhook events are idempotent through `stripe_events`.
- Confirm customer and subscription mappings are stored for future billing changes.

## Editor

- Confirm upload, AcroForm detection, manual fields, profile autofill, whiteout, signature, undo/redo, and clear all still work.
- Confirm mobile and desktop autofill both use the shared profile autofill path.
- Keep `NEXT_PUBLIC_QUICKFILL_AUTOFILL_MODE=legacy` in production until shadow-mode accuracy reports are reviewed.
- Use `shadow` in Preview first, then Production only after real-form testing.

## Download

- Confirm free, guest, Pro, and QA-token downloads all work.
- Confirm the free limit blocks downloads after the configured limit.
- Confirm free/guest watermarking is applied and Pro/QA downloads are clean.
- Confirm failed exports create admin download logs with enough context to debug.

## Support

- Confirm `/api/support` stores support requests.
- Confirm `QUICKFILL_ADMIN_EMAILS` and `RESEND_API_KEY` are configured so support requests notify admins.
- Confirm support messages from download failures include filename, field count, page count, and error context.
- Confirm `support_request_submitted` appears in analytics.

## Analytics

- Confirm these core funnel events are present: `home_cta_click`, `template_start`, `editor_upload_started`, `editor_pdf_loaded`, `profile_autofill_used`, `download_attempt`, `download_success`, `download_failed`, `free_limit_hit`, `checkout_start`, `checkout_session_created`, `checkout_session_failed`, `subscription_started`, `support_request_submitted`.
- Confirm analytics ingestion tolerates missing Redis without breaking user flows where possible.
- Review `analytics:recent` after every launch test session.

## Production Gates

- Vercel production build must be green.
- Database migrations must be applied before features that rely on new tables ship.
- Stripe webhook secret, price IDs, Clerk keys, Redis, Resend, Sentry, and admin emails must be configured in Production.
- Run at least one full real-form test on desktop and mobile before starting paid marketing.
