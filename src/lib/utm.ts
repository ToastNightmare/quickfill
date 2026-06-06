export interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

interface StoredUtm extends UtmParams {
  capturedAt: string;
}

const UTM_STORAGE_KEY = "qf_utm";
const UTM_TTL_DAYS = 30;

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function captureAndStoreUtm(): void {
  const storage = getLocalStorage();
  if (!storage) return;

  const existingRaw = storage.getItem(UTM_STORAGE_KEY);
  if (existingRaw) {
    try {
      const existing: StoredUtm = JSON.parse(existingRaw);
      const capturedAt = new Date(existing.capturedAt);
      const now = new Date();
      const daysDiff = (now.getTime() - capturedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff < UTM_TTL_DAYS) {
        return;
      }
    } catch {
      // Parse failed, will overwrite
    }
  }

  const params = new URLSearchParams(window.location.search);
  const utm: StoredUtm = {
    utm_source: params.get("utm_source") ?? undefined,
    utm_medium: params.get("utm_medium") ?? undefined,
    utm_campaign: params.get("utm_campaign") ?? undefined,
    utm_content: params.get("utm_content") ?? undefined,
    utm_term: params.get("utm_term") ?? undefined,
    capturedAt: new Date().toISOString(),
  };

  const hasAnyUtm = Object.values(utm).some(
    (value) => value !== undefined && value !== null && value !== ""
  );

  if (!hasAnyUtm) {
    return;
  }

  storage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
}

export function getStoredUtm(): UtmParams {
  const storage = getLocalStorage();
  if (!storage) return {};

  const raw = storage.getItem(UTM_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed: StoredUtm = JSON.parse(raw);
    const { capturedAt, ...utmParams } = parsed;
    return utmParams;
  } catch {
    return {};
  }
}

export function clearStoredUtm(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.removeItem(UTM_STORAGE_KEY);
}
