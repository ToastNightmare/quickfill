import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  await page.goto('https://getquickfill.com/pricing');
  await page.waitForLoadState('networkidle');
  
  console.log('Testing locator: text=Unlimited documents');
  const loc1 = page.locator('text=Unlimited documents');
  const count1 = await loc1.count();
  console.log(`Count: ${count1}`);
  
  console.log('\nTesting locator: text=Unlimited fill history');
  const loc2 = page.locator('text=Unlimited fill history');
  const count2 = await loc2.count();
  console.log(`Count: ${count2}`);
  
  console.log('\nTesting locator: text=Priority support');
  const loc3 = page.locator('text=Priority support');
  const count3 = await loc3.count();
  console.log(`Count: ${count3}`);
  
  console.log('\nTesting locator: text=No watermarks');
  const loc4 = page.locator('text=No watermarks');
  const count4 = await loc4.count();
  console.log(`Count: ${count4}`);
  
  console.log('\nTesting combined locator with OR');
  const combined = page.locator('text=Unlimited documents').or(page.locator('text=No watermarks')).or(page.locator('text=Priority support')).or(page.locator('text=Unlimited fill history'));
  const combinedCount = await combined.count();
  console.log(`Combined count: ${combinedCount}`);
  
  // Debug: show what we found
  for (let i = 0; i < combinedCount; i++) {
    const text = await combined.nth(i).textContent();
    console.log(`  ${i}: "${text?.substring(0, 50)}..."`);
  }
  
  // Wait for manual inspection
  console.log('\nPage loaded. Press Ctrl+C to close browser.');
  await page.waitForTimeout(30000);
  
  await browser.close();
})();