import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "QuickFill — Fill PDF Forms Online Free",
  description:
    "Upload any PDF form and fill it online in seconds. Smart field detection, drag-and-drop fields, instant download. Free to try — no software required.",
  keywords:
    "fill PDF online, PDF form filler, fill PDF free, online PDF editor, ATO form filler, fill form online Australia",
  openGraph: {
    title: "QuickFill — Fill PDF Forms Online Free",
    description:
      "Upload any PDF form and fill it online in seconds. Smart field detection, drag-and-drop fields, instant download.",
    url: "https://quickfill.app",
    siteName: "QuickFill",
    type: "website",
    locale: "en_AU",
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
          <Navbar />
          <main className="flex-1">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
