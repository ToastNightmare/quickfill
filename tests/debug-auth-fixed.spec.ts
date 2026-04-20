import { test, expect } from '@playwright/test';

test('Check authentication state', async ({ page }) => {
  console.log('Navigating to https://getquickfill.com/editor');
  await page.goto('https://getquickfill.com/editor');
  await page.waitForLoadState('networkidle');
  
  console.log('URL:', page.url());
  
  // Check for Clerk frame
  const clerkFrameCount = await page.locator('iframe[src*="clerk"]').count();
  const hasClerkFrame = clerkFrameCount > 0;
  console.log('Has Clerk iframe:', hasClerkFrame, `(${clerkFrameCount} frames)`);
  
  if (hasClerkFrame) {
    console.log('Clerk authentication detected');
  }
  
  // Check for upload form
  const uploadFormCount = await page.locator('input[type="file"], [data-testid="upload"]').count();
  const hasUpload = uploadFormCount > 0;
  console.log('Has upload form:', hasUpload, `(${uploadFormCount} elements)`);
  
  if (hasUpload) {
    console.log('Upload form present - likely not authenticated or need to upload first');
    
    // Try clicking "Try Free" or "Sign In" links
    const tryFreeLink = page.locator('a[href="/sign-up"], a:has-text("Try Free")');
    const signInLink = page.locator('a[href="/sign-in"], a:has-text("Sign In")');
    
    console.log('Try Free link count:', await tryFreeLink.count());
    console.log('Sign In link count:', await signInLink.count());
    
    // Take current screenshot
    await page.screenshot({ path: '/tmp/editor-before-signin.png' });
    console.log('Screenshot saved to /tmp/editor-before-signin.png');
  }
  
  // Check localStorage for auth tokens
  console.log('\nChecking localStorage for auth clues...');
  const storage = await page.evaluate(() => {
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      items[key] = localStorage.getItem(key);
    }
    return items;
  });
  
  const storageKeys = Object.keys(storage);
  console.log('localStorage keys:', storageKeys);
  console.log('Total localStorage items:', storageKeys.length);
  
  // Look for Clerk or auth related keys
  const authKeys = storageKeys.filter(key => 
    key.toLowerCase().includes('clerk') || 
    key.toLowerCase().includes('auth') || 
    key.toLowerCase().includes('token') || 
    key.toLowerCase().includes('session')
  );
  
  console.log('Auth-related localStorage keys:', authKeys);
  
  if (authKeys.length > 0) {
    console.log('Sample auth values (first 100 chars):');
    authKeys.slice(0, 3).forEach(key => {
      const value = storage[key];
      console.log(`  ${key}: ${value ? value.substring(0, 100) + '...' : 'null'}`);
    });
  }
  
  // Check cookies
  console.log('\nChecking cookies...');
  const cookies = await page.context().cookies();
  console.log('Number of cookies:', cookies.length);
  
  const authCookies = cookies.filter(cookie => 
    cookie.name.toLowerCase().includes('clerk') || 
    cookie.name.toLowerCase().includes('auth') || 
    cookie.name.toLowerCase().includes('session')
  );
  
  console.log('Auth-related cookies:', authCookies.map(c => c.name));
  
  // Check page content for clues
  console.log('\nChecking page content for auth clues...');
  const pageText = await page.textContent('body') || '';
  const authIndicators = [
    { text: 'Sign in', found: pageText.includes('Sign in') },
    { text: 'Sign up', found: pageText.includes('Sign up') },
    { text: 'Welcome', found: pageText.includes('Welcome') },
    { text: 'Upload', found: pageText.includes('Upload') },
    { text: 'Fill a PDF', found: pageText.includes('Fill a PDF') },
    { text: 'account', found: pageText.toLowerCase().includes('account') },
    { text: 'log out', found: pageText.toLowerCase().includes('log out') }
  ];
  
  console.log('Page content indicators:');
  authIndicators.forEach(indicator => {
    console.log(`  "${indicator.text}": ${indicator.found ? 'YES' : 'NO'}`);
  });
  
  // Final assessment
  console.log('\n=== AUTH ASSESSMENT ===');
  
  if (hasClerkFrame) {
    console.log('RESULT: Clerk authentication active - requires sign-in');
    console.log('STATUS: Cannot test grid field without authentication');
  } else if (hasUpload && authKeys.length === 0 && authCookies.length === 0) {
    console.log('RESULT: Not authenticated - shows upload page with sign-in options');
    console.log('STATUS: Cannot test grid field without authentication');
  } else if (authKeys.length > 0 || authCookies.length > 0) {
    console.log('RESULT: Has auth tokens but still shows upload page - may need upload first');
    console.log('STATUS: Might be able to upload and test if authenticated');
  } else {
    console.log('RESULT: Unknown authentication state');
    console.log('STATUS: Unable to determine');
  }
  
  // Write test result
  const result = `AUTH CHECK - ${page.url()}
Clerk iframe: ${hasClerkFrame}
Upload form: ${hasUpload}
Auth localStorage keys: ${authKeys.length}
Auth cookies: ${authCookies.length}
Assessment: ${hasClerkFrame ? 'Requires Clerk sign-in' : 
              hasUpload && authKeys.length === 0 ? 'Not authenticated' : 
              'Possibly authenticated but needs upload'}`;
  
  console.log('\n=== TEST RESULT ===');
  console.log(result);
  
  // Write to file
  const fs = require('fs');
  fs.writeFileSync('/home/kyle/.openclaw/workspace-qa/auth-check-result.txt', result);
});