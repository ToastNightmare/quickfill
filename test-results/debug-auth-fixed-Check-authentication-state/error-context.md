# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: debug-auth-fixed.spec.ts >> Check authentication state
- Location: tests/debug-auth-fixed.spec.ts:3:5

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
  11  |   const clerkFrameCount = await page.locator('iframe[src*="clerk"]').count();
  12  |   const hasClerkFrame = clerkFrameCount > 0;
  13  |   console.log('Has Clerk iframe:', hasClerkFrame, `(${clerkFrameCount} frames)`);
  14  |   
  15  |   if (hasClerkFrame) {
  16  |     console.log('Clerk authentication detected');
  17  |   }
  18  |   
  19  |   // Check for upload form
  20  |   const uploadFormCount = await page.locator('input[type="file"], [data-testid="upload"]').count();
  21  |   const hasUpload = uploadFormCount > 0;
  22  |   console.log('Has upload form:', hasUpload, `(${uploadFormCount} elements)`);
  23  |   
  24  |   if (hasUpload) {
  25  |     console.log('Upload form present - likely not authenticated or need to upload first');
  26  |     
  27  |     // Try clicking "Try Free" or "Sign In" links
  28  |     const tryFreeLink = page.locator('a[href="/sign-up"], a:has-text("Try Free")');
  29  |     const signInLink = page.locator('a[href="/sign-in"], a:has-text("Sign In")');
  30  |     
  31  |     console.log('Try Free link count:', await tryFreeLink.count());
  32  |     console.log('Sign In link count:', await signInLink.count());
  33  |     
  34  |     // Take current screenshot
  35  |     await page.screenshot({ path: '/tmp/editor-before-signin.png' });
  36  |     console.log('Screenshot saved to /tmp/editor-before-signin.png');
  37  |   }
  38  |   
  39  |   // Check localStorage for auth tokens
  40  |   console.log('\nChecking localStorage for auth clues...');
  41  |   const storage = await page.evaluate(() => {
  42  |     const items = {};
  43  |     for (let i = 0; i < localStorage.length; i++) {
  44  |       const key = localStorage.key(i);
  45  |       items[key] = localStorage.getItem(key);
  46  |     }
  47  |     return items;
  48  |   });
  49  |   
  50  |   const storageKeys = Object.keys(storage);
  51  |   console.log('localStorage keys:', storageKeys);
  52  |   console.log('Total localStorage items:', storageKeys.length);
  53  |   
  54  |   // Look for Clerk or auth related keys
  55  |   const authKeys = storageKeys.filter(key => 
  56  |     key.toLowerCase().includes('clerk') || 
  57  |     key.toLowerCase().includes('auth') || 
  58  |     key.toLowerCase().includes('token') || 
  59  |     key.toLowerCase().includes('session')
  60  |   );
  61  |   
  62  |   console.log('Auth-related localStorage keys:', authKeys);
  63  |   
  64  |   if (authKeys.length > 0) {
  65  |     console.log('Sample auth values (first 100 chars):');
  66  |     authKeys.slice(0, 3).forEach(key => {
  67  |       const value = storage[key];
  68  |       console.log(`  ${key}: ${value ? value.substring(0, 100) + '...' : 'null'}`);
  69  |     });
  70  |   }
  71  |   
  72  |   // Check cookies
  73  |   console.log('\nChecking cookies...');
  74  |   const cookies = await page.context().cookies();
  75  |   console.log('Number of cookies:', cookies.length);
  76  |   
  77  |   const authCookies = cookies.filter(cookie => 
  78  |     cookie.name.toLowerCase().includes('clerk') || 
  79  |     cookie.name.toLowerCase().includes('auth') || 
  80  |     cookie.name.toLowerCase().includes('session')
  81  |   );
  82  |   
  83  |   console.log('Auth-related cookies:', authCookies.map(c => c.name));
  84  |   
  85  |   // Check page content for clues
  86  |   console.log('\nChecking page content for auth clues...');
  87  |   const pageText = await page.textContent('body') || '';
  88  |   const authIndicators = [
  89  |     { text: 'Sign in', found: pageText.includes('Sign in') },
  90  |     { text: 'Sign up', found: pageText.includes('Sign up') },
  91  |     { text: 'Welcome', found: pageText.includes('Welcome') },
  92  |     { text: 'Upload', found: pageText.includes('Upload') },
  93  |     { text: 'Fill a PDF', found: pageText.includes('Fill a PDF') },
  94  |     { text: 'account', found: pageText.toLowerCase().includes('account') },
  95  |     { text: 'log out', found: pageText.toLowerCase().includes('log out') }
  96  |   ];
  97  |   
  98  |   console.log('Page content indicators:');
  99  |   authIndicators.forEach(indicator => {
  100 |     console.log(`  "${indicator.text}": ${indicator.found ? 'YES' : 'NO'}`);
  101 |   });
  102 |   
  103 |   // Final assessment
  104 |   console.log('\n=== AUTH ASSESSMENT ===');
  105 |   
```