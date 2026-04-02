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
  const limit = isBusiness ? -1 : 9;
  const fills = await getRedis().lrange<FillEntry>(`fills:${userId}`, 0, limit);

  return NextResponse.json({ fills: fills ?? [], isPro });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as FillEntry;
  const key = `fills:${userId}`;
  const sub = await getRedis().get<string>(`sub:${userId}`);
  const maxEntries = sub === "business" ? 99 : 9;

  await getRedis().lpush(key, body);
  await getRedis().ltrim(key, 0, maxEntries);

  return NextResponse.json({ ok: true });
}
