import { assertPdfDownload, shouldTryBillingSync } from "@/lib/download-client";
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

      expect(() => assertPdfDownload(response, encode("%PDF-1.7"))).not.toThrow();
    });

    it("throws the server error instead of saving JSON as a PDF", () => {
      const response = responseWithContentType("application/json");

      expect(() => assertPdfDownload(response, encode('{ "error": "Free fill limit reached" }'))).toThrow(
        "Free fill limit reached",
      );
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
