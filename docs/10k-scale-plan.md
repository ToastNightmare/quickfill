# QuickFill 10,000+ User Scale Plan

## Immediate Foundation

- Keep Vercel production connected to GitHub `master`.
- Keep Neon as the durable system of record for subscriptions, Stripe events, usage events, and audit events.
- Keep Redis for short-lived counters, rate limiting, and fast entitlement cache.
- Use Stripe webhooks as the source for paid access changes.

## Scaling Milestones

### 1,000 users

- Review Vercel function usage weekly.
- Track checkout conversion and fill failures.
- Add alerting for webhook failures and 5xx spikes.

### 10,000 users

- Move heavy PDF work into queued jobs if fill latency rises.
- Add stricter route-specific limits for AI detection and PDF fill operations.
- Add database retention policies for usage and audit events.
- Add daily ops reports and monthly Stripe reconciliation.

### Beyond

- Add background processing for large documents.
- Add enterprise/team billing.
- Add disaster recovery snapshots and restore drills.
