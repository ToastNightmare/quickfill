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

  const fills = await getRedis().lrange<FillEntry>(`fills:${userId}`, 0, 9);
  const sub = await getRedis().get<string>(`sub:${userId}`);
  const isPro = sub === "pro";

  return NextResponse.json({ fills: fills ?? [], isPro });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as FillEntry;
  const key = `fills:${userId}`;

  await getRedis().lpush(key, body);
  await getRedis().ltrim(key, 0, 9);

  return NextResponse.json({ ok: true });
}
