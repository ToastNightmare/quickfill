# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: quickfill-qa.spec.ts >> Templates page loads
- Location: tests/quickfill-qa.spec.ts:29:5

# Error details

```
Error: page.goto: net::ERR_NETWORK_CHANGED at https://getquickfill.com/templates
Call log:
  - navigating to "https://getquickfill.com/templates", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test('Homepage loads', async ({ page }) => {
  4   |   const errors: string[] = [];
  5   |   page.on('console', (msg) => {
  6   |     if (msg.type() === 'error') {
  7   |       errors.push(msg.text());
  8   |     }
  9   |   });
  10  | 
  11  |   await page.goto('/');
  12  |   await page.waitForLoadState('networkidle');
  13  | 
  14  |   // Check title contains "QuickFill"
  15  |   await expect(page).toHaveTitle(/QuickFill/);
  16  |   
  17  |   // Check hero headline exists
  18  |   const heroHeadline = page.locator('h1').first();
  19  |   await expect(heroHeadline).toBeVisible();
  20  |   
  21  |   // Check CTA button visible (Start filling forms free or Fill a PDF)
  22  |   const ctaButton = page.locator('a[href="/sign-up"], a[href="/editor"]').first();
  23  |   await expect(ctaButton).toBeVisible();
  24  |   
  25  |   // Check no console errors
  26  |   expect(errors).toHaveLength(0);
  27  | });
  28  | 
  29  | test('Templates page loads', async ({ page }) => {
> 30  |   await page.goto('/templates');
      |              ^ Error: page.goto: net::ERR_NETWORK_CHANGED at https://getquickfill.com/templates
  31  |   await page.waitForLoadState('networkidle');
  32  | 
  33  |   // Check 5+ "Fill This Form" buttons exist (reliable count without toHaveCount min syntax)
  34  |   const count = await page.locator('a:has-text("Fill This Form")').count();
  35  |   expect(count).toBeGreaterThanOrEqual(5);
  36  |   
  37  |   // Check "Tax File Number Declaration" template exists with more reliable selector
  38  |   await expect(page.locator('text=Tax File Number').first()).toBeVisible();
  39  | });
  40  | 
  41  | test('Editor loads', async ({ page }) => {
  42  |   await page.goto('/editor');
  43  |   await page.waitForLoadState('networkidle');
  44  | 
  45  |   // Editor requires auth - either we see the editor or we're redirected to sign-in
  46  |   const url = page.url();
  47  |   const isEditor = url.includes('/editor');
  48  |   const isSignIn = url.includes('/sign-in');
  49  |   expect(isEditor || isSignIn).toBe(true);
  50  | });
  51  | 
  52  | test('Pricing page loads', async ({ page }) => {
  53  |   await page.goto('/pricing');
  54  |   await page.waitForLoadState('networkidle');
  55  | 
  56  |   // Check "$12" is visible (Pro monthly price)
  57  |   const priceElement = page.locator('text="$12"').first();
  58  |   await expect(priceElement).toBeVisible();
  59  |   
  60  |   // Check Pro upgrade button exists
  61  |   const proButton = page.locator('button:has-text("Upgrade to Pro"), a:has-text("Upgrade to Pro")').first();
  62  |   await expect(proButton).toBeVisible();
  63  | });
  64  | 
  65  | test('Template opens in editor', async ({ page }) => {
  66  |   // Navigate to templates listing
  67  |   await page.goto('/templates');
  68  |   await page.waitForLoadState('networkidle');
  69  | 
  70  |   // Click first Fill This Form button
  71  |   const fillBtn = page.locator('a:has-text("Fill This Form")').first();
  72  |   await fillBtn.click();
  73  | 
  74  |   // Either editor or sign-in is acceptable (sign-in required for auth)
  75  |   await page.waitForLoadState('networkidle');
  76  |   const url = page.url();
  77  |   expect(url.includes('/editor') || url.includes('/sign-in') || url.includes('/templates')).toBe(true);
  78  | });
  79  | 
  80  | test('Navigation links work', async ({ page }) => {
  81  |   await page.goto('/');
  82  |   await page.waitForLoadState('networkidle');
  83  | 
  84  |   // Check Templates link works
  85  |   const templatesLink = page.locator('a[href="/templates"]').first();
  86  |   await expect(templatesLink).toBeVisible();
  87  |   await templatesLink.click();
  88  |   await page.waitForURL('/templates');
  89  |   await expect(page).toHaveURL('/templates');
  90  |   
  91  |   // Go back to homepage
  92  |   await page.goto('/');
  93  |   await page.waitForLoadState('networkidle');
  94  |   
  95  |   // Check Pricing link works
  96  |   const pricingLink = page.locator('a[href="/pricing"]').first();
  97  |   await expect(pricingLink).toBeVisible();
  98  |   await pricingLink.click();
  99  |   await page.waitForURL('/pricing');
  100 |   await expect(page).toHaveURL('/pricing');
  101 | });
  102 | 
  103 | test('Templates page — official badge exists', async ({ page }) => {
  104 |   await page.goto('/templates');
  105 |   await page.waitForLoadState('networkidle');
  106 | 
  107 |   // Check at least one element with text "Official" is visible
  108 |   const officialBadge = page.locator('text=Official').first();
  109 |   await expect(officialBadge).toBeVisible();
  110 | });
  111 | 
  112 | test('Homepage — comparison table exists', async ({ page }) => {
  113 |   await page.goto('/');
  114 |   await page.waitForLoadState('networkidle');
  115 | 
  116 |   // Check element containing "Adobe" or "DocuSign" is visible
  117 |   const adoeElement = page.locator('text=Adobe').first();
  118 |   const docuSignElement = page.locator('text=DocuSign').first();
  119 |   
  120 |   // At least one should be visible
  121 |   const adobeVisible = await adoeElement.count() > 0;
  122 |   const docuSignVisible = await docuSignElement.count() > 0;
  123 |   
  124 |   expect(adobeVisible || docuSignVisible).toBe(true);
  125 |   
  126 |   if (adobeVisible) {
  127 |     await expect(adoeElement).toBeVisible();
  128 |   } else {
  129 |     await expect(docuSignElement).toBeVisible();
  130 |   }
```