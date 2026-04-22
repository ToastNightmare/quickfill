# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: quickfill-qa.spec.ts >> Homepage loads
- Location: tests/quickfill-qa.spec.ts:3:5

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 0
Received length: 10
Received array:  ["Failed to load resource: net::ERR_NETWORK_CHANGED", "Failed to load resource: net::ERR_NETWORK_CHANGED", "Failed to load resource: net::ERR_NETWORK_CHANGED", "Failed to load resource: net::ERR_NETWORK_CHANGED", "Failed to load resource: net::ERR_NAME_NOT_RESOLVED", "Failed to load resource: net::ERR_NAME_NOT_RESOLVED", "Failed to load resource: net::ERR_NAME_NOT_RESOLVED", "Failed to load resource: net::ERR_NAME_NOT_RESOLVED", "Failed to load resource: net::ERR_NAME_NOT_RESOLVED", "Failed to load resource: net::ERR_NAME_NOT_RESOLVED"]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - navigation [ref=e2]:
    - generic [ref=e3]:
      - link "QuickFill" [ref=e4] [cursor=pointer]:
        - /url: /
        - img "QuickFill" [ref=e5]
      - generic [ref=e6]:
        - link "How It Works" [ref=e7] [cursor=pointer]:
          - /url: /how-it-works
        - link "Templates" [ref=e8] [cursor=pointer]:
          - /url: /templates
        - link "Fill a PDF" [ref=e9] [cursor=pointer]:
          - /url: /editor
        - link "Pricing" [ref=e10] [cursor=pointer]:
          - /url: /pricing
        - link "Sign In" [ref=e11] [cursor=pointer]:
          - /url: /sign-in
        - link "Try Free" [ref=e12] [cursor=pointer]:
          - /url: /sign-up
  - main [ref=e13]:
    - generic [ref=e14]:
      - generic [ref=e17]:
        - heading "Stop printing locked PDFs forever" [level=1] [ref=e18]
        - paragraph [ref=e19]: "Fill Australian government and business forms online: no Adobe, no printing, no scanning. Works on any device."
        - generic [ref=e20]:
          - generic [ref=e21]: "✏️ Fill any PDF: no locked fields stopping you"
          - generic [ref=e22]: 💰 Half the price of Adobe Acrobat
          - generic [ref=e23]: "🇦🇺 Built for Australian forms: TFN, Centrelink, rental apps, NDIS"
        - generic [ref=e24]:
          - link "Start filling forms free" [ref=e25] [cursor=pointer]:
            - /url: /sign-up
            - text: Start filling forms free
            - img [ref=e26]
          - link "See How It Works" [ref=e28] [cursor=pointer]:
            - /url: "#how-it-works"
        - paragraph [ref=e29]: Trusted by Australians filling TFN declarations, rental applications, Centrelink forms and NDIS paperwork
      - generic [ref=e31]:
        - heading "Everything you need to fill PDFs" [level=2] [ref=e32]
        - paragraph [ref=e33]: No more printing, hand-writing, and scanning. Fill any PDF form directly in your browser, Australian government forms, tax documents, and more.
        - generic [ref=e34]:
          - generic [ref=e35]:
            - img [ref=e37]
            - heading "Upload Any Australian Form" [level=3] [ref=e40]
            - paragraph [ref=e41]: "ATO tax returns, Medicare claims, Centrelink forms, rental applications, council permits: QuickFill handles them all."
          - generic [ref=e42]:
            - img [ref=e44]
            - heading "Auto-fill from Your Profile" [level=3] [ref=e47]
            - paragraph [ref=e48]: Save your name, address, TFN, Medicare number, ABN and more. QuickFill fills matching fields instantly across any form.
          - generic [ref=e49]:
            - img [ref=e51]
            - heading "Download in Seconds" [level=3] [ref=e54]
            - paragraph [ref=e55]: "Your completed PDF is ready instantly. Print it, email it, or submit it: no software required."
      - generic [ref=e57]:
        - generic [ref=e58]:
          - heading "Why switch to QuickFill?" [level=2] [ref=e59]
          - paragraph [ref=e60]: No more wrestling with broken PDF software.
        - table [ref=e63]:
          - rowgroup [ref=e64]:
            - row "Feature Adobe Acrobat ($24/mo) DocuSign ($25/mo) QuickFill ($12/mo)" [ref=e65]:
              - columnheader "Feature" [ref=e66]
              - columnheader "Adobe Acrobat ($24/mo)" [ref=e67]
              - columnheader "DocuSign ($25/mo)" [ref=e68]
              - columnheader "QuickFill ($12/mo)" [ref=e69]
          - rowgroup [ref=e70]:
            - row "Fill PDFs online ❌ Desktop only ❌ Envelopes only ✅ Yes" [ref=e71]:
              - cell "Fill PDFs online" [ref=e72]
              - cell "❌ Desktop only" [ref=e73]
              - cell "❌ Envelopes only" [ref=e74]
              - cell "✅ Yes" [ref=e75]
            - row "Australian templates ❌ None ❌ None ✅ 15+ built-in" [ref=e76]:
              - cell "Australian templates" [ref=e77]
              - cell "❌ None" [ref=e78]
              - cell "❌ None" [ref=e79]
              - cell "✅ 15+ built-in" [ref=e80]
            - row "Works on locked fields ❌ No ❌ No ✅ Yes" [ref=e81]:
              - cell "Works on locked fields" [ref=e82]
              - cell "❌ No" [ref=e83]
              - cell "❌ No" [ref=e84]
              - cell "✅ Yes" [ref=e85]
            - row "No printing needed ❌ Exports only ➖ N/A ✅ Download instantly" [ref=e86]:
              - cell "No printing needed" [ref=e87]
              - cell "❌ Exports only" [ref=e88]
              - cell "➖ N/A" [ref=e89]
              - cell "✅ Download instantly" [ref=e90]
            - row "Price $24/mo $25/mo $12/mo" [ref=e91]:
              - cell "Price" [ref=e92]
              - cell "$24/mo" [ref=e93]
              - cell "$25/mo" [ref=e94]
              - cell "$12/mo" [ref=e95]
      - generic [ref=e97]:
        - generic [ref=e98]:
          - generic [ref=e99]: 🇦🇺 Built for Australian forms
          - heading "Features made for Australia" [level=2] [ref=e100]
          - paragraph [ref=e101]: No other PDF filler understands Australian forms like QuickFill. From TFN validation to ABN lookup, we handle the details that matter.
        - generic [ref=e102]:
          - generic [ref=e103]:
            - generic [ref=e104]: 🔍
            - heading "ABN Lookup" [level=3] [ref=e105]
            - paragraph [ref=e106]: Type your ABN and we instantly verify it against the Australian Business Register and auto-fill your business name.
          - generic [ref=e107]:
            - generic [ref=e108]: 🪪
            - heading "TFN & Medicare Validation" [level=3] [ref=e109]
            - paragraph [ref=e110]: Real-time format validation for Tax File Numbers and Medicare cards so you never submit an error again.
          - generic [ref=e111]:
            - generic [ref=e112]: 📋
            - heading "Australian Profile Auto-fill" [level=3] [ref=e113]
            - paragraph [ref=e114]: Save your TFN, Medicare number, ABN, address, and driver licence once. QuickFill fills matching fields across any form.
          - generic [ref=e115]:
            - generic [ref=e116]: 💾
            - heading "Save & Resume" [level=3] [ref=e117]
            - paragraph [ref=e118]: Start filling a form, close the tab, come back later. Your progress is automatically saved for 30 days.
          - generic [ref=e119]:
            - generic [ref=e120]: 🔄
            - heading "Re-fill Previous Forms" [level=3] [ref=e121]
            - paragraph [ref=e122]: "Filled this form before? One click to re-fill it with the same details: great for monthly BAS and invoices."
          - generic [ref=e123]:
            - generic [ref=e124]: 🔒
            - heading "Private by Design" [level=3] [ref=e125]
            - paragraph [ref=e126]: Your PDFs are processed in your browser. We never upload or store your documents on our servers.
      - generic [ref=e128]:
        - heading "Who uses QuickFill?" [level=2] [ref=e129]
        - paragraph [ref=e130]: Professionals across Australia rely on QuickFill to save hours on paperwork.
        - generic [ref=e131]:
          - generic [ref=e132]:
            - generic [ref=e133]: 🏠
            - heading "Real Estate Agents" [level=3] [ref=e134]
            - paragraph [ref=e135]: Fill tenancy applications, lease agreements, and property documents in seconds.
          - generic [ref=e136]:
            - generic [ref=e137]: 📋
            - heading "Bookkeepers & Sole Traders" [level=3] [ref=e138]
            - paragraph [ref=e139]: ATO BAS forms, tax declarations, and business registrations , done fast.
          - generic [ref=e140]:
            - generic [ref=e141]: ⛪
            - heading "Churches & Community Orgs" [level=3] [ref=e142]
            - paragraph [ref=e143]: Membership forms, event registrations, and grant applications sorted easily.
          - generic [ref=e144]:
            - generic [ref=e145]: 🏥
            - heading "Healthcare & Community Services" [level=3] [ref=e146]
            - paragraph [ref=e147]: Medicare, Centrelink, and client intake forms filled accurately every time.
      - generic [ref=e150]:
        - generic [ref=e151]:
          - generic [ref=e152]: 🔒
          - heading "Your files stay private" [level=3] [ref=e153]
          - paragraph [ref=e154]: PDFs are processed entirely in your browser. We never upload or store your documents on our servers.
        - generic [ref=e155]:
          - generic [ref=e156]: ⚡
          - heading "Ready in under 60 seconds" [level=3] [ref=e157]
          - paragraph [ref=e158]: Upload, fill, and download. No software to install. Sign up free and get started in under 60 seconds.
        - generic [ref=e159]:
          - generic [ref=e160]: 🇦🇺
          - heading "Built for Australia" [level=3] [ref=e161]
          - paragraph [ref=e162]: ATO, Medicare, Centrelink, council forms, QuickFill works with the forms Australians fill every day.
      - generic [ref=e164]:
        - heading "How it works" [level=2] [ref=e165]
        - generic [ref=e166]:
          - generic [ref=e167]:
            - generic [ref=e168]: "1"
            - heading "Upload" [level=3] [ref=e170]
            - paragraph [ref=e171]: Drop your PDF into the editor
          - generic [ref=e172]:
            - generic [ref=e173]: "2"
            - heading "Fill" [level=3] [ref=e175]
            - paragraph [ref=e176]: Type, check, sign , right on the form
          - generic [ref=e177]:
            - generic [ref=e178]: "3"
            - heading "Download" [level=3] [ref=e179]
            - paragraph [ref=e180]: Get your completed PDF instantly
      - generic [ref=e182]:
        - heading "Works with any Australian PDF form" [level=2] [ref=e183]
        - paragraph [ref=e184]: Fill and submit forms for the ATO, Medicare, Centrelink, state government agencies, councils, real estate agents, and more.
        - generic [ref=e185]:
          - generic [ref=e186]: ATO Tax Returns
          - generic [ref=e187]: Medicare Claims
          - generic [ref=e188]: Centrelink Forms
          - generic [ref=e189]: Rental Applications
          - generic [ref=e190]: Council Permits
          - generic [ref=e191]: Tenancy Agreements
          - generic [ref=e192]: ABN Registration
          - generic [ref=e193]: Business Forms
      - generic [ref=e195]:
        - heading "Frequently asked questions" [level=2] [ref=e196]
        - generic [ref=e197]:
          - generic [ref=e198]:
            - heading "Is it really free?" [level=3] [ref=e199]
            - paragraph [ref=e200]: Yes! Get 3 free fills per month with no credit card required. Pro gives unlimited fills for $12/month.
          - generic [ref=e201]:
            - heading "Is it secure?" [level=3] [ref=e202]
            - paragraph [ref=e203]: Your data never leaves your browser. Forms are filled locally and downloaded directly to you. We never upload or store your documents.
          - generic [ref=e204]:
            - heading "Does it work on my phone?" [level=3] [ref=e205]
            - paragraph [ref=e206]: Yes. QuickFill works on iPhone, Android, iPad, or any device with a web browser.
          - generic [ref=e207]:
            - heading "Can I use it for government forms?" [level=3] [ref=e208]
            - paragraph [ref=e209]: "Yes. QuickFill includes real Australian government forms: TFN declarations, Centrelink income forms, Medicare enrolment, NDIS service agreements, and more."
          - generic [ref=e210]:
            - heading "What's the difference between free and Pro?" [level=3] [ref=e211]
            - paragraph [ref=e212]: Free gives 3 fills per month. Pro ($12/month) gives unlimited fills and access to all Australian templates.
      - generic [ref=e214]:
        - heading "Simple, transparent pricing" [level=2] [ref=e215]
        - paragraph [ref=e216]: Start free. Upgrade when you need more.
        - generic [ref=e217]:
          - generic [ref=e218]:
            - heading "Free" [level=3] [ref=e219]
            - generic [ref=e221]:
              - generic [ref=e222]: $0
              - generic [ref=e223]: /month
            - paragraph [ref=e225]: Perfect for occasional use.
            - list [ref=e226]:
              - listitem [ref=e227]:
                - img [ref=e228]
                - generic [ref=e230]: 3 documents per month
              - listitem [ref=e231]:
                - img [ref=e232]
                - generic [ref=e234]: All field types
              - listitem [ref=e235]:
                - img [ref=e236]
                - generic [ref=e238]: AcroForm detection
              - listitem [ref=e239]:
                - img [ref=e240]
                - generic [ref=e242]: Instant PDF download
              - listitem [ref=e243]:
                - img [ref=e244]
                - generic [ref=e247]: Unlimited documents
              - listitem [ref=e248]:
                - img [ref=e249]
                - generic [ref=e252]: No watermarks
              - listitem [ref=e253]:
                - img [ref=e254]
                - generic [ref=e257]: Auto-fill from profile
            - link "Get Started Free" [ref=e259] [cursor=pointer]:
              - /url: /sign-up
          - generic [ref=e260]:
            - generic [ref=e261]: Most Popular
            - heading "Pro" [level=3] [ref=e262]
            - generic [ref=e263]:
              - generic [ref=e264]:
                - generic [ref=e265]: $8.33
                - generic [ref=e266]: /month
              - generic [ref=e269]: 🎉 Billed $100/year, save $44
            - paragraph [ref=e270]: Unlimited fills, no watermark, priority support.
            - list [ref=e271]:
              - listitem [ref=e272]:
                - img [ref=e273]
                - text: Unlimited documents
              - listitem [ref=e275]:
                - img [ref=e276]
                - text: All field types
              - listitem [ref=e278]:
                - img [ref=e279]
                - text: AcroForm detection
              - listitem [ref=e281]:
                - img [ref=e282]
                - text: No watermarks
              - listitem [ref=e284]:
                - img [ref=e285]
                - text: Auto-fill from profile
              - listitem [ref=e287]:
                - img [ref=e288]
                - text: Save & resume progress
              - listitem [ref=e290]:
                - img [ref=e291]
                - text: Re-fill from history
              - listitem [ref=e293]:
                - img [ref=e294]
                - text: Unlimited fill history
              - listitem [ref=e296]:
                - img [ref=e297]
                - text: Priority support
            - generic [ref=e299]:
              - button "Get Pro, $100/year" [ref=e300]:
                - img [ref=e301]
                - text: Get Pro, $100/year
              - paragraph [ref=e304]:
                - text: Or
                - link "pay $12/month" [ref=e305] [cursor=pointer]:
                  - /url: /pricing
                - text: ·
                - link "See full pricing" [ref=e306] [cursor=pointer]:
                  - /url: /pricing
      - generic [ref=e308]:
        - img "QuickFill" [ref=e309]
        - generic [ref=e310]:
          - link "Fill a PDF" [ref=e311] [cursor=pointer]:
            - /url: /editor
          - link "Templates" [ref=e312] [cursor=pointer]:
            - /url: /templates
          - link "Pricing" [ref=e313] [cursor=pointer]:
            - /url: /pricing
          - link "How It Works" [ref=e314] [cursor=pointer]:
            - /url: /how-it-works
          - link "Sign In" [ref=e315] [cursor=pointer]:
            - /url: /sign-in
          - link "Privacy" [ref=e316] [cursor=pointer]:
            - /url: /privacy
          - link "Terms" [ref=e317] [cursor=pointer]:
            - /url: /terms
        - paragraph [ref=e318]: © 2026 QuickFill. All rights reserved.
  - contentinfo [ref=e319]:
    - generic [ref=e321]:
      - link "Privacy Policy" [ref=e322] [cursor=pointer]:
        - /url: /privacy
      - link "Terms of Service" [ref=e323] [cursor=pointer]:
        - /url: /terms
      - link "Contact" [ref=e324] [cursor=pointer]:
        - /url: mailto:support@getquickfill.com
      - paragraph [ref=e325]: (c) 2026 QuickFill. All rights reserved.
  - alert [ref=e326]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test('Homepage loads', async ({ page }) => {
  4   |   const errors: string[] = [];
  5   |   page.on('console', (msg) => {
  6   |     if (msg.type() === 'error') {
  7   |       errors.push(msg.text());
  8   |     }
  9   |   });
  10  | 
  11  |   await page.goto('/');
  12  |   await page.waitForLoadState('networkidle');
  13  | 
  14  |   // Check title contains "QuickFill"
  15  |   await expect(page).toHaveTitle(/QuickFill/);
  16  |   
  17  |   // Check hero headline exists
  18  |   const heroHeadline = page.locator('h1').first();
  19  |   await expect(heroHeadline).toBeVisible();
  20  |   
  21  |   // Check CTA button visible (Start filling forms free or Fill a PDF)
  22  |   const ctaButton = page.locator('a[href="/sign-up"], a[href="/editor"]').first();
  23  |   await expect(ctaButton).toBeVisible();
  24  |   
  25  |   // Check no console errors
> 26  |   expect(errors).toHaveLength(0);
      |                  ^ Error: expect(received).toHaveLength(expected)
  27  | });
  28  | 
  29  | test('Templates page loads', async ({ page }) => {
  30  |   await page.goto('/templates');
  31  |   await page.waitForLoadState('networkidle');
  32  | 
  33  |   // Check 5+ "Fill This Form" buttons exist (reliable count without toHaveCount min syntax)
  34  |   const count = await page.locator('a:has-text("Fill This Form")').count();
  35  |   expect(count).toBeGreaterThanOrEqual(5);
  36  |   
  37  |   // Check "Tax File Number Declaration" template exists with more reliable selector
  38  |   await expect(page.locator('text=Tax File Number').first()).toBeVisible();
  39  | });
  40  | 
  41  | test('Editor loads', async ({ page }) => {
  42  |   await page.goto('/editor');
  43  |   await page.waitForLoadState('networkidle');
  44  | 
  45  |   // Editor requires auth - either we see the editor or we're redirected to sign-in
  46  |   const url = page.url();
  47  |   const isEditor = url.includes('/editor');
  48  |   const isSignIn = url.includes('/sign-in');
  49  |   expect(isEditor || isSignIn).toBe(true);
  50  | });
  51  | 
  52  | test('Pricing page loads', async ({ page }) => {
  53  |   await page.goto('/pricing');
  54  |   await page.waitForLoadState('networkidle');
  55  | 
  56  |   // Check "$12" is visible (Pro monthly price)
  57  |   const priceElement = page.locator('text="$12"').first();
  58  |   await expect(priceElement).toBeVisible();
  59  |   
  60  |   // Check Pro upgrade button exists
  61  |   const proButton = page.locator('button:has-text("Upgrade to Pro"), a:has-text("Upgrade to Pro")').first();
  62  |   await expect(proButton).toBeVisible();
  63  | });
  64  | 
  65  | test('Template opens in editor', async ({ page }) => {
  66  |   // Navigate to templates listing
  67  |   await page.goto('/templates');
  68  |   await page.waitForLoadState('networkidle');
  69  | 
  70  |   // Click first Fill This Form button
  71  |   const fillBtn = page.locator('a:has-text("Fill This Form")').first();
  72  |   await fillBtn.click();
  73  | 
  74  |   // Either editor or sign-in is acceptable (sign-in required for auth)
  75  |   await page.waitForLoadState('networkidle');
  76  |   const url = page.url();
  77  |   expect(url.includes('/editor') || url.includes('/sign-in') || url.includes('/templates')).toBe(true);
  78  | });
  79  | 
  80  | test('Navigation links work', async ({ page }) => {
  81  |   await page.goto('/');
  82  |   await page.waitForLoadState('networkidle');
  83  | 
  84  |   // Check Templates link works
  85  |   const templatesLink = page.locator('a[href="/templates"]').first();
  86  |   await expect(templatesLink).toBeVisible();
  87  |   await templatesLink.click();
  88  |   await page.waitForURL('/templates');
  89  |   await expect(page).toHaveURL('/templates');
  90  |   
  91  |   // Go back to homepage
  92  |   await page.goto('/');
  93  |   await page.waitForLoadState('networkidle');
  94  |   
  95  |   // Check Pricing link works
  96  |   const pricingLink = page.locator('a[href="/pricing"]').first();
  97  |   await expect(pricingLink).toBeVisible();
  98  |   await pricingLink.click();
  99  |   await page.waitForURL('/pricing');
  100 |   await expect(page).toHaveURL('/pricing');
  101 | });
  102 | 
  103 | test('Templates page — official badge exists', async ({ page }) => {
  104 |   await page.goto('/templates');
  105 |   await page.waitForLoadState('networkidle');
  106 | 
  107 |   // Check at least one element with text "Official" is visible
  108 |   const officialBadge = page.locator('text=Official').first();
  109 |   await expect(officialBadge).toBeVisible();
  110 | });
  111 | 
  112 | test('Homepage — comparison table exists', async ({ page }) => {
  113 |   await page.goto('/');
  114 |   await page.waitForLoadState('networkidle');
  115 | 
  116 |   // Check element containing "Adobe" or "DocuSign" is visible
  117 |   const adoeElement = page.locator('text=Adobe').first();
  118 |   const docuSignElement = page.locator('text=DocuSign').first();
  119 |   
  120 |   // At least one should be visible
  121 |   const adobeVisible = await adoeElement.count() > 0;
  122 |   const docuSignVisible = await docuSignElement.count() > 0;
  123 |   
  124 |   expect(adobeVisible || docuSignVisible).toBe(true);
  125 |   
  126 |   if (adobeVisible) {
```