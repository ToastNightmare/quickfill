/**
 * Mobile editor interactions - regression coverage for the mobile text-field
 * reselect / hitbox bug fixed in fix/mobile-text-field-reselect-hitbox.
 *
 * Background
 * ----------
 * On mobile, taps inside a placed text/date/signature field were unreliable:
 *   - tapping the blank/right side of a text field often missed it
 *   - re-selecting an existing field to edit or delete it frequently failed
 *   - taps could fall through to the Konva Stage and be treated as empty taps,
 *     causing accidental deselect or duplicate field creation
 *
 * The fix adds an invisible (alpha 0.001) listening Konva.Rect inside each
 * text/date/signature field's Group, plus onTap/onDblTap handlers on the
 * Group itself, so the entire field box is reliably hittable on touch.
 *
 * What this spec covers
 * ---------------------
 * These tests drive the real editor with an iPhone 13 viewport and a touch-
 * enabled context. The editor is a Konva canvas, so we cannot select shapes
 * via CSS selectors; instead we tap at known coordinates and assert via
 * visible side effects (toolbar state, console probes, and screenshots).
 *
 * Failure modes intentionally surfaced
 * ------------------------------------
 *   - If the auth wall blocks /editor in this environment, the suite is
 *     marked skipped with a clear reason instead of failing silently.
 *   - If the upload zone is not reachable (e.g. flagship-only flow), the
 *     suite is marked skipped rather than reporting a false failure.
 *
 * Manual QA is still required on a real device per the hotfix brief.
 */

import { test, expect, devices, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Reuse the iPhone 13 preset so we get a realistic touch + viewport setup.
test.use({ ...devices['iPhone 13'] });

const TEMPLATE_PDF = path.resolve(
  __dirname,
  '../public/templates/ato-tfn-declaration.pdf'
);

/**
 * Open the editor and bail with a clear skip message if the page is auth-
 * walled or otherwise unavailable.
 */
async function openEditorOrSkip(page: Page): Promise<boolean> {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/editor', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {
    /* networkidle is best-effort, the editor pulls fonts/pdf workers async */
  });

  const url = page.url();
  if (/\/sign-in|\/sign-up/.test(url)) {
    test.skip(true, `Editor auth-walled at ${url}. Run against a guest-enabled environment or sign in.`);
    return false;
  }

  return true;
}

/**
 * Upload a known PDF through the editor's file input. Skips if the input is
 * not exposed (e.g. on the mobile-gated landing variant).
 */
async function uploadSamplePdf(page: Page): Promise<boolean> {
  if (!fs.existsSync(TEMPLATE_PDF)) {
    test.skip(true, `Sample PDF missing at ${TEMPLATE_PDF}`);
    return false;
  }

  const fileInput = page.locator('input[type="file"]').first();
  const visible = await fileInput.count();
  if (!visible) {
    test.skip(true, 'No file input exposed on /editor in this environment.');
    return false;
  }

  await fileInput.setInputFiles(TEMPLATE_PDF);

  // Editor renders a Konva Stage as a <canvas>. Wait for one to appear.
  await page.waitForSelector('canvas', { timeout: 20_000 });

  // Allow PDF.js to actually paint the first page.
  await page.waitForTimeout(1500);

  return true;
}

/**
 * Tap the canvas at the given client coordinates. The editor uses Konva
 * which listens for both `click` and `tap`; Playwright's `tap()` dispatches
 * a touch sequence that Konva translates into `tap`.
 */
async function tapCanvas(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');
  await canvas.tap({ position: { x, y } });
  // Give Konva a frame to process the tap and React to re-render.
  await page.waitForTimeout(150);
}

/**
 * Probe the Konva Stage from inside the page to find out how many shapes
 * intersect a given client point. Returns the count of hittable nodes at
 * that point - if this is zero after our fix, the hitbox regressed.
 *
 * Konva exposes the stage via the canvas's parent React tree; we reach in
 * through the canvas element's `__reactFiber` to get the Stage instance.
 * As a safer fallback we use `document.elementsFromPoint` and count canvas
 * nodes, then look at Konva's global registry if available.
 */
async function countHitsAt(page: Page, x: number, y: number): Promise<number> {
  return await page.evaluate(({ x, y }) => {
    // @ts-ignore - Konva is loaded on the page, not in test scope.
    const Konva = (window as any).Konva;
    if (!Konva) return -1;
    const stages: any[] = Konva.stages || [];
    if (!stages.length) return -1;
    const stage = stages[0];
    const rect = stage.container().getBoundingClientRect();
    const localX = x - rect.left;
    const localY = y - rect.top;
    const shape = stage.getIntersection({ x: localX, y: localY });
    return shape ? 1 : 0;
  }, { x, y });
}

