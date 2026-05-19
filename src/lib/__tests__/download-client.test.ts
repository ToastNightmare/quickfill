import { assertPdfDownload, shouldTryBillingSync } from "@/lib/download-client";
import {
  buildPdfDownloadHeaders,
  filledPdfFilename,
  isLikelyCompletePdf,
  sanitizePdfFilename,
} from "@/lib/pdf-download-response";
import { TextDecoder, TextEncoder } from "util";

global.TextDecoder = TextDecoder as typeof global.TextDecoder;
global.TextEncoder = TextEncoder as typeof global.TextEncoder;

function encode(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

function responseWithContentType(contentType: string) {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null),
    },
  } as Response;
}

describe("download-client", () => {
  describe("assertPdfDownload", () => {
    it("accepts real PDF responses", () => {
      const response = responseWithContentType("application/pdf");

      expect(() => assertPdfDownload(response, encode("%PDF-1.7\n%%EOF"))).not.toThrow();
    });

    it("rejects truncated PDFs before saving them locally", () => {
      const response = responseWithContentType("application/pdf");

      expect(() => assertPdfDownload(response, encode("%PDF-1.7"))).toThrow(
        "Download failed before a PDF was created.",
      );
    });

    it("throws the server error instead of saving JSON as a PDF", () => {
      const response = responseWithContentType("application/json");

      expect(() => assertPdfDownload(response, encode('{ "error": "Free fill limit reached" }'))).toThrow(
        "Free fill limit reached",
      );
    });
  });

  describe("PDF download response helpers", () => {
    it("recognizes complete PDF byte streams", () => {
      expect(isLikelyCompletePdf(encode("%PDF-1.7\n1 0 obj\n%%EOF"))).toBe(true);
      expect(isLikelyCompletePdf(encode("not a pdf\n%%EOF"))).toBe(false);
      expect(isLikelyCompletePdf(encode("%PDF-1.7"))).toBe(false);
    });

    it("keeps generated filenames safe for common browsers", () => {
      expect(filledPdfFilename("ato-super-choice.pdf")).toBe("ato-super-choice-filled.pdf");
      expect(sanitizePdfFilename("../bad:name?.pdf")).toBe("bad-name-.pdf");
    });

    it("builds attachment headers with length, type, and UTF-8 filename fallback", () => {
      const headers = buildPdfDownloadHeaders(encode("%PDF-1.7\n%%EOF"), "résumé-filled.pdf") as Record<string, string>;

      expect(headers["Content-Type"]).toBe("application/pdf");
      expect(headers["Content-Length"]).toBe("14");
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["Content-Disposition"]).toContain("attachment;");
      expect(headers["Content-Disposition"]).toContain('filename="r_sum_-filled.pdf"');
      expect(headers["Content-Disposition"]).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9-filled.pdf");
    });
  });

  describe("shouldTryBillingSync", () => {
    it("refreshes signed-in free-looking accounts before enforcing the limit", () => {
      expect(shouldTryBillingSync({ isPro: false, tier: "free", guest: false })).toBe(true);
    });

    it("does not refresh guests or already-paid users", () => {
      expect(shouldTryBillingSync({ isPro: false, tier: "guest", guest: true })).toBe(false);
      expect(shouldTryBillingSync({ isPro: true, tier: "pro", guest: false })).toBe(false);
    });
  });
});
