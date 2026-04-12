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
- Base URL: `https://getquickfill.com`
- Headless mode: enabled
- Screenshots: on failure only
- Video: retained on failure
