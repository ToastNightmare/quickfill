import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  abn: string;
  organisation: string;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getRedis().get<UserProfile>(`profile:${userId}`);
  return NextResponse.json(profile ?? {});
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as UserProfile;
  await getRedis().set(`profile:${userId}`, body);

  return NextResponse.json({ ok: true });
}
