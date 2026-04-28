import { test, expect } from '@playwright/test';

test('Check authentication state', async ({ page }) => {
  console.log('Navigating to https://getquickfill.com/editor');
  await page.goto('https://getquickfill.com/editor');
  await page.waitForLoadState('networkidle');
  
  console.log('URL:', page.url());
  
  // Check for Clerk frame
  const clerkIframe = page.locator('iframe[src*="clerk"]');
  const hasClerkFrame = await clerkIframe.count() > 0;
  const clerkFrame = page.frameLocator('iframe[src*="clerk"]').first();
  console.log('Has Clerk iframe:', hasClerkFrame);
  
  if (hasClerkFrame) {
    console.log('Clerk authentication detected');
    console.log('Checking if user is signed in...');
    
    // Try to get text from Clerk frame
    try {
      const clerkText = await clerkFrame.locator('body').textContent();
      console.log('Clerk frame text preview:', clerkText?.substring(0, 500));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('Cannot access Clerk frame:', message);
    }
  }
  
  // Check for upload form
  const uploadForm = page.locator('input[type="file"], [data-testid="upload"]');
  const hasUpload = await uploadForm.count() > 0;
  console.log('Has upload form:', hasUpload);
  
  if (hasUpload) {
    console.log('Upload form present - likely not authenticated or need to upload first');
    
    // Try clicking "Try Free" or "Sign In" links
    const tryFreeLink = page.locator('a[href="/sign-up"], a:has-text("Try Free")');
    const signInLink = page.locator('a[href="/sign-in"], a:has-text("Sign In")');
    
    console.log('Try Free link count:', await tryFreeLink.count());
    console.log('Sign In link count:', await signInLink.count());
    
    // Click sign-in to see what happens
    if (await signInLink.count() > 0) {
      console.log('Clicking Sign In link...');
      await signInLink.first().click();
      await page.waitForLoadState('networkidle');
      console.log('After click URL:', page.url());
      
      // Wait a bit more for Clerk
      await page.waitForTimeout(2000);
      
      // Check for Clerk again
      const clerkFrame2 = page.locator('iframe[src*="clerk"]');
      console.log('After sign-in click, has Clerk iframe:', await clerkFrame2.count() > 0);
      
      // Take screenshot
      await page.screenshot({ path: '/tmp/sign-in-page.png' });
      console.log('Screenshot saved to /tmp/sign-in-page.png');
    }
  }
  
  // Check localStorage for auth tokens
  console.log('\nChecking localStorage for auth clues...');
  const storage = await page.evaluate((): Record<string, string | null> => {
    const items: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) items[key] = localStorage.getItem(key);
    }
    return items;
  });
  
  console.log('localStorage keys:', Object.keys(storage));
  
  // Look for Clerk or auth related keys
  const authKeys = Object.keys(storage).filter(key => 
    key.includes('clerk') || key.includes('auth') || key.includes('token') || key.includes('session')
  );
  
  console.log('Auth-related localStorage keys:', authKeys);
  
  if (authKeys.length > 0) {
    console.log('Sample auth values (first 100 chars):');
    authKeys.slice(0, 3).forEach(key => {
      console.log(`  ${key}: ${storage[key]?.substring(0, 100)}...`);
    });
  }
  
  // Check cookies
  console.log('\nChecking cookies...');
  const cookies = await page.context().cookies();
  console.log('Number of cookies:', cookies.length);
  
  const authCookies = cookies.filter(cookie => 
    cookie.name.includes('clerk') || cookie.name.includes('auth') || cookie.name.includes('session')
  );
  
  console.log('Auth-related cookies:', authCookies.map(c => c.name));
  
  // Final assessment
  console.log('\n=== AUTH ASSESSMENT ===');
  
  if (hasClerkFrame) {
    console.log('RESULT: Clerk authentication active - requires sign-in');
  } else if (hasUpload && authKeys.length === 0 && authCookies.length === 0) {
    console.log('RESULT: Not authenticated - shows upload page with sign-in options');
  } else if (authKeys.length > 0 || authCookies.length > 0) {
    console.log('RESULT: Has auth tokens but still shows upload page - may need upload first');
  } else {
    console.log('RESULT: Unknown authentication state');
  }
});