import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_SIGNATURE_SIZE = 200_000; // ~200KB base64 limit
const MAX_SIGNATURE_JSON_CHARS = 220_000;

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function requestIdentifier(req: Request, userId: string) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return `signature:${userId}:${forwarded?.split(",")[0] || realIp || "unknown"}`;
}

function normalizeSignatureDataUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:image/png;base64,") || trimmed.length > MAX_SIGNATURE_SIZE) return null;
  const base64 = trimmed.slice("data:image/png;base64,".length).replace(/\s/g, "");
  if (!base64 || !/^[a-zA-Z0-9+/=]+$/.test(base64)) return null;
  return `data:image/png;base64,${base64}`;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getRedis().get<{ signatureDataUrl: string }>(
    `signature:${userId}`
  );
  return privateJson(data ?? { signatureDataUrl: null });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(requestIdentifier(req, userId));
  if (!limited.success) {
    return privateJson({ error: "Too many signature updates. Please try again shortly." }, { status: 429 });
  }

  const rawBody = await req.text().catch(() => "");
  if (!rawBody || rawBody.length > MAX_SIGNATURE_JSON_CHARS) {
    return privateJson({ error: "Signature too large" }, { status: 400 });
  }

  let body: { signatureDataUrl?: unknown };
  try {
    body = JSON.parse(rawBody) as { signatureDataUrl?: unknown };
  } catch {
    return privateJson({ error: "Invalid signature data" }, { status: 400 });
  }

  const signatureDataUrl = normalizeSignatureDataUrl(body.signatureDataUrl);
  if (!signatureDataUrl) {
    return privateJson(
      { error: "Invalid signature data" },
      { status: 400 }
    );
  }

  await getRedis().set(`signature:${userId}`, {
    signatureDataUrl,
  });

  return privateJson({ ok: true });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }

  await getRedis().del(`signature:${userId}`);
  return privateJson({ ok: true });
}
