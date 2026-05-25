<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code that depends on Next.js behavior. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# QuickFill Agent Rules

QuickFill is a production PDF form filler at https://getquickfill.com. Treat this as a live SaaS with paying users.

## Product Contract

Users upload PDFs, place fields, fill values, and download accurate completed PDFs. Accuracy in downloaded PDF coordinates is core product behavior.

Supported field types include:

- Text
- Checkbox
- Signature
- Date
- Comb
- Whiteout
- Box

## Coordinate System Rules

Preserve the coordinate baseline from commit `446cf52`.

Do:

- Store field geometry in PDF point space.
- Convert PDF point space to canvas coordinates only for rendering.
- Keep PDF export in PDF coordinate space.
- Preserve comb field cell spacing and `offsetX` behavior.
- Wrap imported PDF page content to isolate page transforms when exporting.

Do not:

- Divide saved PDF coordinates by canvas scale during export.
- Treat visual canvas coordinates as persisted document coordinates.
- Reintroduce inverse-transform compensation unless a new regression test proves it is needed.
- Change field positioning files without focused QA.

Protected files:

- `src/components/PdfViewer.tsx`
- `src/lib/pdf-utils.ts`
- `src/app/api/fill-pdf/route.ts`
- Snap, aspect-ratio, field positioning, and export/download logic

## Build And QA Gate

Use pnpm only.

Before shipping code changes:

```bash
pnpm build
pnpm qa
```

For targeted debugging, run the smallest useful Jest or Playwright test first, then run the full gate before commit.

## Implementation Style

Prefer:

- Small, production-safe changes.
- Existing patterns over new abstractions.
- Focused regression tests for bug fixes.
- Mobile-first UI.
- Plain language in user-facing copy.

Avoid:

- Placeholder content that looks real.
- Broad refactors mixed into fixes.
- Secret values in commits.
- Manual production deploys unless Kyle asks.

## Reporting

When work is complete, report status, commit, files changed, build result, tests run, and notes.

---

# Kyle's QuickFill Codex Workflow

## Default working mode

For QuickFill tasks, prefer a NEW Codex worktree.

Do not use Work locally for build tasks unless Kyle explicitly says to.

The main QuickFill repo should be treated as the clean base. Worktrees are the safe place for Codex to inspect, build, test, and experiment.

## Standard task flow

For every QuickFill build task:

1. Start in a new Codex chat.
2. Use a new worktree.
3. Inspect first.
4. Explain the plan before editing.
5. Wait for Kyle's approval before editing.
6. Build only the approved task.
7. Show `git status --short`.
8. Show the exact diff.
9. Run only approved verification commands.
10. Stop and report if anything gets blocked, slow, unclear, or risky.

## Approval rule

Do not edit files until Kyle approves the plan.

When Kyle approves, edit only the files listed in the approved plan.

Do not expand the task without asking first.

## Commands requiring explicit approval

Never run these unless Kyle clearly approves:

- `git commit`
- `git push`
- deploy commands
- `git reset`
- `git clean`
- deleting files or folders
- changing production settings
- modifying package manager or lockfile files

## Protected QuickFill areas

These areas require extra caution and explanation before editing:

- PDF coordinate and field placement logic
- PDF export and finalization logic
- Billing, Stripe, entitlement, usage-limit, and admin logic
- Clerk auth and webhooks
- Database schema or migrations
- `package.json`
- `pnpm-lock.yaml`
- Vercel or deployment configuration
- broad wiring scripts

If the task does not specifically require these areas, do not edit them.

## Verification rule

Use the smallest relevant verification first.

Preferred order:

1. Focused test for the changed area
2. `pnpm build`
3. `pnpm qa` only after the focused check/build is safe

If Playwright/browser tests are blocked by the local sandbox, report that clearly. Do not pretend full QA passed.

## Handoff rule

When Kyle says any of these:

- "handoff"
- "give me a handoff"
- "wrap this up"
- "ready for next chat"
- "finish this task"
- "checkpoint this"
- "handoff and archive"

Stop all work and produce a final handoff.

Do not edit files.
Do not install anything.
Do not run tests.
Do not run build.
Do not commit.
Do not push.
Do not deploy.

The handoff must include:

1. Worktree path
2. Branch/current ref
3. Files changed
4. Exact `git status --short` output
5. Summary of what was built or changed
6. Verification performed
7. Verification not performed
8. Known risks or unfinished items
9. Whether the main QuickFill repo was touched
10. Whether anything was committed, pushed, or deployed
11. Recommended next step
12. Copy/paste handoff note for the next Codex chat

At the end say:

"Archive this chat after saving this handoff. Start the next task in a fresh chat with a new worktree."

