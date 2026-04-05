import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export interface FillEntry {
  filename: string;
  filledAt: string;
  fieldCount: number;
  pageCount: number;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sub = await getRedis().get<string>(`sub:${userId}`);
  const isBusiness = sub === "business";
  const isPro = sub === "pro";
  // -1 = all entries, 29 = index of 30th item (Pro: last 30), 9 = index of 10th item (Free: last 10)
  const rangeEnd = isBusiness ? -1 : isPro ? 29 : 9;
  const fills = await getRedis().lrange<FillEntry>(`fills:${userId}`, 0, rangeEnd);

  return NextResponse.json({ fills: fills ?? [], isPro });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Validate required fields
  if (!body || typeof body !== "object" || !body.filename || !body.filledAt) {
    return NextResponse.json(
      { error: "Missing required fields: filename, filledAt" },
      { status: 400 }
    );
  }

  const fillEntry: FillEntry = {
    filename: String(body.filename),
    filledAt: String(body.filledAt),
    fieldCount: Number(body.fieldCount) || 0,
    pageCount: Number(body.pageCount) || 1,
  };

  const key = `fills:${userId}`;
  const sub = await getRedis().get<string>(`sub:${userId}`);
  // max index to keep: business=unlimited(999), pro=29(30 items), free=9(10 items)
  const maxIndex = sub === "business" ? 999 : sub === "pro" ? 29 : 9;

  await getRedis().lpush(key, fillEntry);
  await getRedis().ltrim(key, 0, maxIndex);

  return NextResponse.json({ ok: true });
}
