import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { APP_CONFIG } from "@/lib/config";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
  title: "Fill PDF Forms Online Free | QuickFill",
  description:
    "Fill PDF forms online free. Upload ATO tax forms, Medicare claims, Centrelink forms, rental applications, council permits and Australian documents. Smart field detection, instant download. No software required.",
  keywords:
    "fill PDF online, PDF form filler, fill PDF free, online PDF editor, ATO form filler, fill form online Australia, Medicare form filler, Centrelink form, rental application PDF, council form filler, Australian PDF forms",
  openGraph: {
    title: "Fill PDF Forms Online Free | QuickFill",
    description:
      "Upload any PDF form and fill it online in seconds. ATO, Medicare, Centrelink, rental apps, council forms. Smart field detection, instant download.",
    url: APP_CONFIG.url,
    siteName: "QuickFill",
    type: "website",
    locale: "en_AU",
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
      <html lang="en" className={`${inter.className} h-full antialiased`}>
        <body className="min-h-full flex flex-col bg-surface text-text">
          <AppShell>{children}</AppShell>
        </body>
      </html>
    </ClerkProvider>
  );
}
