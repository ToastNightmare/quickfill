import type { Metadata } from "next";
import PdfFormFillerClient from "./PdfFormFillerClient";

// This route is a paid-traffic (Google Ads) landing page. We explicitly override
// ALL inherited metadata from the root layout so no ad-facing tax/government/"free"
// overclaiming terms leak into the rendered head for this URL.
const OG_DESCRIPTION =
  "Upload your PDF, type on it, and download the completed file. No printing, scanning, or software install.";

export const metadata: Metadata = {
  title: "Fill PDF Forms Online | PDF Form Filler | QuickFill",
  description:
    "Fill PDF forms online. Upload your PDF, type on it, and download the completed file. Free to start with no printing, scanning, or software install.",
  keywords: [
    "fill PDF online",
    "PDF form filler",
    "type on PDF",
    "write on PDF",
    "fill out PDF form online",
    "online PDF filler",
    "download completed PDF",
    "no printer needed",
  ],
  alternates: { canonical: "/pdf-form-filler" },
  openGraph: {
    title: "Fill PDF Forms Online | QuickFill",
    description: OG_DESCRIPTION,
    url: "https://getquickfill.com/pdf-form-filler",
    siteName: "QuickFill",
    type: "website",
    locale: "en_AU",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "QuickFill PDF form filler",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fill PDF Forms Online | QuickFill",
    description: OG_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
};

export default function PdfFormFillerPage() {
  return <PdfFormFillerClient />;
}
