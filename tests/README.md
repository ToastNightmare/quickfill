# Playwright QA Test Suite

Automated QA tests for QuickFill using Playwright.

## Setup

### Install Dependencies

```bash
pnpm add -D @playwright/test
npx playwright install chromium
```

### Install System Dependencies (requires sudo)

```bash
npx playwright install-deps chromium
```

Or manually install the required packages:

```bash
sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2
```

## Running Tests

```bash
pnpm qa
```

### PDF Accuracy Pack

`pnpm qa:pdf` verifies the **local/current worktree** by default (baseURL `http://localhost:3000`).

Requirements before running:

1. `pnpm build` has been run in this worktree (Playwright boots `pnpm start` automatically; it reuses an already-running server on port 3000 if one exists).
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

1. **Homepage loads** - Verifies title, hero headline, CTA button, and no console errors
2. **Templates page loads** - Checks for 10+ template cards and "Fill This Form" buttons
3. **Editor loads** - Verifies editor interface loads correctly
4. **Pricing page loads** - Checks for pricing information and upgrade buttons
5. **Template opens in editor** - Tests navigation from templates to editor
6. **Navigation links work** - Verifies internal navigation between pages

## Configuration

See `playwright.config.ts` for test configuration:
- Test directory: `./tests`
- Timeout: 30000ms
- Base URL: `PLAYWRIGHT_BASE_URL` if set, otherwise `http://localhost:3000`
- Web server: auto-starts `pnpm start` for localhost runs only (reuses an existing server)
- Headless mode: enabled
- Screenshots: on failure only
- Video: retained on failure
