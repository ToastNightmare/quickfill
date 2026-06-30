import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "QuickFill | Upload and Fill Documents Online",
  description:
    "Upload a PDF, JPG, PNG, scan, or screenshot. Fill, mark up, sign, and finish your document online.",
  keywords: [
    "QuickFill",
    "PDF form filler",
    "fill PDF online",
    "online PDF editor",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "QuickFill",
    description:
      "Upload your file, fill it online, and finish your document without printing.",
    url: "/",
  },
};

export default function PricingPage() {
  redirect("/");
}
