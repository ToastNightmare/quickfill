import { test, expect } from '@playwright/test';

test('Debug editor page', async ({ page }) => {
  console.log('Navigating to https://getquickfill.com/editor');
  await page.goto('https://getquickfill.com/editor');
  await page.waitForLoadState('networkidle');
  
  console.log('URL:', page.url());
  
  // Check for sign-in elements
  const signInSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'button:has-text("Sign in")',
    'button:has-text("Sign In")',
    'button:has-text("Continue")',
    'iframe[src*="clerk"]',
    '[data-testid*="clerk"]'
  ];
  
  for (const selector of signInSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`Found sign-in element: ${selector} (${count} elements)`);
    }
  }
  
  // Check for editor elements
  const editorSelectors = [
    'canvas',
    '.pdf-viewer',
    '.document-container',
    '[data-testid*="editor"]',
    '[data-testid*="tool"]',
    'button[title*="tool"]',
    '.toolbar',
    '.sidebar'
  ];
  
  for (const selector of editorSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`Found editor element: ${selector} (${count} elements)`);
    }
  }
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/debug-editor.png' });
  console.log('Screenshot saved to /tmp/debug-editor.png');
  
  // Get page HTML for analysis
  const bodyHTML = await page.locator('body').innerHTML();
  const bodyPreview = bodyHTML.substring(0, 2000);
  console.log('Body preview (first 2000 chars):', bodyPreview);
  
  // Check for text content that might indicate auth state
  const pageText = await page.textContent('body');
  const textPreview = pageText?.substring(0, 1000);
  console.log('Text preview (first 1000 chars):', textPreview);
});