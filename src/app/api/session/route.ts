import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

interface SavedSession {
  filename: string;
  savedAt: string;
  fields: object[];
  currentPage: number;
}

// GET /api/session?filename=xyz — load saved session
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const filename = new URL(req.url).searchParams.get("filename");
  if (!filename) return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  const session = await getRedis().get<SavedSession>(`session:${userId}:${filename}`);
  return NextResponse.json(session ?? null);
}

// POST /api/session — save current session
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const session: SavedSession = {
    filename: String(body.filename),
    savedAt: new Date().toISOString(),
    fields: body.fields ?? [],
    currentPage: body.currentPage ?? 0,
  };
  // Store for 30 days
  await getRedis().set(`session:${userId}:${session.filename}`, session, { ex: 60 * 60 * 24 * 30 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/session?filename=xyz — clear saved session
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const filename = new URL(req.url).searchParams.get("filename");
  if (!filename) return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  await getRedis().del(`session:${userId}:${filename}`);
  return NextResponse.json({ ok: true });
}
