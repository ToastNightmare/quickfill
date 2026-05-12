import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionToken,
  isAdminPasswordConfigured,
  verifyAdminPassword,
} from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";

export const runtime = "nodejs";

function requesterId(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return forwarded?.split(",")[0] || realIp || "admin-login";
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(`admin-login:${requesterId(req)}`);
  if (!limited.success) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  if (!isAdminPasswordConfigured()) {
    return NextResponse.json(
      { error: "Admin passcode is not configured yet." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!verifyAdminPassword(password)) {
    log.warn("admin_login_failed", { ip: requesterId(req) });
    return NextResponse.json({ error: "Incorrect admin passcode." }, { status: 401 });
  }

  const token = adminSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: "Admin passcode is not configured yet." },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 60 * 60 * 12,
  });

  log.info("admin_login_success", { ip: requesterId(req) });
  return response;
}
