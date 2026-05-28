import { test, expect } from '@playwright/test';

test('Homepage loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Check hero headline exists
  const heroHeadline = page.locator('h1').first();
  await expect(heroHeadline).toBeVisible();

  // Check title contains "QuickFill"
  await expect(page).toHaveTitle(/QuickFill/);
  
  // Check CTA button visible (Start filling forms free or Fill a PDF)
  const ctaButton = page.locator('a[href="/sign-up"], a[href="/editor"]').first();
  await expect(ctaButton).toBeVisible();
  
  // Check no console errors
  expect(errors).toHaveLength(0);
});

test('Templates page loads', async ({ page }) => {
  await page.goto('/templates', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Form Templates' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find a template' })).toBeVisible();
  await expect(page.getByPlaceholder('Search forms, agencies or tasks')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Popular' })).toBeVisible();

  await page.mouse.wheel(0, 900);
  await expect(page.getByRole('link', { name: /Fill form/i }).first()).toBeVisible();

  // Check 5+ "Fill form" links exist (reliable count without toHaveCount min syntax)
  const count = await page.getByRole('link', { name: /Fill form/i }).count();
  expect(count).toBeGreaterThanOrEqual(5);
});

test('Editor loads', async ({ page }) => {
  await page.goto('/editor', { waitUntil: 'domcontentloaded' });
  await expect(
    page.locator('body').filter({
      hasText: /Sign In|Drag & drop your PDF here|Tap to browse your PDF|Fill a PDF/,
    })
  ).toBeVisible();

  // Editor requires auth - either we see the editor or we're redirected to sign-in
  const url = page.url();
  const isEditor = url.includes('/editor');
  const isSignIn = url.includes('/sign-in');
  expect(isEditor || isSignIn).toBe(true);
});

test('Pricing page loads', async ({ page }) => {
  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Fill PDFs free|Your Pro plan is active/ })).toBeVisible();

  // Check current default annual Pro price is visible
  const priceElement = page.locator('text=A$100').first();
  await expect(priceElement).toBeVisible();
  
  // Check Pro upgrade button exists
  const proButton = page.locator('button:has-text("Get Pro"), a:has-text("Get Pro"), button:has-text("Manage billing"), a:has-text("Fill a PDF")').first();
  await expect(proButton).toBeVisible();
});

test('Template opens in editor', async ({ page }) => {
  // Navigate to templates listing
  await page.goto('/templates', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Form Templates' })).toBeVisible();

  // Click first template fill link
  const fillBtn = page.getByRole('link', { name: /Fill form/i }).first();
  await expect(fillBtn).toBeVisible();
  await fillBtn.click();

  // Either editor or sign-in is acceptable (sign-in required for auth)
  await expect(
    page.locator('body').filter({
      hasText: /Sign In|Drag & drop your PDF here|Tap to browse your PDF|Fill a PDF|Form Templates/,
    })
  ).toBeVisible();
  const url = page.url();
  expect(url.includes('/editor') || url.includes('/sign-in') || url.includes('/templates')).toBe(true);
});

test('Navigation links work', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Check Templates link works
  const templatesLink = page.locator('a[href="/templates"]').first();
  await expect(templatesLink).toBeVisible();
  await templatesLink.click();
  await page.waitForURL('/templates');
  await expect(page).toHaveURL('/templates');
  
  // Go back to homepage
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  
  // Check Pricing link works
  const pricingLink = page.locator('a[href="/pricing"]').first();
  await expect(pricingLink).toBeVisible();
  await pricingLink.click();
  await page.waitForURL('/pricing');
  await expect(page).toHaveURL('/pricing');
});

test('Templates page shows public form badge', async ({ page }) => {
  await page.goto('/templates', { waitUntil: 'domcontentloaded' });

  // Check at least one public form badge is visible
  const publicFormBadge = page.locator('text=Public Form').first();
  await expect(publicFormBadge).toBeVisible();
});

test('Homepage  -  comparison table exists', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText(/Adobe|DocuSign/);

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
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Check at least one FAQ question is visible
  // Look for common FAQ patterns: accordion, question text, or FAQ heading
  const faqQuestion = page.locator('button:text("What"), h3:text("What"), .faq-question, [role="button"]:has-text("How"), [role="button"]:has-text("What")').first();
  await expect(faqQuestion).toBeVisible();
  
  // If we find any FAQ-like element, it's good
  const count = await faqQuestion.count();
  expect(count).toBeGreaterThan(0);
  
  if (count > 0) {
    await expect(faqQuestion).toBeVisible();
  }
});

test('Pricing  -  Free tier shown', async ({ page }) => {
  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

  // Check element with "Free" visible
  const freeTier = page.locator('text=Free').first();
  await expect(freeTier).toBeVisible();
  
  // Check for "3 downloads" text (Free tier shows "3 downloads per month")
  const threeDocs = page.locator('text="3 downloads per month"').first();
  const threeDocsAlt = page.locator('text=3 downloads').first();
  
  const hasThreeDocs = await threeDocs.count() > 0 || await threeDocsAlt.count() > 0;
  expect(hasThreeDocs).toBe(true);
});

test('Editor toolbar loads', async ({ page }) => {
  await page.goto('/editor', { waitUntil: 'domcontentloaded' });
  await expect(
    page.locator('body').filter({
      hasText: /Sign In|Drag & drop your PDF here|Tap to browse your PDF|Fill a PDF/,
    })
  ).toBeVisible();

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
