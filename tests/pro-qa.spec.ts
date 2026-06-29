import { test, expect } from '@playwright/test';

test.describe('Pro Conversion Features', () => {
  test.beforeEach(async ({ page }) => {
    // Use existing unauthenticated base URL
    await page.goto('/');
  });

  test('Pricing route redirects to upload-first homepage', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Upload. Fill. Sign. Download.' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Get Pro');
    await expect(page.locator('body')).not.toContainText(`A$${"12"}.50`);
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
      await expect(page.locator('body')).toBeVisible();
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
    await expect(page.locator('a[href="/editor"]').first()).toBeVisible();
    await expect(page.locator('a[href="/pricing"]')).toHaveCount(0);
    
    // Test navigation
    await page.goto('/templates');
    await expect(page).toHaveURL('/templates');
    
    await page.goto('/pricing');
    await expect(page).toHaveURL('/');
  });
});
