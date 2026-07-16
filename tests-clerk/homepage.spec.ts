import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

const BROWSER_ORIGIN = 'http://localhost:3000';
const MAX_MAIN_FRAME_NAVIGATIONS = 8;

test('renders the public QuickFill homepage', async ({ page }) => {
  let mainFrameNavigationCount = 0;

  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      mainFrameNavigationCount += 1;
    }
  });

  await setupClerkTestingToken({ page });

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });

  if (!response) {
    throw new Error('Homepage navigation did not return an HTTP response.');
  }

  expect(response.ok()).toBe(true);

  const finalLocation = new URL(page.url());
  expect({
    origin: finalLocation.origin,
    pathname: finalLocation.pathname,
  }).toEqual({
    origin: BROWSER_ORIGIN,
    pathname: '/',
  });
  expect(mainFrameNavigationCount).toBeLessThanOrEqual(
    MAX_MAIN_FRAME_NAVIGATIONS,
  );
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Fill PDF Forms Online',
    }),
  ).toBeVisible();
});
