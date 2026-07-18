# Field Suggestion Rollout and Rollback

Last updated: 2026-07-18

## Current safe state

The local “Make This Fillable” review remains default-off. It is enabled only when the build-time value is exactly:

~~~text
NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS=local-review
~~~

The comparison is case-sensitive. An unset value, an empty value, **off**, **true**, or any other value keeps the feature off. This pull request does not change any Preview or Production environment value and does not enable the feature.

When the feature is off:

- “Make This Fillable” is not rendered.
- No field-suggestion snapshot callback or review state is attached.
- No field-suggestion scan runs.
- No **field_suggestion_lifecycle** event or additional analytics request is produced.

NEXT_PUBLIC values are compiled into the browser bundle. Changing the variable does not alter an already-built deployment. Enabling or rolling back always requires a new build and deployment with the intended value.

## Monitoring contract

Field-suggestion monitoring reuses QuickFill’s existing analytics path. It is fail-open: analytics failure cannot block upload, rendering, review, Retry, acceptance, cancellation, Start Over, editing, or download.

The sole event name is **field_suggestion_lifecycle**. Its allowlisted stages are:

- **eligibility**
- **review_requested**
- **snapshot_ready**
- **fail_closed**
- **review_displayed**
- **retry**
- **individual_accept**
- **individual_reject**
- **accept_all**
- **dismissed**
- **completed**

The only permitted properties are:

- **stage**
- **eligibility**
- **reason**
- **outcome**
- **count_bucket**
- **scan_duration_bucket**
- **incremental_duration_bucket**

Counts and durations are buckets, never raw values. Unknown failure reasons collapse to **unknown**; they are never copied from an exception message. Duplicate renders and Retry do not duplicate one-time milestones. A document-bound, in-memory session emits at most one terminal outcome, and stale/replaced document callbacks cannot complete a newer document’s session.

Outside the properties object, the existing analytics service adds only its non-identifying **signedIn** Boolean and ingestion timestamp. The field-suggestion client event deliberately omits UTM attribution and all identity or document context. At ingestion, the analytics API requires an exact **name** plus **properties** request envelope and accepts the event only when its stage-specific property keys, enum values, and buckets already match this exact contract. It rejects the whole event before authentication or persistence when any envelope or property key or value is extra, nested, malformed, normalized from an arbitrary string, or otherwise outside the allowlist. Unrelated analytics events retain their existing behavior.

## Privacy guarantees

Never record, transmit, paste into rollout evidence, or add to a monitoring payload:

- document pixels, screenshots, canvas data, images, or image data URLs;
- OCR output, document text, labels, or nearby text;
- filenames, document URLs, or storage paths;
- field values or saved profile values;
- suggestion coordinates, dimensions, bounding boxes, page transforms, or stable suggestion IDs;
- signatures or signature data URLs;
- email addresses;
- Clerk IDs, session IDs, user IDs, or other account identifiers;
- document revisions, hashes, or stable document fingerprints;
- arbitrary error or exception messages.

Any privacy-contract violation is an immediate no-go and rollback, regardless of aggregate product metrics.

## Where to check metrics

Use the protected **Admin → Operations → Field suggestion rollout monitoring** section. It aggregates only allowlisted lifecycle data from the latest 500 events in the existing analytics rolling buffer. It shows:

- eligible sessions;
- a directional display ratio (review-displayed rows divided by eligible rows when the visible rows are internally plausible);
- accepted, dismissed, fail-closed, and safely superseded outcomes;
- allowlisted fail-closed reasons;
- scan and incremental duration buckets.

No document-level or user-level rows are shown. Because the source is a trailing rolling buffer shared with other analytics, it can begin or end midway through a session. The displayed ratio is therefore directional, not cohort-safe, and can never prove a rollout threshold. It may identify a possible problem that requires investigation, but it must not be used as go evidence or as a cumulative session count.

This PR intentionally adds no document/user identifiers and no durable cohort store. **Preview-to-Production and all Production rollout decisions are blocked until a separately reviewed, privacy-safe aggregate source can prove complete cohorts for the stated observation window.** The source must use aggregate counters rather than stable user, session, or document identifiers. Until that source exists and is verified, the feature must remain off in Production.

