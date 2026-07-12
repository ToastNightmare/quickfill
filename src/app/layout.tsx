import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { MetaPixel } from "@/components/MetaPixel";
import { GoogleAdsTag } from "@/components/GoogleAdsTag";
import { APP_CONFIG } from "@/lib/config";

const themeInitializerScript = `
(function() {
  try {
    var storageKey = "quickfill-theme";
    var storedTheme = window.localStorage.getItem(storageKey);
    var theme = storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (_) {}
})();
`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111318" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_CONFIG.url),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo-mark.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/logo-mark.png",
  },
  title: "Fill PDF Forms Online | QuickFill",
  description:
    "Upload a PDF or photo, then clean, fill, sign and preview it online. No account needed to start; choose a download option when finished.",
  keywords:
    "fill PDF online, PDF form filler, online PDF editor, fill PDF form, PDF filler no download, fill tax form online, rental application PDF, government form filler, online document filler",
  openGraph: {
    title: "Fill PDF Forms Online | QuickFill",
    description:
      "Upload a PDF or photo, then clean, fill, sign and preview it online. Choose a download option when your document is finished.",
    url: APP_CONFIG.url,
    siteName: "QuickFill",
    type: "website",
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased" suppressHydrationWarning>
        <body className="min-h-full flex flex-col bg-surface text-text">
          <script dangerouslySetInnerHTML={{ __html: themeInitializerScript }} />
          <MetaPixel />
          <GoogleAdsTag />
          <AppShell>{children}</AppShell>
        </body>
      </html>
    </ClerkProvider>
  );
}
