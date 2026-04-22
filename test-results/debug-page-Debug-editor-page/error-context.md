# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: debug-page.spec.ts >> Debug editor page
- Location: tests/debug-page.spec.ts:3:5

# Error details

```
Error: page.goto: net::ERR_NETWORK_CHANGED at https://getquickfill.com/editor
Call log:
  - navigating to "https://getquickfill.com/editor", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('Debug editor page', async ({ page }) => {
  4  |   console.log('Navigating to https://getquickfill.com/editor');
> 5  |   await page.goto('https://getquickfill.com/editor');
     |              ^ Error: page.goto: net::ERR_NETWORK_CHANGED at https://getquickfill.com/editor
  6  |   await page.waitForLoadState('networkidle');
  7  |   
  8  |   console.log('URL:', page.url());
  9  |   
  10 |   // Check for sign-in elements
  11 |   const signInSelectors = [
  12 |     'input[type="email"]',
  13 |     'input[name="email"]',
  14 |     'button:has-text("Sign in")',
  15 |     'button:has-text("Sign In")',
  16 |     'button:has-text("Continue")',
  17 |     'iframe[src*="clerk"]',
  18 |     '[data-testid*="clerk"]'
  19 |   ];
  20 |   
  21 |   for (const selector of signInSelectors) {
  22 |     const count = await page.locator(selector).count();
  23 |     if (count > 0) {
  24 |       console.log(`Found sign-in element: ${selector} (${count} elements)`);
  25 |     }
  26 |   }
  27 |   
  28 |   // Check for editor elements
  29 |   const editorSelectors = [
  30 |     'canvas',
  31 |     '.pdf-viewer',
  32 |     '.document-container',
  33 |     '[data-testid*="editor"]',
  34 |     '[data-testid*="tool"]',
  35 |     'button[title*="tool"]',
  36 |     '.toolbar',
  37 |     '.sidebar'
  38 |   ];
  39 |   
  40 |   for (const selector of editorSelectors) {
  41 |     const count = await page.locator(selector).count();
  42 |     if (count > 0) {
  43 |       console.log(`Found editor element: ${selector} (${count} elements)`);
  44 |     }
  45 |   }
  46 |   
  47 |   // Take screenshot
  48 |   await page.screenshot({ path: '/tmp/debug-editor.png' });
  49 |   console.log('Screenshot saved to /tmp/debug-editor.png');
  50 |   
  51 |   // Get page HTML for analysis
  52 |   const bodyHTML = await page.locator('body').innerHTML();
  53 |   const bodyPreview = bodyHTML.substring(0, 2000);
  54 |   console.log('Body preview (first 2000 chars):', bodyPreview);
  55 |   
  56 |   // Check for text content that might indicate auth state
  57 |   const pageText = await page.textContent('body');
  58 |   const textPreview = pageText?.substring(0, 1000);
  59 |   console.log('Text preview (first 1000 chars):', textPreview);
  60 | });
```