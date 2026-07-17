---
name: quickfill-pr
description: Complete one explicitly approved QuickFill pull request from preflight through implementation, review, QA, draft PR, required checks, merge, exact-SHA deployment verification, authorized master synchronization, and safe cleanup. Use only when Kyle grants end-to-end approval for a named task, worktree, branch, and PR lifecycle; otherwise follow the narrower approval gates in AGENTS.md.
---

# QuickFill PR lifecycle

Treat `AGENTS.md` as authoritative. This skill structures an approval; it never grants one.

## Establish authorization and scope

1. Record the approved task, source-of-truth chat, worktree, branch, base branch, intended PR, expected files, verification gates, deployment check, authorized main worktree, and cleanup targets.
2. Confirm the approval explicitly covers the end-to-end lifecycle. Use the limited prepare-PR or merge-PR workflow in `AGENTS.md` when it does not.
3. Keep one task, branch, worktree, and PR. Do not create recovery worktrees, parallel edit attempts, or extra branches.
4. State the plan and expected files before editing. An active end-to-end approval removes repeated routine pauses; it does not remove planning or scope control.

## Run preflight

Run read-only checks before changing files:

```bash
uname -a
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git fetch origin master
git rev-parse HEAD
git rev-parse origin/master
git merge-base HEAD origin/master
git rev-list --left-right --count HEAD...origin/master
rg --files -g 'AGENTS.md' -g '!node_modules'
```

Read every applicable `AGENTS.md`. Confirm WSL2 when the task specifies WSL, the exact approved path and branch, the freshly fetched base, and a clean or fully expected worktree. Preserve existing work. Never use reset, restore, clean, or force to make preflight pass.

Stop on unrelated changes, an unexpected branch or worktree, an unclear merge base, missing authorization, or material scope ambiguity.

## Implement narrowly

1. Inspect existing repository patterns and relevant official documentation before introducing a schema or tool configuration.
2. Make the smallest approved change with `apply_patch`. Do not mix refactors or product changes into workflow work.
3. Keep `package.json`, `pnpm-lock.yaml`, product code, APIs, and protected PDF-coordinate files unchanged unless the task explicitly includes them.
4. Never add `.codex/config.toml`, secrets, production credentials, generated reports, or ignored runtime state to a PR.
5. Use `scripts/codex-wsl-setup.sh` for a new WSL worktree. Accept only the Clerk Development QA variables that script permits. Never run `env`, enable shell tracing, print values, or hash credentials.
6. Keep Playwright artifacts in Linux temporary paths outside the repository.

## Verify in layers

Run the narrowest structural and focused checks first. For workflow changes, include:

```bash
bash -n scripts/codex-wsl-setup.sh
skill_validator="${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py"
test -f "$skill_validator"
python3 "$skill_validator" .agents/skills/quickfill-pr
git diff --check
```

Parse `.codex/environments/environment.toml` with a TOML parser and verify that it uses only the currently supported local-environment fields. Test the setup script without exposing credentials. Require its source and destination security checks to fail closed.

Then run the full repository gate with pnpm only:

```bash
TMPDIR=/tmp TMP=/tmp TEMP=/tmp pnpm build
TMPDIR=/tmp TMP=/tmp TEMP=/tmp pnpm qa
TMPDIR=/tmp TMP=/tmp TEMP=/tmp pnpm qa:clerk
```

Use only Clerk Development keys for Clerk QA. Do not use production credentials. After every gate, inspect `git status --short`; confirm repeated QA leaves tracked files, `playwright-report`, and `test-results` unchanged. Remove only exact task-owned generated artifacts when cleanup is needed.

If a check fails, identify whether the cause is the approved diff, the environment, or an external service. Make only an in-scope correction, rerun the affected gate, and then rerun the full required gate. Stop when a required gate remains red after safe diagnosis, or when a genuine product regression appears.

## Review independently

After the full gate passes:

1. Run one sequential read-only independent review when approved.
2. Give the reviewer the raw diff, task scope, and repository instructions without suggested findings.
3. Check correctness, security, scope, secret handling, fail-closed behavior, cleanup safety, and documentation accuracy.
4. Correct every actionable in-scope finding and rerun affected checks.
5. Repeat the exact status, diff, and `git diff --check` audit.

## Prepare the draft PR

Before staging, show:

1. The exact files to stage.
2. The exact `git status --short` output.
3. The complete diff for the approved changes.

Stop if anything unexpected appears. Stage explicit paths only, commit with the approved task-focused message, and push normally without force. Create a draft PR targeting `master`.

Write a PR body with:

- scope and motivation;
- security and credential handling;
- verification commands and results;
- deployment behavior;
- rollback;
- limitations and out-of-scope items.

Confirm the PR number, head branch, base branch, commit SHA, draft state, and body after creation.

## Gate and merge

Monitor required GitHub checks and unresolved review state. Diagnose an in-scope failure from its logs, fix it on the same branch, rerun local gates, commit, and push normally. Do not bypass protection or force-push.

Mark the approved PR ready only after:

- all required checks are successful;
- no required check is missing or ambiguous;
- no actionable review thread remains;
- the head SHA is the verified local SHA;
- the local worktree contains no unexpected change.

Merge only the approved PR with the repository-standard merge-commit method. Record the GitHub merge commit SHA. Never merge another PR or substitute squash/rebase without explicit approval.

## Verify production

Wait for the automatic production deployment. Do not deploy manually or change Vercel settings.

Use deployment metadata to prove that the production deployment's Git commit SHA equals the GitHub merge SHA. Treat a branch name, PR number, build time, or URL alone as insufficient proof.

After the exact-SHA match, perform only bounded public read-only smoke checks. Allow GET/HEAD navigation to approved public pages such as `/` and `/pricing`. Do not sign in, upload a PDF, submit a form, start checkout, purchase, trigger analytics intentionally, or mutate production data.

Stop on a mismatched SHA, failed production deployment, unexpected authentication requirement, or product regression.

## Synchronize and clean up

Operate only on the expressly authorized main worktree:

1. Confirm it is the expected repository, on `master`, and clean.
2. Fetch `origin/master`.
3. Fast-forward only; do not rebase, reset, or discard.
4. Verify local `master` equals `origin/master` and contains the recorded merge SHA.

Before cleanup, prove:

- the PR is merged at the recorded merge SHA;
- the feature commit is an ancestor of `origin/master`;
- the task worktree is clean;
- the resolved worktree and branch names exactly match the approval.
- a fresh fetch of the exact feature branch succeeds immediately before deletion;
- the local feature-branch tip and freshly fetched remote tip both equal the verified PR head SHA.

From the authorized main worktree, remove only the finished task worktree with normal `git worktree remove`, never `--force`. Delete only the exact matching local branch with normal `git branch -d`. Delete the matching remote branch only with an expected-SHA lease tied to the verified PR head, for example `git push --force-with-lease="refs/heads/$feature_branch:$pr_head_sha" origin --delete "$feature_branch"`; never force-update a live branch. Do not touch any other QuickFill checkout or stale branch.

## Report

Finish with one consolidated report containing:

- worktree and branch;
- files changed;
- exact final Git state;
- focused and full verification results;
- review findings and resolutions;
- commit, PR, and checks;
- merge SHA and method;
- exact-SHA deployment evidence and smoke result;
- authorized master synchronization;
- worktree and branch cleanup;
- anything not performed, remaining risks, and the recommended next step.
