"use client";

import Script from "next/script";

/**
 * Google Ads base tag - loads on all pages.
 *
 * Reads conversion ID from NEXT_PUBLIC_GOOGLE_ADS_ID.
 * Returns null if unset so dev/CI builds never fail without the env var.
 *
 * Strategy: "afterInteractive" - loads after page is interactive,
 * same pattern as MetaPixel.
 */
export function GoogleAdsTag() {
  const conversionId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();
  if (!conversionId) return null;

  return (
    <>
      <Script
        id="google-ads-base"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${conversionId}`}
      />
      <Script
        id="google-ads-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = window.gtag || gtag;
            gtag('js', new Date());
            gtag('config', '${conversionId}');
          `,
        }}
      />
    </>
  );
}
