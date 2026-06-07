"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq: ((...args: any[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue: unknown[][];
      loaded: boolean;
      version: string;
      push: (...args: unknown[]) => void;
    };
    _fbq: unknown;
  }
}

/**
 * Meta Pixel — base PageView tracking only.
 *
 * Split strategy to avoid duplicate PageView on initial load:
 * - Inline <script>: synchronous stub + fbq('init'). Runs before React
 *   hydration so window.fbq is always defined before any useEffect fires.
 * - <Script strategy="afterInteractive">: loads fbevents.js async, processes
 *   the queued init call.
 * - useEffect: fires fbq('track', 'PageView') on mount and every pathname
 *   change. Handles both initial load and SPA navigation.
 *
 * Pixel ID is read from NEXT_PUBLIC_META_PIXEL_ID. Returns null if unset
 * so dev/CI builds never fail without the env var.
 */
export function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const pathname = usePathname();

  // Fire PageView on initial mount and every client-side navigation.
  // Guard keeps this safe if fbq is somehow unavailable.
  useEffect(() => {
    if (!pixelId || typeof window.fbq !== "function") return;
    window.fbq("track", "PageView");
  }, [pathname, pixelId]);

  if (!pixelId) return null;

  return (
    <>
      {/*
       * Synchronous fbq stub — defines window.fbq and queues fbq('init').
       * No PageView here; useEffect owns all PageView calls.
       */}
      <script
        dangerouslySetInnerHTML={{
          __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[]}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');`,
        }}
      />

      {/* Async load of fbevents.js — processes queued init, no PageView */}
      <Script
        id="meta-pixel-sdk"
        strategy="afterInteractive"
        src="https://connect.facebook.net/en_US/fbevents.js"
      />

      {/* Noscript fallback */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
