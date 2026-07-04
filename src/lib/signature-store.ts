const SIGNATURE_KEY = "quickfill_signature";

// Matches the /api/signature guard: PNG data URLs only, ~200KB cap.
const MAX_SIGNATURE_SIZE = 200_000;
const PNG_PREFIX = "data:image/png;base64,";

/**
 * Validate a candidate saved-signature value.
 * Returns the normalized data URL, or null when the value is not a
 * reasonably-sized PNG data URL.
 */
export function normalizeLocalSignature(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith(PNG_PREFIX) || trimmed.length > MAX_SIGNATURE_SIZE) {
    return null;
  }
  const base64 = trimmed.slice(PNG_PREFIX.length);
  if (!base64 || !/^[a-zA-Z0-9+/=]+$/.test(base64)) return null;
  return `${PNG_PREFIX}${base64}`;
}

/**
 * Load the signature saved on this device, or null when none exists
 * or the stored value is invalid. Never throws.
 */
export function loadLocalSignature(): string | null {
  try {
    return normalizeLocalSignature(localStorage.getItem(SIGNATURE_KEY));
  } catch {
    // localStorage unavailable (private mode, blocked storage, SSR)
    return null;
  }
}

/**
 * Save a signature data URL on this device. Invalid values are ignored.
 * Never throws (quota and private-mode errors are swallowed).
 * Returns true when the signature was stored.
 */
export function saveLocalSignature(dataUrl: string): boolean {
  const normalized = normalizeLocalSignature(dataUrl);
  if (!normalized) return false;
  try {
    localStorage.setItem(SIGNATURE_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the signature saved on this device. Never throws.
 */
export function clearLocalSignature(): void {
  try {
    localStorage.removeItem(SIGNATURE_KEY);
  } catch {
    // silent
  }
}
