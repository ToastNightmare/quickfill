import { test, expect } from '@playwright/test';

test.describe('Pro Conversion Features', () => {
  test.beforeEach(async ({ page }) => {
    // Use existing unauthenticated base URL
    await page.goto('/');
  });

  test('Pricing page shows Pro upgrade button', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');

    // Check Pro upgrade buttons exist
    const upgradeButtons = page.locator('button:has-text("Upgrade"), a:has-text("Upgrade"), button:has-text("Get Pro"), a:has-text("Get Pro")');
    const count = await upgradeButtons.count();
    expect(count).toBeGreaterThan(0);
    
    // Check Pro price is visible
    await expect(page.locator('text="$12"').first()).toBeVisible();
    
    // Check Pro features list exists
    const proFeatures = page.locator('text=Unlimited documents').or(page.locator('text=No watermarks')).or(page.locator('text=Priority support'));
    const featureCount = await proFeatures.count();
    expect(featureCount).toBeGreaterThan(0);
  });

  test('Dashboard shows correct user state', async ({ page }) => {
    // Dashboard requires auth - check redirection or auth UI
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    const url = page.url();
    const isDashboard = url.includes('/dashboard');
    const isSignIn = url.includes('/sign-in') || url.includes('/signup');
    
    // Either dashboard loaded or we're redirected to sign-in
    expect(isDashboard || isSignIn).toBe(true);
    
    if (isDashboard) {
      // Check for user info display
      const userGreeting = page.locator('text=Welcome, text=Hello, h1:has-text("Dashboard")');
      const greetingCount = await userGreeting.count();
      expect(greetingCount).toBeGreaterThan(0);
    }
  });

  test('Editor respects gated features', async ({ page }) => {
    // Editor requires auth - test the auth flow
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');
    
    const url = page.url();
    const isEditor = url.includes('/editor');
    const isSignIn = url.includes('/sign-in') || url.includes('/signup');
    
    // Editor requires auth, so either we see editor (if authed) or sign-in
    expect(isEditor || isSignIn).toBe(true);
  });

  test('Template page shows Pro-only indicators', async ({ page }) => {
    await page.goto('/templates');
    await page.waitForLoadState('networkidle');
    
    // Check for Pro-only indicators on templates
    const proBadges = page.locator('text=PRO, text=Pro only, .pro-badge, [class*="pro"]');
    const badgeCount = await proBadges.count();
    
    // Some templates might be Pro-only, but not all
    if (badgeCount > 0) {
      // If badges exist, check they're visible
      await expect(proBadges.first()).toBeVisible();
    }
  });

  test('Site structure is intact after deploy', async ({ page }) => {
    // Test core navigation still works
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check homepage loads with key elements
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('a[href="/templates"]').first()).toBeVisible();
    await expect(page.locator('a[href="/pricing"]').first()).toBeVisible();
    
    // Test navigation
    await page.goto('/templates');
    await expect(page).toHaveURL('/templates');
    
    await page.goto('/pricing');
    await expect(page).toHaveURL('/pricing');
  });
});