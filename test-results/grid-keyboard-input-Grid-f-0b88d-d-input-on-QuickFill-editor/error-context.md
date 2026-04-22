# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: grid-keyboard-input.spec.ts >> Grid field keyboard input >> Test grid field input on QuickFill editor
- Location: tests/grid-keyboard-input.spec.ts:4:7

# Error details

```
Error: page.goto: net::ERR_NETWORK_CHANGED at https://getquickfill.com/editor
Call log:
  - navigating to "https://getquickfill.com/editor", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect, Page } from '@playwright/test';
  2   | 
  3   | test.describe('Grid field keyboard input', () => {
  4   |   test('Test grid field input on QuickFill editor', async ({ page }) => {
  5   |     const errors: string[] = [];
  6   |     page.on('console', msg => {
  7   |       if (msg.type() === 'error') {
  8   |         errors.push(`[${msg.type()}] ${msg.text()}`);
  9   |       }
  10  |     });
  11  | 
  12  |     // Navigate to editor
  13  |     console.log('Navigating to https://getquickfill.com/editor');
> 14  |     await page.goto('https://getquickfill.com/editor');
      |                ^ Error: page.goto: net::ERR_NETWORK_CHANGED at https://getquickfill.com/editor
  15  |     
  16  |     // Wait for page to load
  17  |     await page.waitForLoadState('networkidle');
  18  |     
  19  |     // Check if we're redirected to sign-in
  20  |     const currentUrl = page.url();
  21  |     const isSignIn = currentUrl.includes('/sign-in') || currentUrl.includes('/signup') || 
  22  |                      currentUrl.includes('/sign-up') || await page.isVisible('input[name="email"], input[type="email"]');
  23  |     
  24  |     if (isSignIn) {
  25  |       console.log('Redirected to sign-in page. Checking if test account is available...');
  26  |       
  27  |       // Check for Clerk sign-in form
  28  |       const clerkFrame = page.frameLocator('iframe[src*="clerk"]').first();
  29  |       const hasClerkFrame = await clerkFrame.count() > 0;
  30  |       
  31  |       if (hasClerkFrame) {
  32  |         console.log('Clerk authentication detected. No test credentials available.');
  33  |         
  34  |         // Write result with limitations
  35  |         const result = `FAIL - Cannot sign in to test grid field input. Authentication required. No test account available.\n\nURL: ${currentUrl}\nAuthentication: Clerk detected\nErrors: ${errors.length > 0 ? errors.join('\\n') : 'None'}`;
  36  |         
  37  |         await writeResult(result);
  38  |         return;
  39  |       }
  40  |       
  41  |       // Try to look for any email/password fields
  42  |       const emailField = page.locator('input[type="email"], input[name="email"]').first();
  43  |       if (await emailField.count() > 0) {
  44  |         console.log('Sign-in form detected but no test credentials available.');
  45  |         
  46  |         const result = `FAIL - Cannot sign in to test grid field input. Authentication required. No test account available.\n\nURL: ${currentUrl}\nForm detected but no credentials\nErrors: ${errors.length > 0 ? errors.join('\\n') : 'None'}`;
  47  |         
  48  |         await writeResult(result);
  49  |         return;
  50  |       }
  51  |       
  52  |       // Unknown authentication state
  53  |       console.log('Unknown authentication state');
  54  |       const result = `FAIL - Cannot sign in to test grid field input. Authentication required.\n\nURL: ${currentUrl}\nUnknown auth state\nErrors: ${errors.length > 0 ? errors.join('\\n') : 'None'}`;
  55  |       
  56  |       await writeResult(result);
  57  |       return;
  58  |     }
  59  |     
  60  |     // Check if we're actually in the editor
  61  |     const isEditor = currentUrl.includes('/editor') || 
  62  |                      await page.isVisible('[data-testid="editor"], canvas, .pdf-viewer, .document-container');
  63  |     
  64  |     if (!isEditor) {
  65  |       console.log('Not in editor. Current page state unknown.');
  66  |       const result = `FAIL - Not in editor after navigation.\n\nURL: ${currentUrl}\nExpected editor but found something else\nErrors: ${errors.length > 0 ? errors.join('\\n') : 'None'}`;
  67  |       
  68  |       await writeResult(result);
  69  |       return;
  70  |     }
  71  |     
  72  |     console.log('In editor. Looking for template functionality...');
  73  |     
  74  |     // Try to find and use TFN Declaration template
  75  |     // First check if there's a template selector or template library
  76  |     const templateButton = page.locator('button:has-text("Template"), button:has-text("templates"), [data-testid="template-selector"]').first();
  77  |     const hasTemplateButton = await templateButton.count() > 0;
  78  |     
  79  |     if (!hasTemplateButton) {
  80  |       console.log('No template button found. May already have a document loaded.');
  81  |       // Continue with existing document
  82  |     } else {
  83  |       await templateButton.click();
  84  |       await page.waitForTimeout(1000);
  85  |       
  86  |       // Look for TFN Declaration template
  87  |       const tfnTemplate = page.locator('text="Tax File Number Declaration", text="TFN Declaration", text="TFN"').first();
  88  |       if (await tfnTemplate.count() > 0) {
  89  |         await tfnTemplate.click();
  90  |         console.log('Selected TFN Declaration template');
  91  |         await page.waitForTimeout(2000); // Wait for PDF to load
  92  |       } else {
  93  |         console.log('TFN Declaration template not found. Trying any available template...');
  94  |         const anyTemplate = page.locator('[data-testid="template-item"], .template-item').first();
  95  |         if (await anyTemplate.count() > 0) {
  96  |           await anyTemplate.click();
  97  |           console.log('Selected first available template');
  98  |           await page.waitForTimeout(2000);
  99  |         }
  100 |       }
  101 |     }
  102 |     
  103 |     // Look for grid tool
  104 |     console.log('Looking for grid tool...');
  105 |     const gridTool = page.locator('button[title*="grid"], button[aria-label*="grid"], [data-testid="grid-tool"], button:has-text("Grid")').first();
  106 |     
  107 |     if (await gridTool.count() === 0) {
  108 |       console.log('Grid tool not found. Checking available tools...');
  109 |       // Try to find any tool palette
  110 |       const tools = page.locator('[data-testid*="tool"], .tool-button, button[title*="tool"]');
  111 |       const toolCount = await tools.count();
  112 |       console.log(`Found ${toolCount} potential tools`);
  113 |       
  114 |       if (toolCount === 0) {
```