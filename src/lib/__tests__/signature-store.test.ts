import {
  clearLocalSignature,
  loadLocalSignature,
  normalizeLocalSignature,
  saveLocalSignature,
} from "../signature-store";

const KEY = "quickfill_signature";
const VALID_SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

describe("signature-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("save/load round trip", () => {
    it("saves a valid PNG data URL and loads it back", () => {
      expect(saveLocalSignature(VALID_SIGNATURE)).toBe(true);
      expect(loadLocalSignature()).toBe(VALID_SIGNATURE);
    });

    it("returns null when nothing is saved", () => {
      expect(loadLocalSignature()).toBeNull();
    });

    it("trims surrounding whitespace before storing", () => {
      expect(saveLocalSignature(`  ${VALID_SIGNATURE}  `)).toBe(true);
      expect(loadLocalSignature()).toBe(VALID_SIGNATURE);
    });
  });

  describe("validation", () => {
    it("rejects non-PNG data URLs", () => {
      expect(saveLocalSignature("data:image/jpeg;base64,abcd")).toBe(false);
      expect(loadLocalSignature()).toBeNull();
    });

    it("rejects plain strings and javascript URLs", () => {
      expect(saveLocalSignature("hello")).toBe(false);
      expect(saveLocalSignature("javascript:alert(1)")).toBe(false);
      expect(loadLocalSignature()).toBeNull();
    });

    it("rejects oversized values", () => {
      const big = `data:image/png;base64,${"A".repeat(250_000)}`;
      expect(saveLocalSignature(big)).toBe(false);
      expect(loadLocalSignature()).toBeNull();
    });

    it("rejects a data URL with an empty payload", () => {
      expect(saveLocalSignature("data:image/png;base64,")).toBe(false);
    });

    it("rejects base64 payloads containing invalid characters", () => {
      expect(saveLocalSignature("data:image/png;base64,abc<script>")).toBe(false);
    });

    it("returns null for corrupt values already in localStorage", () => {
      localStorage.setItem(KEY, "not-a-signature");
      expect(loadLocalSignature()).toBeNull();

      localStorage.setItem(KEY, "data:image/svg+xml;base64,PHN2Zz4=");
      expect(loadLocalSignature()).toBeNull();
    });

    it("normalizeLocalSignature handles non-string input", () => {
      expect(normalizeLocalSignature(null)).toBeNull();
      expect(normalizeLocalSignature(undefined)).toBeNull();
      expect(normalizeLocalSignature(123)).toBeNull();
      expect(normalizeLocalSignature({})).toBeNull();
    });
  });

  describe("clearLocalSignature", () => {
    it("removes the saved signature", () => {
      saveLocalSignature(VALID_SIGNATURE);
      clearLocalSignature();
      expect(loadLocalSignature()).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });

  describe("storage errors", () => {
    it("does not throw when setItem fails (quota/private mode)", () => {
      const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("QuotaExceededError");
      });
      expect(() => saveLocalSignature(VALID_SIGNATURE)).not.toThrow();
      expect(saveLocalSignature(VALID_SIGNATURE)).toBe(false);
      spy.mockRestore();
    });

    it("does not throw when getItem fails", () => {
      const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(() => loadLocalSignature()).not.toThrow();
      expect(loadLocalSignature()).toBeNull();
      spy.mockRestore();
    });

    it("does not throw when removeItem fails", () => {
      const spy = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(() => clearLocalSignature()).not.toThrow();
      spy.mockRestore();
    });
  });
});
