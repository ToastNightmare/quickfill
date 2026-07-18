# Playwright QA Test Suite

Automated QA tests for QuickFill using Playwright.

## Setup

### Install Dependencies

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

### Install System Dependencies (requires sudo)

```bash
pnpm exec playwright install-deps chromium
```

Or manually install the required packages:

```bash
sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2
```

## Running Tests

```bash
pnpm qa
```

Standard QA runs Jest first, then the complete standard Playwright suite against
`http://localhost:3000`. The Playwright phase validates the local Clerk
configuration, starts a fresh production-mode Next.js server, and uses one
worker. Build the app first with `pnpm build`.

Playwright's generated results, screenshots, videos, and traces are written to
the operating system's temporary directory. `playwright-report/` and
`test-results/` must not be created in the repository.

The PDF accuracy checks gated by `QUICKFILL_QA_TOKEN` intentionally skip during
ordinary local runs when the token is unavailable. Set the token to execute
those checks locally. Set `QUICKFILL_PDF_QA_ENFORCE=1` when a missing token must
fail closed instead of skipping the guarded checks.

## GitHub Actions CI

`.github/workflows/ci.yml` runs the read-only **QuickFill CI** workflow for
pull requests targeting `master`, pushes to `master`, merge queue groups, and
manual dispatches. It installs the frozen pnpm lockfile with the repository's
pinned pnpm version, builds the production application, runs the full Jest
suite directly, and then runs the standard Playwright suite directly against a
fresh `http://localhost:3000` server with one worker. It never runs
`qa:pdf:prod` or targets production. The same required job then runs
`pnpm qa:pdf` in enforcement mode against localhost and requires all 20 PDF
accuracy checks to execute with none skipped.

The workflow requires these matching Clerk Development credentials as GitHub
repository Actions secrets:

- `QUICKFILL_CI_CLERK_PUBLISHABLE_KEY`
- `QUICKFILL_CI_CLERK_SECRET_KEY`

The secrets are mapped only to `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY` for credential validation, the build, and the localhost
Playwright run. Missing credentials fail closed before checkout without
printing their values. GitHub does not provide repository Actions secrets to
fork pull requests or Dependabot-triggered workflows, so those runs fail the
credential check and require a trusted branch run instead.

On failure, CI uploads only matching `/tmp/quickfill-playwright-*` output as a
GitHub Actions artifact retained for seven days. Standard CI does not create
tracked `playwright-report/` or `test-results/` directories. The PDF step
generates a cryptographically random `QUICKFILL_QA_TOKEN`, registers it with
GitHub masking before use, and passes it only to that step's Playwright process
and local Next.js server. Enforcement mode also starts a loopback-only Redis
facade that accepts only the route's download-log `LPUSH` and `LTRIM` commands,
discards their payloads, and reuses the same ephemeral token for authentication.
The ephemeral token is not a GitHub or Vercel secret and is not persisted,
cached, uploaded, or shared with another step. No production Redis service or
production data is accessed.

Use the stable job/check name **Build, Jest, and standard Playwright** for
`master` branch protection.

### PDF Accuracy Pack

`pnpm qa:pdf` verifies the **local/current worktree** by default (baseURL `http://localhost:3000`).

Requirements before running:

1. `pnpm build` has been run in this worktree (Playwright boots a fresh `next start` server automatically and refuses to reuse a listener on port 3000).
2. `.env.local` exists in this worktree (copy from an existing QuickFill checkout; it is gitignored).
3. `QUICKFILL_QA_TOKEN` is set for the Playwright command. Its local Next.js child process inherits the same value. Without it, most of the pack silently skips unless enforcement mode is enabled.
4. `PLAYWRIGHT_BASE_URL` is unset or exactly `http://localhost:3000`.

```bash
pnpm build
pdf_qa_token="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
QUICKFILL_QA_TOKEN="${pdf_qa_token}" \
  QUICKFILL_PDF_QA_ENFORCE=1 \
  PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  UPSTASH_REDIS_REST_URL=http://127.0.0.1:38079 \
  UPSTASH_REDIS_REST_TOKEN="${pdf_qa_token}" \
  pnpm qa:pdf
unset pdf_qa_token
```

This runs the focused desktop and mobile PDF checks for AcroForm downloads, flat PDF fallback, widget cleanup, page overflow, real template export coverage, and browser-rendered visual smoke checks.
Enforcement mode fails before the pack can register tests if the token is
missing, the test target is not exact localhost, or the Redis facade is not
configured at its exact loopback URL with the same token. A guarded skip cannot
be mistaken for successful CI coverage.

### Production Smoke

`pnpm qa:pdf:prod` explicitly targets live production (`https://getquickfill.com`). No local server is started.

```bash
QUICKFILL_QA_TOKEN="$(cat /home/kyle/.quickfill-qa-token)" pnpm qa:pdf:prod
```

**Production smoke is not branch verification.** Do not treat a `qa:pdf:prod` pass as evidence that a PR branch works. Pre-merge verification must use `pnpm qa:pdf` (localhost) or a preview URL.

### Preview Smoke

```bash
QUICKFILL_QA_TOKEN="$(cat /home/kyle/.quickfill-qa-token)" PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app pnpm qa:pdf
```

Remote URLs never boot the local web server.

### With Debugging

```bash
pnpm exec playwright test --debug
```

### With UI Mode

```bash
pnpm exec playwright test --ui
```

## Test Coverage

The standard suite covers public navigation and content, templates, the editor
upload and saved-state flows, mobile interactions, image cleanup and rendering,
field placement and selection, Box Field/Comb keyboard input, PDF rendering, and
the credential-gated PDF accuracy pack.

## Configuration

See `playwright.config.ts` for test configuration:
- Test directory: `./tests`
- Timeout: 30000ms
- Standard QA base URL: enforced as `http://localhost:3000`
- PDF smoke base URL: `PLAYWRIGHT_BASE_URL` if set, otherwise `http://localhost:3000`
- Web server: starts a fresh local production server for localhost runs only
- Local workers: 1
- Generated output: a unique directory under the operating system's temporary directory
- Headless mode: enabled
- Screenshots: on failure only
- Video: retained on failure
