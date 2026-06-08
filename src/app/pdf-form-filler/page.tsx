import type { Metadata } from "next";
import PdfFormFillerClient from "./PdfFormFillerClient";

export const metadata: Metadata = {
  title: "Fill PDF Forms Online | QuickFill",
  description: "Stop printing PDF forms. Fill any PDF online in your browser and download it instantly. Free to start.",
};

export default function PdfFormFillerPage() {
  return <PdfFormFillerClient />;
}
