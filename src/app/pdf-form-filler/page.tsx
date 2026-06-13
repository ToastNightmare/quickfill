import type { Metadata } from "next";
import PdfFormFillerClient from "./PdfFormFillerClient";

export const metadata: Metadata = {
  title: "Fill PDF Forms Online | PDF Form Filler | QuickFill",
  description:
    "Fill PDF forms online for free. Upload your PDF, type on it, and download the completed file. No printing, no scanning, no software to install.",
  alternates: { canonical: "/pdf-form-filler" },
};

export default function PdfFormFillerPage() {
  return <PdfFormFillerClient />;
}
