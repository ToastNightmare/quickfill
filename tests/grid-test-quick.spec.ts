import { test, expect } from '@playwright/test';

test('Box field keyboard input', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  // Use bank-account-change which is less likely to be corrupted
  await page.goto('https://getquickfill.com/editor?template=bank-account-change.pdf');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Dismiss welcome modal
  const letsGo = page.locator('button:has-text("Let\'s go")').first();
  if (await letsGo.isVisible()) { await letsGo.click(); await page.waitForTimeout(800); }

  // Dismiss tour modal
  const skipTour = page.locator('button:has-text("Skip tour"), button:has-text("Skip")').first();
  if (await skipTour.isVisible()) { await skipTour.click(); await page.waitForTimeout(800); }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/grid-ready.png' });

  // Check for PDF render error
  const renderError = page.locator('text=Failed to render PDF');
  if (await renderError.isVisible()) {
    console.log('PDF failed to render - trying tenancy template');
    await page.goto('https://getquickfill.com/editor?template=tenancy-application-nsw.pdf');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    const letsGo2 = page.locator('button:has-text("Let\'s go")').first();
    if (await letsGo2.isVisible()) { await letsGo2.click(); await page.waitForTimeout(500); }
    const skip2 = page.locator('button:has-text("Skip tour"), button:has-text("Skip")').first();
    if (await skip2.isVisible()) { await skip2.click(); await page.waitForTimeout(500); }
    await page.waitForTimeout(2000);
  }

  // Click Box Field tool.
  const boxFieldTool = page.locator([
    'button:has-text("Box Field")',
    '[aria-label*="Box Field"]',
    '[title*="Box field"]',
    '[title*="character boxes"]',
  ].join(', ')).first();
  await expect(boxFieldTool).toBeVisible({ timeout: 5000 });
  await boxFieldTool.click();
  console.log('Box Field tool selected');
  await page.waitForTimeout(500);

  // Draw a box field on canvas
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('No canvas');

  const sx = box.x + box.width * 0.25;
  const sy = box.y + box.height * 0.25;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 220, sy + 35);
  await page.mouse.up();
  await page.waitForTimeout(1200);
  console.log('Box field drawn');
  await page.screenshot({ path: '/tmp/grid-drawn.png' });

  // Click to focus/select the box field
  await page.mouse.click(sx + 110, sy + 17);
  await page.waitForTimeout(800);

  // Type characters
  await page.keyboard.type('ABC');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/grid-typed.png' });
  console.log('Typed ABC - see /tmp/grid-typed.png');

  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');

  console.log(`Console errors: ${errors.length}`);
  if (errors.length) errors.forEach(e => console.log(' ERR:', e));
  console.log('DONE - check screenshots');
});