For every decision, save a timestamped screenshot or written copy of the aggregate panel, the deployment URL and exact Git SHA, the build-time flag value, QA results, sample size, observation window, decision owner, and decision.

## Thresholds

All thresholds below must pass using controlled QA evidence or a separately approved complete-cohort aggregate source. The rolling 500-event operations panel may trigger investigation or a no-go, but it cannot establish a go. “No-go” means pause at the current stage or roll back if already enabled.

| Area | Go threshold | Immediate no-go |
| --- | --- | --- |
| Functional | Upload, render, review, individual accept/reject, Accept All, Retry, dismiss, replacement, Start Over, edit, Undo, and download all pass on desktop and mobile | Any blocked or broken core flow |
| Privacy | 0 forbidden fields or values in every inspected payload | Any forbidden telemetry or identity/document leakage |
| Network isolation | 0 **/api/detect-fields** requests and 0 unexpected signature requests during the local review flow | Any server detection or unexpected signature request |
| Browser health | 0 page errors, 0 console errors, and 0 horizontal-overflow failures in the rollout-on checks | Any reproducible error or overflow regression |
| Review display | At least 95% of eligible sessions display review | Below 95% after the stage minimum sample |
| Fail-closed | At most 5% of eligible sessions; no single non-unknown reason above 2% | Above 5%, unknown above 1%, or a repeated unexplained reason |
| Acceptance | At least 50% of completed outcomes are accepted all or accepted selected | Below 50% after the stage minimum sample |
| Dismissal | At most 40% of completed outcomes are dismissed | Above 40% after the stage minimum sample |
| Scan performance | At least 99% in buckets at or below 25–50 ms; no sustained over-50-ms bucket | Any sustained cap breach or visible input/render delay |
| Incremental performance | At least 99% below 10 ms; cap-triggered fail-closed outcomes at or below 1% | Any sustained 10 ms cap breach or visible review delay |
| PDF accuracy | Required PDF accuracy enforcement remains fully green | Any PDF accuracy regression |

Do not reinterpret a small or incomplete rolling sample as a pass. Human review may choose a stricter no-go, but it may not waive privacy, PDF accuracy, core-flow, error, or complete-evidence requirements.

## Staged rollout

### 1. Local QA

Keep the default-off build as the shipping candidate first:

~~~bash
env -u NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS TMPDIR=/tmp TMP=/tmp TEMP=/tmp pnpm build
env -u NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS TMPDIR=/tmp TMP=/tmp TEMP=/tmp pnpm qa
~~~

Confirm the desktop and mobile feature-off test produces no field-suggestion telemetry. Then create a separate local rollout-on build without changing .env.local:

~~~bash
NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS=local-review TMPDIR=/tmp TMP=/tmp TEMP=/tmp pnpm build
NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS=local-review QUICKFILL_STANDARD_QA=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 TMPDIR=/tmp TMP=/tmp TEMP=/tmp pnpm exec playwright test tests/editor-image-upload.spec.ts --grep "desktop review stays local|mobile review is focused" --reporter=list
~~~

Minimum evidence: all focused Jest tests, changed-file ESLint, **git diff --check**, **pnpm build**, **pnpm qa**, **pnpm qa:clerk**, PDF accuracy enforcement, and both rollout-on browser scenarios pass. The final pre-merge build must return to default-off.

Human gate: the QuickFill owner and implementation owner confirm the exact SHA, payload inspection, functional checks, and default-off final build. This local gate does not authorize a Preview or Production environment change.

### 2. Preview

Only after a separate explicit rollout approval:

1. Set the Preview build value to exactly **local-review**.
2. Rebuild and deploy that exact approved SHA.
3. Verify the deployment metadata SHA before testing.
4. Run and individually record at least 20 controlled eligible internal QA sessions, including desktop and mobile, individual decisions, Accept All, Retry, dismiss, replacement, Start Over, and a deliberately unavailable analytics request. Record only aggregate outcomes; do not add user or document identifiers.
5. Observe for at least one business day and review the directional aggregate panel plus runtime logs. The controlled QA record, not the rolling panel ratio, is the evidence source for this stage.

