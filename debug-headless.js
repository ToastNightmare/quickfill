import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://getquickfill.com/pricing');
  await page.waitForLoadState('networkidle');
  
  console.log('Testing individual locators...');
  
  const tests = [
    'Unlimited documents',
    'Unlimited fill history',
    'Priority support',
    'No watermarks',
    'All field types',  // Might be on pricing page
    'Auto-fill from profile'  // Might be on pricing page
  ];
  
  for (const text of tests) {
    const loc = page.locator(`text=${text}`);
    const count = await loc.count();
    console.log(`"${text}": ${count} matches`);
    
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 2); i++) {
        const el = loc.nth(i);
        const elText = await el.textContent();
        console.log(`  Match ${i}: "${elText?.substring(0, 80).replace(/\n/g, ' ')}..."`);
      }
    }
  }
  
  console.log('\n=== Testing OR locator ===');
  const orLocator = page.locator('text=Unlimited documents').or(page.locator('text=No watermarks')).or(page.locator('text=Priority support'));
  const orCount = await orLocator.count();
  console.log(`OR locator count: ${orCount}`);
  
  console.log('\n=== Testing CSS selector for Pro cards ===');
  // Try to find Pro card by looking for $12
  const proCard = page.locator(':has-text("$12")');
  const proCardCount = await proCard.count();
  console.log(`Elements with "$12": ${proCardCount}`);
  
  if (proCardCount > 0) {
    const cardText = await proCard.first().textContent();
    console.log(`First card text preview (200 chars):\n${cardText?.substring(0, 200)}...`);
  }
  
  console.log('\n=== Full page text analysis (searching for "Pro") ===');
  const pageText = await page.textContent('body');
  const proLines = pageText?.split('\n')
    .map(l => l.trim())
    .filter(l => l.toLowerCase().includes('pro') || l.toLowerCase().includes('unlimited'))
    .filter(l => l.length > 0)
    .slice(0, 10) || [];
  
  console.log(`Found ${proLines.length} lines with "pro" or "unlimited"`);
  proLines.forEach((line, i) => {
    console.log(`${i+1}. ${line.substring(0, 120)}${line.length > 120 ? '...' : ''}`);
  });
  
  await browser.close();
})();