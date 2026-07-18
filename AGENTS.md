<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code that depends on Next.js behavior. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# QuickFill Agent Rules

QuickFill is a production PDF form filler at https://getquickfill.com. Treat this as a live SaaS with paying users.

## Codex task discipline

QuickFill uses a strict two-lane pipeline:

- Implementation lane: exactly one active implementation PR, with exactly one implementation chat, branch, and worktree. Before the draft PR exists, the single approved task that will become that PR occupies this lane.
- Research lane: exactly one parallel, strictly read-only research chat or background agent for the immediately following PR. It has no branch or worktree and is not an implementation attempt.

Two implementation PRs may never overlap. The research lane is the sole standing parallel-work exception to the prohibition on extra Codex chats and background agents; it never permits a second implementation branch, worktree, or PR. An explicitly approved independent read-only reviewer is a sequential implementation gate, not a third lane: pause the research lane while that reviewer runs, keep the implementation lane unchanged, end the review before research resumes, and do not give the reviewer a branch, worktree, or mutation authority. Outside those cases, do not start sibling worktrees, recovery chats, extra branches, background agents, or parallel attempts unless Kyle explicitly approves a recovery after the active implementation lane has stopped.

The research lane may inspect the repository and other sources read-only. It must never create branches or worktrees, edit files, stage, commit, push, deploy, merge, delete, or otherwise mutate repository or external state. Its required handoff is:

- problem statement;
- evidence and source references;
- recommended scope;
- expected files;
- risks and protected boundaries;
- acceptance criteria;
- verification plan;
- a ready-to-paste implementation prompt.

Do not promote researched work into the implementation lane until the active implementation PR is merged, its automatic production deployment is verified against the exact merge SHA, the expressly authorized `master` worktree is synchronized, and the completed task worktree plus its safely merged local and remote branches are cleaned up. Promotion still requires the applicable implementation approval and creates the new sole implementation PR, branch, and worktree. After promotion, begin read-only research for the following PR.

If a task runs into tooling trouble:

- stay in the current chat;
- stop editing;
- report the blocker clearly;
- provide a short handoff summary;
- wait for Kyle's approval before opening a new chat or worktree.

If Kyle approves a new recovery chat:

- the new chat becomes the single source of truth;
- the old chat becomes read-only/archive only;
- do not keep working in both;
- do not copy changes between worktrees unless the new source-of-truth chat explicitly owns that work.

Do not ask Kyle to run routine PowerShell verification. Codex must run routine local verification itself, including:

- git status and diff checks;
- dependency install when needed;
- build commands;
- focused tests;
- cleanup of .clerk, test-results, playwright-report, and generated files;
- confirming changed files before PR prep.

Only ask Kyle for:

- approval gates not already covered by an active end-to-end approval;
- login, MFA, password, or account access;
- human visual judgement;
- risky scope changes;
- final PR/merge approval when an active end-to-end approval does not include it.

Do not use GitHub connector full-file replacement for large source files unless Kyle explicitly approves it. Prefer local git operations from the active worktree. If built-in local git operations are unavailable, stop and report the blocker.

Before PR prep, confirm:

- this chat is the source of truth;
- this worktree is the source of truth;
- only approved files changed;
- generated files are cleaned;
- no unrelated files are included;
- no commit, push, PR, deploy, or merge happens without the relevant explicit approval, including an active end-to-end approval when applicable.

### End-to-end PR authorization

Exactly one implementation task, chat, branch, worktree, and PR at a time remains mandatory. The strictly read-only research lane described above may run in parallel, but it cannot perform or overlap implementation. A plan, an explicit scope, the expected files, and the applicable verification gates are still required before editing.

When Kyle explicitly approves a named PR task end to end and identifies its source-of-truth worktree and branch, that approval authorizes the normal lifecycle for only that task:

1. Preflight and implementation within the approved scope.
2. Focused checks plus the repository build and QA gates.
3. Intentional staging, commit, normal push, and a draft PR.
4. Read-only review, in-scope corrections, and rerunning affected gates.
5. Monitoring required checks and review state.
6. Marking the approved PR ready and merging it with the repository-standard merge-commit method after every required gate is green.
7. Verifying that the automatic production deployment matches the exact merge SHA and performing bounded read-only smoke checks.
8. Fast-forwarding only the expressly authorized main worktree.
9. Removing only the clean, proven-merged task worktree, deleting only its matching merged local branch normally, and deleting its exact matching remote branch with verified-head-SHA lease protection.

Do not pause again for routine steps already covered by that approval. Continue to report material progress and preserve the pre-commit status and exact-diff audit.

An end-to-end approval does not authorize scope expansion, unrelated changes, force-updating live branch content, branch-protection bypasses, manual production deployments, production-data mutation, credential disclosure, destructive commands against broad or unresolved paths, or changes to other worktrees. An expected-SHA lease may protect deletion of the exact verified merged remote branch during approved cleanup. The approval also does not weaken the production-SaaS safeguards, protected PDF-coordinate rules, or the requirement to use exact resolved targets for cleanup.

Stop and report before continuing if there is material scope ambiguity, a security concern, destructive uncertainty, unrelated dirty state, a genuine product regression, an unexpected production mutation risk, or a required gate that remains red after safe in-scope diagnosis and correction.

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

## Technical PR And Merge Workflow

The limited approval phrases below remain available when Kyle has not granted an end-to-end PR approval. Codex may handle only the authorized portion of the technical workflow.

### Prepare PR Approval

When Kyle says:

- "Approved. Prepare PR."
- "Approved. Prepare preview push."

Codex may:

1. Stage only the files that were approved for the current task.
2. Commit those approved files with a clear task-focused commit message.
3. Push the approved work to a preview branch.
4. Create or provide a GitHub pull request for Kyle to review.
5. Report the branch, commit, PR link, verification results, and any notes.

This approval does not allow Codex to merge the PR, deploy manually, change unrelated files, or include unapproved work.

Before committing or pushing, Codex must show:

1. The exact files that will be staged.
2. `git status --short`.
3. The exact diff for the approved changes.

If there are unexpected or unrelated changes, Codex must stop and ask Kyle how to proceed.

### Merge PR Approval

When Kyle says:

- "Approved. Merge PR."

Codex may:

1. Confirm the intended PR and branch.
2. Check that required GitHub checks are green.
3. Confirm there are no unexpected local or remote changes.
4. Merge the approved PR using the repository's normal merge method.
5. Report the final merge result.

If checks are failing, pending, missing, or unclear, Codex must stop and report the problem instead of merging.

This approval does not allow Codex to make additional code changes, force-push, bypass branch protection, manually deploy, or merge any other PR.

## Local Sync Rule

At the end of every handoff, and after every successful PR merge, Codex must remind Kyle to sync the local main QuickFill repo.

Codex should include these exact PowerShell commands:

```powershell
cd "C:\Users\Admin\Documents\Codex\2026-05-01\walk-me-through-google-business-profile\QuickFill-Workspace\app"
git switch master
git pull origin master
git status --short
```

If Codex has safe local access and Kyle has approved the merge workflow, Codex may run these commands itself. Otherwise, Codex must provide them clearly as the final step.

The expected clean result is:
git status --short shows no output, except the harmless untracked cache warning.

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
