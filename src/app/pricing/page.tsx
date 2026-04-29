import type { Metadata } from "next";
import PricingClient from "./PricingClient";

export const metadata: Metadata = {
  title: "QuickFill Pricing | PDF Form Filler Plans",
  description:
    "Start filling PDF forms for free. Upgrade to QuickFill Pro for unlimited Australian PDF form filling, no watermark, fill history, and priority support.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "QuickFill Pricing",
    description:
      "Simple pricing for filling Australian PDF forms online. Start free, upgrade when you need unlimited fills.",
    url: "/pricing",
  },
};

export default function PricingPage() {
  return <PricingClient />;
}
