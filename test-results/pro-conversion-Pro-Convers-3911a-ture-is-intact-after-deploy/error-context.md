# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pro-conversion.spec.ts >> Pro Conversion Features >> Site structure is intact after deploy
- Location: tests/pro-conversion.spec.ts:75:7

# Error details

```
Error: page.goto: net::ERR_NETWORK_CHANGED at https://getquickfill.com/
Call log:
  - navigating to "https://getquickfill.com/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Pro Conversion Features', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     // Use existing unauthenticated base URL
> 6  |     await page.goto('/');
     |                ^ Error: page.goto: net::ERR_NETWORK_CHANGED at https://getquickfill.com/
  7  |   });
  8  | 
  9  |   test('Pricing page shows Pro upgrade button', async ({ page }) => {
  10 |     await page.goto('/pricing');
  11 |     await page.waitForLoadState('networkidle');
  12 | 
  13 |     // Check Pro upgrade buttons exist
  14 |     const upgradeButtons = page.locator('button:has-text("Upgrade"), a:has-text("Upgrade"), button:has-text("Get Pro"), a:has-text("Get Pro")');
  15 |     const count = await upgradeButtons.count();
  16 |     expect(count).toBeGreaterThan(0);
  17 |     
  18 |     // Check Pro price is visible
  19 |     await expect(page.locator('text="$12"').first()).toBeVisible();
  20 |     
  21 |     // Check Pro features list exists
  22 |     const proFeatures = page.locator('text=Unlimited documents').or(page.locator('text=No watermarks')).or(page.locator('text=Priority support'));
  23 |     const featureCount = await proFeatures.count();
  24 |     expect(featureCount).toBeGreaterThan(0);
  25 |   });
  26 | 
  27 |   test('Dashboard shows correct user state', async ({ page }) => {
  28 |     // Dashboard requires auth - check redirection or auth UI
  29 |     await page.goto('/dashboard');
  30 |     await page.waitForLoadState('networkidle');
  31 |     
  32 |     const url = page.url();
  33 |     const isDashboard = url.includes('/dashboard');
  34 |     const isSignIn = url.includes('/sign-in') || url.includes('/signup');
  35 |     
  36 |     // Either dashboard loaded or we're redirected to sign-in
  37 |     expect(isDashboard || isSignIn).toBe(true);
  38 |     
  39 |     if (isDashboard) {
  40 |       // Check for user info display
  41 |       const userGreeting = page.locator('text=Welcome, text=Hello, h1:has-text("Dashboard")');
  42 |       const greetingCount = await userGreeting.count();
  43 |       expect(greetingCount).toBeGreaterThan(0);
  44 |     }
  45 |   });
  46 | 
  47 |   test('Editor respects gated features', async ({ page }) => {
  48 |     // Editor requires auth - test the auth flow
  49 |     await page.goto('/editor');
  50 |     await page.waitForLoadState('networkidle');
  51 |     
  52 |     const url = page.url();
  53 |     const isEditor = url.includes('/editor');
  54 |     const isSignIn = url.includes('/sign-in') || url.includes('/signup');
  55 |     
  56 |     // Editor requires auth, so either we see editor (if authed) or sign-in
  57 |     expect(isEditor || isSignIn).toBe(true);
  58 |   });
  59 | 
  60 |   test('Template page shows Pro-only indicators', async ({ page }) => {
  61 |     await page.goto('/templates');
  62 |     await page.waitForLoadState('networkidle');
  63 |     
  64 |     // Check for Pro-only indicators on templates
  65 |     const proBadges = page.locator('text=PRO, text=Pro only, .pro-badge, [class*="pro"]');
  66 |     const badgeCount = await proBadges.count();
  67 |     
  68 |     // Some templates might be Pro-only, but not all
  69 |     if (badgeCount > 0) {
  70 |       // If badges exist, check they're visible
  71 |       await expect(proBadges.first()).toBeVisible();
  72 |     }
  73 |   });
  74 | 
  75 |   test('Site structure is intact after deploy', async ({ page }) => {
  76 |     // Test core navigation still works
  77 |     await page.goto('/');
  78 |     await page.waitForLoadState('networkidle');
  79 |     
  80 |     // Check homepage loads with key elements
  81 |     await expect(page.locator('h1').first()).toBeVisible();
  82 |     await expect(page.locator('a[href="/templates"]').first()).toBeVisible();
  83 |     await expect(page.locator('a[href="/pricing"]').first()).toBeVisible();
  84 |     
  85 |     // Test navigation
  86 |     await page.goto('/templates');
  87 |     await expect(page).toHaveURL('/templates');
  88 |     
  89 |     await page.goto('/pricing');
  90 |     await expect(page).toHaveURL('/pricing');
  91 |   });
  92 | });
```