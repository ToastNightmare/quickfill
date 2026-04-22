# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: debug-auth.spec.ts >> Check authentication state
- Location: tests/debug-auth.spec.ts:3:5

# Error details

```
Error: page.goto: net::ERR_NETWORK_CHANGED at https://getquickfill.com/editor
Call log:
  - navigating to "https://getquickfill.com/editor", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test('Check authentication state', async ({ page }) => {
  4   |   console.log('Navigating to https://getquickfill.com/editor');
> 5   |   await page.goto('https://getquickfill.com/editor');
      |              ^ Error: page.goto: net::ERR_NETWORK_CHANGED at https://getquickfill.com/editor
  6   |   await page.waitForLoadState('networkidle');
  7   |   
  8   |   console.log('URL:', page.url());
  9   |   
  10  |   // Check for Clerk frame
  11  |   const clerkFrame = page.frameLocator('iframe[src*="clerk"]').first();
  12  |   const hasClerkFrame = await clerkFrame.count() > 0;
  13  |   console.log('Has Clerk iframe:', hasClerkFrame);
  14  |   
  15  |   if (hasClerkFrame) {
  16  |     console.log('Clerk authentication detected');
  17  |     console.log('Checking if user is signed in...');
  18  |     
  19  |     // Try to get text from Clerk frame
  20  |     try {
  21  |       const clerkText = await clerkFrame.locator('body').textContent();
  22  |       console.log('Clerk frame text preview:', clerkText?.substring(0, 500));
  23  |     } catch (e) {
  24  |       console.log('Cannot access Clerk frame:', e.message);
  25  |     }
  26  |   }
  27  |   
  28  |   // Check for upload form
  29  |   const uploadForm = page.locator('input[type="file"], [data-testid="upload"]');
  30  |   const hasUpload = await uploadForm.count() > 0;
  31  |   console.log('Has upload form:', hasUpload);
  32  |   
  33  |   if (hasUpload) {
  34  |     console.log('Upload form present - likely not authenticated or need to upload first');
  35  |     
  36  |     // Try clicking "Try Free" or "Sign In" links
  37  |     const tryFreeLink = page.locator('a[href="/sign-up"], a:has-text("Try Free")');
  38  |     const signInLink = page.locator('a[href="/sign-in"], a:has-text("Sign In")');
  39  |     
  40  |     console.log('Try Free link count:', await tryFreeLink.count());
  41  |     console.log('Sign In link count:', await signInLink.count());
  42  |     
  43  |     // Click sign-in to see what happens
  44  |     if (await signInLink.count() > 0) {
  45  |       console.log('Clicking Sign In link...');
  46  |       await signInLink.first().click();
  47  |       await page.waitForLoadState('networkidle');
  48  |       console.log('After click URL:', page.url());
  49  |       
  50  |       // Wait a bit more for Clerk
  51  |       await page.waitForTimeout(2000);
  52  |       
  53  |       // Check for Clerk again
  54  |       const clerkFrame2 = page.frameLocator('iframe[src*="clerk"]').first();
  55  |       console.log('After sign-in click, has Clerk iframe:', await clerkFrame2.count() > 0);
  56  |       
  57  |       // Take screenshot
  58  |       await page.screenshot({ path: '/tmp/sign-in-page.png' });
  59  |       console.log('Screenshot saved to /tmp/sign-in-page.png');
  60  |     }
  61  |   }
  62  |   
  63  |   // Check localStorage for auth tokens
  64  |   console.log('\nChecking localStorage for auth clues...');
  65  |   const storage = await page.evaluate(() => {
  66  |     const items = {};
  67  |     for (let i = 0; i < localStorage.length; i++) {
  68  |       const key = localStorage.key(i);
  69  |       items[key] = localStorage.getItem(key);
  70  |     }
  71  |     return items;
  72  |   });
  73  |   
  74  |   console.log('localStorage keys:', Object.keys(storage));
  75  |   
  76  |   // Look for Clerk or auth related keys
  77  |   const authKeys = Object.keys(storage).filter(key => 
  78  |     key.includes('clerk') || key.includes('auth') || key.includes('token') || key.includes('session')
  79  |   );
  80  |   
  81  |   console.log('Auth-related localStorage keys:', authKeys);
  82  |   
  83  |   if (authKeys.length > 0) {
  84  |     console.log('Sample auth values (first 100 chars):');
  85  |     authKeys.slice(0, 3).forEach(key => {
  86  |       console.log(`  ${key}: ${storage[key]?.substring(0, 100)}...`);
  87  |     });
  88  |   }
  89  |   
  90  |   // Check cookies
  91  |   console.log('\nChecking cookies...');
  92  |   const cookies = await page.context().cookies();
  93  |   console.log('Number of cookies:', cookies.length);
  94  |   
  95  |   const authCookies = cookies.filter(cookie => 
  96  |     cookie.name.includes('clerk') || cookie.name.includes('auth') || cookie.name.includes('session')
  97  |   );
  98  |   
  99  |   console.log('Auth-related cookies:', authCookies.map(c => c.name));
  100 |   
  101 |   // Final assessment
  102 |   console.log('\n=== AUTH ASSESSMENT ===');
  103 |   
  104 |   if (hasClerkFrame) {
  105 |     console.log('RESULT: Clerk authentication active - requires sign-in');
```