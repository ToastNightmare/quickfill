import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "QuickFill — Upload any form. Fill it in seconds.",
  description:
    "QuickFill is a web-based PDF form filler. Upload any PDF, fill it out with smart tools, and download the completed copy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-surface text-text">
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
