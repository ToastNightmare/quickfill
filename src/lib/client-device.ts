const QUICKFILL_DEVICE_KEY = "quickfill_device_id";

function createDeviceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  const random = Math.random().toString(36).slice(2);
  return `qf-${Date.now().toString(36)}-${random}`;
}

export function getQuickFillDeviceId() {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(QUICKFILL_DEVICE_KEY);
    if (existing && existing.length >= 12) return existing;

    const next = createDeviceId();
    window.localStorage.setItem(QUICKFILL_DEVICE_KEY, next);
    return next;
  } catch {
    return "";
  }
}
