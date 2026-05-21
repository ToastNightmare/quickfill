import crypto from "crypto";
import type { NextRequest } from "next/server";
import type { QuickFillTier } from "@/lib/billing-store";
import { isDatabaseConfigured, query } from "@/lib/db";

type GuardTier = QuickFillTier | "guest" | "qa";

type DeviceGuardInput = {
  request: NextRequest;
  userId: string | null;
  tier: GuardTier;
  deviceId?: string | null;
  qaBypass?: boolean;
};

type DeviceGuardResult =
  | { allowed: true; limit: number; activeDeviceCount: number }
  | { allowed: false; limit: number; activeDeviceCount: number; message: string };

function numericEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function deviceLimitForTier(tier: GuardTier) {
  if (tier === "business") return numericEnv("QUICKFILL_BUSINESS_DEVICE_LIMIT", 8);
  if (tier === "pro") return numericEnv("QUICKFILL_PRO_DEVICE_LIMIT", 3);
  return Number.POSITIVE_INFINITY;
}

function activeWindowDays() {
  return numericEnv("QUICKFILL_DEVICE_WINDOW_DAYS", 30);
}

function hash(value: string) {
  const salt = process.env.QUICKFILL_DEVICE_SALT ?? "quickfill-device-v1";
  return crypto.createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || realIp || "unknown";
}

function normalizeDeviceId(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length < 8) return null;
  return trimmed.slice(0, 200);
}

function fallbackDeviceId(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  return `fallback:${userAgent}:${requestIp(request)}`;
}

function deviceLabel(userAgent: string) {
  const ua = userAgent.toLowerCase();
  const device = ua.includes("iphone")
    ? "iPhone"
    : ua.includes("ipad")
      ? "iPad"
      : ua.includes("android")
        ? "Android"
        : ua.includes("windows")
          ? "Windows"
          : ua.includes("mac os")
            ? "Mac"
            : "Device";

  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome/")
      ? "Chrome"
      : ua.includes("safari/")
        ? "Safari"
        : "Browser";

  return `${device} ${browser}`.slice(0, 80);
}

async function recordDeviceLimitAudit(userId: string, metadata: Record<string, unknown>) {
  try {
    await query(
      "insert into audit_events (user_id, event_type, metadata) values ($1, $2, $3::jsonb)",
      [userId, "device_limit_blocked", JSON.stringify(metadata)],
    );
  } catch (error) {
    console.error("device_limit_audit_failed", error instanceof Error ? error.message : String(error));
  }
}

export async function enforceAccountDeviceLimit(input: DeviceGuardInput): Promise<DeviceGuardResult> {
  const limit = deviceLimitForTier(input.tier);

  if (input.qaBypass || !input.userId || !Number.isFinite(limit)) {
    return { allowed: true, limit, activeDeviceCount: 0 };
  }

  if (input.tier !== "pro" && input.tier !== "business") {
    return { allowed: true, limit, activeDeviceCount: 0 };
  }

  if (!isDatabaseConfigured()) {
    return { allowed: true, limit, activeDeviceCount: 0 };
  }

  const rawDeviceId = normalizeDeviceId(input.deviceId) ?? fallbackDeviceId(input.request);
  const deviceIdHash = hash(`${input.userId}:${rawDeviceId}`);
  const userAgent = (input.request.headers.get("user-agent") ?? "unknown").slice(0, 220);
  const ipHash = hash(requestIp(input.request));
  const windowDays = activeWindowDays();

  try {
    const existingRows = await query<{ active: boolean }>(
      `select last_seen_at > now() - ($3::int * interval '1 day') as active
       from account_devices
       where user_id = $1 and device_id_hash = $2
       limit 1`,
      [input.userId, deviceIdHash, windowDays],
    );
    const isAlreadyActive = Boolean(existingRows[0]?.active);

    const activeRows = await query<{ count: string | number }>(
      `select count(*) as count
       from account_devices
       where user_id = $1 and last_seen_at > now() - ($2::int * interval '1 day')`,
      [input.userId, windowDays],
    );
    const activeDeviceCount = Number(activeRows[0]?.count ?? 0);

    if (!isAlreadyActive && activeDeviceCount >= limit) {
      const message = `This account is already active on ${limit} devices. Use one of those devices, or contact support to reset access.`;
      await recordDeviceLimitAudit(input.userId, {
        tier: input.tier,
        limit,
        activeDeviceCount,
        deviceIdHash,
        label: deviceLabel(userAgent),
        ipHash,
      });
      return { allowed: false, limit, activeDeviceCount, message };
    }

    await query(
      `insert into account_devices (user_id, device_id_hash, label, user_agent, last_ip_hash, first_seen_at, last_seen_at)
       values ($1, $2, $3, $4, $5, now(), now())
       on conflict (user_id, device_id_hash) do update set
         label = excluded.label,
         user_agent = excluded.user_agent,
         last_ip_hash = excluded.last_ip_hash,
         last_seen_at = now()`,
      [input.userId, deviceIdHash, deviceLabel(userAgent), userAgent, ipHash],
    );

    return {
      allowed: true,
      limit,
      activeDeviceCount: isAlreadyActive ? activeDeviceCount : activeDeviceCount + 1,
    };
  } catch (error) {
    console.error("device_guard_failed", error instanceof Error ? error.message : String(error));
    return { allowed: true, limit, activeDeviceCount: 0 };
  }
}