Human go/no-go: the QuickFill owner and implementation owner both sign off on the controlled evidence and every threshold. Preview approval does not authorize Production, and the current rolling panel is insufficient to request Production approval.

### 3. Limited Production

**Blocked with the monitoring available in this PR. Do not request or approve a Production rollout from the rolling 500-event panel.** Before a separate Production rollout approval can be considered:

1. Add and independently review a privacy-safe aggregate source that proves complete cohorts and observation windows without user, session, or document identifiers.
2. Verify its cohort boundaries, retention, rate calculations, access controls, and zero forbidden data in a separate approved PR.
3. Choose and record the limited audience mechanism before changing the build value. Do not improvise user identifiers or document fingerprints for sampling.
4. Obtain explicit Production rollout approval, build and deploy the approved SHA with the exact **local-review** value, and verify the deployment Git SHA.
5. Observe at least 100 complete eligible sessions across at least seven calendar days using the approved aggregate source.
6. Review the complete aggregate evidence daily and record threshold results.

Human go/no-go: the QuickFill owner explicitly approves continuation after reviewing the evidence. Pause immediately if a threshold is breached or the analytics sample becomes unavailable.

### 4. Wider Production

This stage remains blocked until the same complete-cohort aggregate source is available and verified. Once it is, require at least 500 complete eligible sessions across at least 14 calendar days, all thresholds green, no unresolved support signal, and explicit written approval from the QuickFill owner. Continue daily review during expansion. This runbook does not authorize automatic expansion.

## Pause procedure

If evidence is incomplete but there is no active product or privacy incident:

1. Do not widen the audience or promote another deployment.
2. Record the exact SHA, current stage, sample size, failing or missing evidence, and decision owner.
3. Keep the feature at its current bounded stage only if all hard safety thresholds remain green.
4. If any hard threshold is red, use the rollback procedure immediately.

## Exact rollback procedure

1. Record the incident time, current production URL, deployment ID, exact Git SHA, observed threshold breach, and aggregate evidence.
2. In the affected Vercel environment, remove **NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS** or set it to the explicit non-enabling value **off**. Do not use an empty assumption without checking the saved setting.
3. Rebuild and redeploy the current known-good application SHA through the normal reviewed deployment path. Do not rely on changing the environment variable alone: the old NEXT_PUBLIC value remains embedded in the already-built browser bundle.
4. Wait for the replacement deployment to become Ready and prove its deployment metadata Git SHA equals the intended SHA.
5. Confirm on desktop and mobile that “Make This Fillable” is absent, normal photo upload still works, and no **field_suggestion_lifecycle** request is produced.
6. Run the bounded public read-only smoke checks and review runtime health. Do not upload production documents or mutate production data as part of the smoke.
7. Keep the rollout paused and preserve the incident evidence.

If a privacy violation is suspected, also preserve only privacy-safe aggregate evidence; never copy the offending document/user value into tickets, chat, logs, or screenshots.

## Post-rollback verification

The rollback is complete only when:

- the off/unset replacement build is Ready;
- its deployment Git SHA is verified;
- desktop and mobile no longer show the feature entry point;
- normal upload, editor rendering, editing, Start Over, and download smoke checks pass;
- field-suggestion telemetry remains at zero in an off-build check;
- runtime, analytics, signature, and PDF accuracy checks show no regression;
- the owner records the verification time and evidence.

## Re-enabling ownership

Only the QuickFill owner may authorize re-enabling. Before approval, the implementation owner must provide:

- root cause and reviewed fix;
- the exact candidate Git SHA;
- focused regression coverage for the incident;
- a fully green local/default-off gate and rollout-on gate;
- privacy payload inspection;
- PDF accuracy enforcement results;
- a new staged-rollout plan beginning no later than Preview;
- named monitoring owner and rollback owner for the observation window.

Previous rollout evidence cannot substitute for evidence from the corrected SHA. Re-enabling always requires a new build and deployment with the exact approved value.
