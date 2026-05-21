import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";

interface SavedSession {
  filename: string;
  savedAt: string;
  fields: object[];
  currentPage: number;
}

const MAX_SESSION_JSON_CHARS = 750_000;
const MAX_SESSION_FIELDS = 500;

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function requestIdentifier(req: Request, userId: string) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return `session:${userId}:${forwarded?.split(",")[0] || realIp || "unknown"}`;
}

function cleanFilename(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 180);
}

function cleanCurrentPage(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) && next >= 0 ? Math.trunc(next) : 0;
}

function cleanFields(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is object => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .slice(0, MAX_SESSION_FIELDS);
}

function sessionKey(userId: string, filename: string) {
  return `session:${userId}:${filename}`;
}

// GET /api/session?filename=xyz  -  load saved session
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return privateJson({ error: "Unauthorized" }, { status: 401 });
  const filename = cleanFilename(new URL(req.url).searchParams.get("filename"));
  if (!filename) return privateJson({ error: "Missing filename" }, { status: 400 });
  const session = await getRedis().get<SavedSession>(sessionKey(userId, filename));
  return privateJson(session ?? null);
}

// POST /api/session  -  save current session
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return privateJson({ error: "Unauthorized" }, { status: 401 });

  const limited = await checkRateLimit(requestIdentifier(req, userId));
  if (!limited.success) {
    return privateJson({ error: "Too many save attempts. Please try again shortly." }, { status: 429 });
  }

  const rawBody = await req.text().catch(() => "");
  if (!rawBody || rawBody.length > MAX_SESSION_JSON_CHARS) {
    return privateJson({ error: "Session data is too large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return privateJson({ error: "Invalid session data" }, { status: 400 });
  }

  const filename = cleanFilename(body.filename);
  if (!filename) return privateJson({ error: "Missing filename" }, { status: 400 });

  const session: SavedSession = {
    filename,
    savedAt: new Date().toISOString(),
    fields: cleanFields(body.fields),
    currentPage: cleanCurrentPage(body.currentPage),
  };
  // Store for 30 days
  await getRedis().set(sessionKey(userId, filename), session, { ex: 60 * 60 * 24 * 30 });
  return privateJson({ ok: true });
}

// DELETE /api/session?filename=xyz  -  clear saved session
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return privateJson({ error: "Unauthorized" }, { status: 401 });
  const filename = cleanFilename(new URL(req.url).searchParams.get("filename"));
  if (!filename) return privateJson({ error: "Missing filename" }, { status: 400 });
  await getRedis().del(sessionKey(userId, filename));
  return privateJson({ ok: true });
}