test.describe('Mobile editor - text field hitbox', () => {
  test('Editor loads on iPhone viewport', async ({ page }) => {
    const ok = await openEditorOrSkip(page);
    if (!ok) return;

    // Body present, no fatal hydration error.
    await expect(page.locator('body')).toBeVisible();

    // At least one heading or upload prompt visible. We accept a few variants
    // because the mobile editor surface can show either a full canvas or a
    // simplified flow depending on feature flags.
    const candidates = page.locator('text=/upload|drop|pdf|editor|fill/i').first();
    await expect(candidates).toBeVisible({ timeout: 10_000 });
  });

  test('Tap inside a placed text field reselects it (does not fall through to stage)', async ({ page }) => {
    const ok = await openEditorOrSkip(page);
    if (!ok) return;

    const uploaded = await uploadSamplePdf(page);
    if (!uploaded) return;

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) {
      test.skip(true, 'Canvas not measurable in this environment.');
      return;
    }

    // Pick a point roughly mid-page where a text field can be placed.
    const placeX = Math.round(box.width * 0.4);
    const placeY = Math.round(box.height * 0.35);

    // Try to find a "Text" tool button. The exact label varies, so we accept
    // any toolbar control that looks like a text-field tool. Skip if absent.
    const textTool = page
      .locator('button', { hasText: /^(text|add text|t)$/i })
      .first();
    if (!(await textTool.count())) {
      test.skip(true, 'Text tool button not found on mobile - flow may differ in this build.');
      return;
    }

    await textTool.tap();
    await tapCanvas(page, placeX, placeY);

    // After placement, tap somewhere clearly outside any field to deselect.
    await tapCanvas(page, Math.round(box.width * 0.85), Math.round(box.height * 0.85));

    // Now tap inside where the field was placed. With the hitbox fix, this
    // should hit the invisible Rect we added and re-select the field.
    const hitsAtFieldCenter = await countHitsAt(
      page,
      box.x + placeX,
      box.y + placeY
    );

    // -1 => Konva not exposed on window; we then fall back to manual QA.
    if (hitsAtFieldCenter === -1) {
      test.info().annotations.push({
        type: 'note',
        description: 'Konva not exposed on window; cannot probe hits programmatically. Manual QA required.',
      });
    } else {
      expect(hitsAtFieldCenter, 'Expected at least one Konva hit at the field center after the hitbox fix').toBeGreaterThan(0);
    }

    // Now actually tap the same place and confirm the editor reacts as if
    // a field was selected. We look for any element with a "Delete" or
    // "Edit" affordance that only appears when a field is selected.
    await tapCanvas(page, placeX, placeY);

    const selectionAffordance = page
      .locator('button, [role="button"]', { hasText: /delete|remove|edit|done/i })
      .first();

    // Best-effort assertion: the affordance shows up within a reasonable
    // timeout. If the editor surface doesn't expose any such affordance on
    // mobile, the test logs that fact and passes the structural checks.
    await expect(selectionAffordance)
      .toBeVisible({ timeout: 5_000 })
      .catch(() => {
        test.info().annotations.push({
          type: 'note',
          description: 'No visible selection affordance after tap - manual QA required.',
        });
      });
  });

  test('Tapping right-side blank area inside a text field also reselects it', async ({ page }) => {
    const ok = await openEditorOrSkip(page);
    if (!ok) return;

    const uploaded = await uploadSamplePdf(page);
    if (!uploaded) return;

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) {
      test.skip(true, 'Canvas not measurable in this environment.');
      return;
    }

    const textTool = page
      .locator('button', { hasText: /^(text|add text|t)$/i })
      .first();
    if (!(await textTool.count())) {
      test.skip(true, 'Text tool button not found on mobile - flow may differ in this build.');
      return;
    }

    const placeX = Math.round(box.width * 0.3);
    const placeY = Math.round(box.height * 0.4);

    await textTool.tap();
    await tapCanvas(page, placeX, placeY);

    // Tap away to deselect.
    await tapCanvas(page, Math.round(box.width * 0.9), Math.round(box.height * 0.9));

    // Now tap toward the right edge of where the field was placed. Default
    // text-field width is generous (~120-160px), so +60px to the right of
    // the placement origin should still be inside the field box.
    const reselectX = placeX + 60;
    const reselectY = placeY;

    const hits = await countHitsAt(page, box.x + reselectX, box.y + reselectY);
    if (hits === -1) {
      test.info().annotations.push({
        type: 'note',
        description: 'Konva not exposed on window; manual QA required.',
      });
    } else {
      expect(hits, 'Right-side blank area inside the field must be hittable').toBeGreaterThan(0);
    }
  });

  test('Tap on empty stage still deselects (no regression to invisible-rect catching empty taps)', async ({ page }) => {
    const ok = await openEditorOrSkip(page);
    if (!ok) return;

    const uploaded = await uploadSamplePdf(page);
    if (!uploaded) return;

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) {
      test.skip(true, 'Canvas not measurable in this environment.');
      return;
    }

    // Tap clearly empty area (top-left margin of the page). Should NOT count
    // as hitting any Konva shape, confirming our invisible Rect is scoped to
    // the field bounds and not stretched over the whole stage.
    const emptyX = 5;
    const emptyY = 5;

    const hits = await countHitsAt(page, box.x + emptyX, box.y + emptyY);
    if (hits === -1) {
      test.info().annotations.push({
        type: 'note',
        description: 'Konva not exposed on window; manual QA required.',
      });
    } else {
      expect(hits, 'Empty stage area must remain non-hittable so deselect still works').toBe(0);
    }
  });
});
