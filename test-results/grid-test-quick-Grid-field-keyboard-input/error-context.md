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
- generic [ref=e2]:
  - heading "Something went wrong" [level=2] [ref=e3]
  - button "Try again" [ref=e4]
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