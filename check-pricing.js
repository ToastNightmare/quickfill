import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to pricing page...');
  await page.goto('https://getquickfill.com/pricing');
  await page.waitForLoadState('networkidle');
  
  console.log('\n=== Checking button text ===');
  // Look for any buttons that might be upgrade related
  const allButtons = page.locator('button, a[role="button"], .btn, [class*="button"]');
  const buttonCount = await allButtons.count();
  console.log(`Total buttons/links: ${buttonCount}`);
  
  const upgradeKeywords = ['upgrade', 'pro', 'get pro', 'month', '$12', 'unlimited', 'annual', '$100'];
  for (let i = 0; i < Math.min(buttonCount, 20); i++) {
    try {
      const text = await allButtons.nth(i).textContent();
      const lowerText = text?.toLowerCase() || '';
      if (upgradeKeywords.some(kw => lowerText.includes(kw.toLowerCase()))) {
        const tag = await allButtons.nth(i).evaluate(el => el.tagName);
        const classAttr = await allButtons.nth(i).getAttribute('class') || '';
        console.log(`✓ Found upgrade-related button [${tag}.${classAttr.split(' ')[0]}]: "${text?.trim().substring(0, 80)}..."`);
      }
    } catch (e) {}
  }
  
  console.log('\n=== Checking Pro features ===');
  // Get all text content on page and search for Pro features
  const bodyText = await page.textContent('body');
  const lines = bodyText?.split('\n').map(l => l.trim()).filter(l => l.length > 0) || [];
  
  const proFeatureLines = lines.filter(line => 
    line.toLowerCase().includes('unlimited') ||
    line.toLowerCase().includes('watermark') ||
    line.toLowerCase().includes('template') ||
    line.toLowerCase().includes('priority') ||
    line.toLowerCase().includes('pro')
  );
  
  console.log(`Found ${proFeatureLines.length} lines with Pro-related text`);
  proFeatureLines.slice(0, 20).forEach((line, i) => {
    console.log(`  ${i+1}. ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
  });
  
  console.log('\n=== Specific search for test phrases ===');
  const testPhrases = [
    'Unlimited documents',
    'No watermarks', 
    'All templates',
    'Priority support',
    'Unlimited fill history'
  ];
  
  for (const phrase of testPhrases) {
    const locator = page.locator(`text=${phrase}`);
    const count = await locator.count();
    console.log(`"${phrase}": ${count} matches`);
  }
  
  console.log('\n=== Checking for "$12" ===');
  const dollar12 = await page.locator('text="$12"').count();
  console.log(`Found "$12" ${dollar12} times`);
  
  console.log('\n=== Screenshot saved ===');
  await page.screenshot({ path: '/tmp/pricing-debug.png', fullPage: true });
  console.log('Screenshot saved to /tmp/pricing-debug.png');
  
  await browser.close();
})();