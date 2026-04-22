# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: grid-test-quick.spec.ts >> Grid field keyboard input
- Location: tests/grid-test-quick.spec.ts:3:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("Grid"), [aria-label*="Grid"], [title*="Grid"], [title*="grid"]').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button:has-text("Grid"), [aria-label*="Grid"], [title*="Grid"], [title*="grid"]').first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - navigation [ref=e2]:
    - generic [ref=e3]:
      - link "QuickFill" [ref=e4] [cursor=pointer]:
        - /url: /
        - img "QuickFill" [ref=e5]
      - generic [ref=e6]:
        - link "How It Works" [ref=e7] [cursor=pointer]:
          - /url: /how-it-works
        - link "Templates" [ref=e8] [cursor=pointer]:
          - /url: /templates
        - link "Fill a PDF" [ref=e9] [cursor=pointer]:
          - /url: /editor
        - link "Pricing" [ref=e10] [cursor=pointer]:
          - /url: /pricing
        - link "Sign In" [ref=e11] [cursor=pointer]:
          - /url: /sign-in
        - link "Try Free" [ref=e12] [cursor=pointer]:
          - /url: /sign-up
  - main [ref=e13]:
    - generic [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]:
          - link "Templates" [ref=e17] [cursor=pointer]:
            - /url: /templates
            - img [ref=e18]
            - generic [ref=e20]: Templates
          - generic [ref=e21]: /
          - paragraph [ref=e22]: tenancy-application-nsw.pdf
        - generic [ref=e23]:
          - button "Zoom Out" [ref=e24]:
            - img [ref=e25]
          - generic [ref=e26]: 100%
          - generic [ref=e27]: ↑snap
          - button "Zoom In" [ref=e28]:
            - img [ref=e29]
          - button "Fit" [ref=e30]
          - button "Snap" [ref=e31]
      - generic [ref=e32]:
        - generic [ref=e34]:
          - generic [ref=e35]:
            - paragraph [ref=e36]: Place Fields
            - button "Text Field" [ref=e37]:
              - img [ref=e38]
              - generic [ref=e40]: Text Field
            - button "Box Field" [ref=e41]:
              - img [ref=e42]
              - generic [ref=e45]: Box Field
            - button "Checkbox" [ref=e46]:
              - img [ref=e47]
              - generic [ref=e50]: Checkbox
            - button "Signature" [ref=e51]:
              - img [ref=e52]
              - generic [ref=e57]: Signature
            - button "Date" [ref=e58]:
              - img [ref=e59]
              - generic [ref=e61]: Date
            - button "Whiteout" [ref=e62]:
              - img [ref=e63]
              - generic [ref=e66]: Whiteout
            - paragraph [ref=e68]: Actions
            - button "Undo ⌃Z" [disabled] [ref=e69]:
              - img [ref=e70]
              - generic [ref=e73]:
                - text: Undo
                - generic [ref=e74]: ⌃Z
            - button "Redo ⌃⇧Z" [disabled] [ref=e75]:
              - img [ref=e76]
              - generic [ref=e79]:
                - text: Redo
                - generic [ref=e80]: ⌃⇧Z
            - button "Snap Off" [ref=e81]:
              - img [ref=e82]
              - generic [ref=e86]: Snap Off
            - button "Clear Fields" [ref=e87]:
              - img [ref=e88]
              - generic [ref=e91]: Clear Fields
            - button "Save Progress" [ref=e93]:
              - img [ref=e94]
              - generic [ref=e98]: Save Progress
            - button "Start Over" [ref=e99]:
              - img [ref=e100]
              - generic [ref=e103]: Start Over
            - button "Download PDF" [ref=e104]:
              - img [ref=e105]
              - generic [ref=e108]: Download PDF
          - link "Upgrade to Pro" [ref=e110] [cursor=pointer]:
            - /url: /pricing
          - button "Show tutorial" [ref=e112]:
            - img [ref=e113]
        - paragraph [ref=e120]: Failed to render PDF. The file may be corrupted.
        - generic [ref=e125]:
          - generic [ref=e126]:
            - img [ref=e128]
            - paragraph [ref=e130]: Nothing selected
            - paragraph [ref=e131]: Click a tool on the left to start placing fields, or click an existing field to edit it.
          - generic [ref=e133]:
            - paragraph [ref=e134]: Quick Actions
            - button "Auto-fill from Profile" [ref=e135]:
              - img [ref=e136]
              - text: Auto-fill from Profile
            - button "Auto-detect Fields" [ref=e140]:
              - img [ref=e141]
              - text: Auto-detect Fields
  - contentinfo [ref=e144]:
    - generic [ref=e146]:
      - link "Privacy Policy" [ref=e147] [cursor=pointer]:
        - /url: /privacy
      - link "Terms of Service" [ref=e148] [cursor=pointer]:
        - /url: /terms
      - link "Contact" [ref=e149] [cursor=pointer]:
        - /url: mailto:support@getquickfill.com
      - paragraph [ref=e150]: (c) 2026 QuickFill. All rights reserved.
  - alert [ref=e151]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('Grid field keyboard input', async ({ page }) => {
  4  |   const errors: string[] = [];
  5  |   page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  6  | 
  7  |   // Use bank-account-change which is less likely to be corrupted
  8  |   await page.goto('https://getquickfill.com/editor?template=bank-account-change.pdf');
  9  |   await page.waitForLoadState('networkidle');
  10 |   await page.waitForTimeout(2000);
  11 | 
  12 |   // Dismiss welcome modal
  13 |   const letsGo = page.locator('button:has-text("Let\'s go")').first();
  14 |   if (await letsGo.isVisible()) { await letsGo.click(); await page.waitForTimeout(800); }
  15 | 
  16 |   // Dismiss tour modal
  17 |   const skipTour = page.locator('button:has-text("Skip tour"), button:has-text("Skip")').first();
  18 |   if (await skipTour.isVisible()) { await skipTour.click(); await page.waitForTimeout(800); }
  19 | 
  20 |   await page.waitForTimeout(2000);
  21 |   await page.screenshot({ path: '/tmp/grid-ready.png' });
  22 | 
  23 |   // Check for PDF render error
  24 |   const renderError = page.locator('text=Failed to render PDF');
  25 |   if (await renderError.isVisible()) {
  26 |     console.log('PDF failed to render - trying tenancy template');
  27 |     await page.goto('https://getquickfill.com/editor?template=tenancy-application-nsw.pdf');
  28 |     await page.waitForLoadState('networkidle');
  29 |     await page.waitForTimeout(3000);
  30 |     const letsGo2 = page.locator('button:has-text("Let\'s go")').first();
  31 |     if (await letsGo2.isVisible()) { await letsGo2.click(); await page.waitForTimeout(500); }
  32 |     const skip2 = page.locator('button:has-text("Skip tour"), button:has-text("Skip")').first();
  33 |     if (await skip2.isVisible()) { await skip2.click(); await page.waitForTimeout(500); }
  34 |     await page.waitForTimeout(2000);
  35 |   }
  36 | 
  37 |   // Click Grid tool (label "Grid" in sidebar)
  38 |   const gridTool = page.locator('button:has-text("Grid"), [aria-label*="Grid"], [title*="Grid"], [title*="grid"]').first();
> 39 |   await expect(gridTool).toBeVisible({ timeout: 5000 });
     |                          ^ Error: expect(locator).toBeVisible() failed
  40 |   await gridTool.click();
  41 |   console.log('Grid tool selected');
  42 |   await page.waitForTimeout(500);
  43 | 
  44 |   // Draw a grid field on canvas
  45 |   const canvas = page.locator('canvas').first();
  46 |   const box = await canvas.boundingBox();
  47 |   if (!box) throw new Error('No canvas');
  48 | 
  49 |   const sx = box.x + box.width * 0.25;
  50 |   const sy = box.y + box.height * 0.25;
  51 |   await page.mouse.move(sx, sy);
  52 |   await page.mouse.down();
  53 |   await page.mouse.move(sx + 220, sy + 35);
  54 |   await page.mouse.up();
  55 |   await page.waitForTimeout(1200);
  56 |   console.log('Grid field drawn');
  57 |   await page.screenshot({ path: '/tmp/grid-drawn.png' });
  58 | 
  59 |   // Click to focus/select the grid field
  60 |   await page.mouse.click(sx + 110, sy + 17);
  61 |   await page.waitForTimeout(800);
  62 | 
  63 |   // Type characters
  64 |   await page.keyboard.type('ABC');
  65 |   await page.waitForTimeout(800);
  66 |   await page.screenshot({ path: '/tmp/grid-typed.png' });
  67 |   console.log('Typed ABC - see /tmp/grid-typed.png');
  68 | 
  69 |   await page.keyboard.press('Backspace');
  70 |   await page.waitForTimeout(300);
  71 |   await page.keyboard.press('ArrowLeft');
  72 |   await page.keyboard.press('ArrowRight');
  73 | 
  74 |   console.log(`Console errors: ${errors.length}`);
  75 |   if (errors.length) errors.forEach(e => console.log(' ERR:', e));
  76 |   console.log('DONE - check screenshots');
  77 | });
  78 | 
```