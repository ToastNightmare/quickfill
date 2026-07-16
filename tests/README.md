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

The only expected standard-suite skips are the 16 PDF accuracy checks gated by
`QUICKFILL_QA_TOKEN`. Set the token to execute those checks locally.

### PDF Accuracy Pack

`pnpm qa:pdf` verifies the **local/current worktree** by default (baseURL `http://localhost:3000`).

Requirements before running:

1. `pnpm build` has been run in this worktree (Playwright boots a fresh `next start` server automatically and refuses to reuse a listener on port 3000).
2. `.env.local` exists in this worktree (copy from an existing QuickFill checkout; it is gitignored).
3. `QUICKFILL_QA_TOKEN` is exported in the shell and matches the server value in `.env.local`. Without it, most of the pack silently skips and a "pass" is meaningless.
4. `PLAYWRIGHT_BASE_URL` is unset, otherwise it overrides localhost.

```bash
pnpm build
QUICKFILL_QA_TOKEN="$(cat /home/kyle/.quickfill-qa-token)" pnpm qa:pdf
```

This runs the focused desktop and mobile PDF checks for AcroForm downloads, flat PDF fallback, widget cleanup, page overflow, real template export coverage, and browser-rendered visual smoke checks.

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
