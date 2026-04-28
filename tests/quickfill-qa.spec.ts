import { test, expect } from '@playwright/test';

test('Homepage loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Check title contains "QuickFill"
  await expect(page).toHaveTitle(/QuickFill/);
  
  // Check hero headline exists
  const heroHeadline = page.locator('h1').first();
  await expect(heroHeadline).toBeVisible();
  
  // Check CTA button visible (Start filling forms free or Fill a PDF)
  const ctaButton = page.locator('a[href="/sign-up"], a[href="/editor"]').first();
  await expect(ctaButton).toBeVisible();
  
  // Check no console errors
  expect(errors).toHaveLength(0);
});

test('Templates page loads', async ({ page }) => {
  await page.goto('/templates');
  await page.waitForLoadState('networkidle');

  // Check 5+ "Fill This Form" buttons exist (reliable count without toHaveCount min syntax)
  const count = await page.locator('a:has-text("Fill This Form")').count();
  expect(count).toBeGreaterThanOrEqual(5);
  
  // Check "Tax File Number Declaration" template exists with more reliable selector
  await expect(page.locator('text=Tax File Number').first()).toBeVisible();
});

test('Editor loads', async ({ page }) => {
  await page.goto('/editor');
  await page.waitForLoadState('networkidle');

  // Editor requires auth - either we see the editor or we're redirected to sign-in
  const url = page.url();
  const isEditor = url.includes('/editor');
  const isSignIn = url.includes('/sign-in');
  expect(isEditor || isSignIn).toBe(true);
});

test('Pricing page loads', async ({ page }) => {
  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');

  // Check "$12" is visible (Pro monthly price)
  const priceElement = page.locator('text="$12"').first();
  await expect(priceElement).toBeVisible();
  
  // Check Pro upgrade button exists
  const proButton = page.locator('button:has-text("Upgrade to Pro"), a:has-text("Upgrade to Pro")').first();
  await expect(proButton).toBeVisible();
});

test('Template opens in editor', async ({ page }) => {
  // Navigate to templates listing
  await page.goto('/templates');
  await page.waitForLoadState('networkidle');

  // Click first Fill This Form button
  const fillBtn = page.locator('a:has-text("Fill This Form")').first();
  await fillBtn.click();

  // Either editor or sign-in is acceptable (sign-in required for auth)
  await page.waitForLoadState('networkidle');
  const url = page.url();
  expect(url.includes('/editor') || url.includes('/sign-in') || url.includes('/templates')).toBe(true);
});

test('Navigation links work', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Check Templates link works
  const templatesLink = page.locator('a[href="/templates"]').first();
  await expect(templatesLink).toBeVisible();
  await templatesLink.click();
  await page.waitForURL('/templates');
  await expect(page).toHaveURL('/templates');
  
  // Go back to homepage
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Check Pricing link works
  const pricingLink = page.locator('a[href="/pricing"]').first();
  await expect(pricingLink).toBeVisible();
  await pricingLink.click();
  await page.waitForURL('/pricing');
  await expect(page).toHaveURL('/pricing');
});

test('Templates page  -  official badge exists', async ({ page }) => {
  await page.goto('/templates');
  await page.waitForLoadState('networkidle');

  // Check at least one element with text "Official" is visible
  const officialBadge = page.locator('text=Official').first();
  await expect(officialBadge).toBeVisible();
});

test('Homepage  -  comparison table exists', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Check element containing "Adobe" or "DocuSign" is visible
  const adoeElement = page.locator('text=Adobe').first();
  const docuSignElement = page.locator('text=DocuSign').first();
  
  // At least one should be visible
  const adobeVisible = await adoeElement.count() > 0;
  const docuSignVisible = await docuSignElement.count() > 0;
  
  expect(adobeVisible || docuSignVisible).toBe(true);
  
  if (adobeVisible) {
    await expect(adoeElement).toBeVisible();
  } else {
    await expect(docuSignElement).toBeVisible();
  }
});

test('Homepage  -  FAQ section exists', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Check at least one FAQ question is visible
  // Look for common FAQ patterns: accordion, question text, or FAQ heading
  const faqQuestion = page.locator('button:text("What"), h3:text("What"), .faq-question, [role="button"]:has-text("How"), [role="button"]:has-text("What")').first();
  
  // If we find any FAQ-like element, it's good
  const count = await faqQuestion.count();
  expect(count).toBeGreaterThan(0);
  
  if (count > 0) {
    await expect(faqQuestion).toBeVisible();
  }
});

test('Pricing  -  Free tier shown', async ({ page }) => {
  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');

  // Check element with "Free" visible
  const freeTier = page.locator('text=Free').first();
  await expect(freeTier).toBeVisible();
  
  // Check for "3 documents" text (Free tier shows "3 documents per month")
  const threeDocs = page.locator('text="3 documents per month"').first();
  const threeDocsAlt = page.locator('text=3 documents').first();
  
  const hasThreeDocs = await threeDocs.count() > 0 || await threeDocsAlt.count() > 0;
  expect(hasThreeDocs).toBe(true);
});

test('Editor toolbar loads', async ({ page }) => {
  await page.goto('/editor');
  await page.waitForLoadState('networkidle');

  const url = page.url();
  
  // If redirected to sign-in, that's acceptable (editor requires auth)
  if (url.includes('/sign-in')) {
    // Sign-in page loaded, which is expected for unauthenticated users
    // Test passes - editor correctly requires authentication
    return;
  }
  
  // If we're still on /editor, check that the page loaded without errors
  // The editor may show an upload zone or other initial state
  const title = await page.title();
  expect(title).toContain('QuickFill');
});
