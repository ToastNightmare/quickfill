import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  street: string;
  addressLine1?: string;
  addressLine2?: string;
  city: string;
  state: string;
  postcode: string;
  country?: string;
  abn: string;
  organisation?: string;
  // Australian-specific fields
  dateOfBirth?: string;
  gender?: string;
  tfn?: string;
  medicareNumber?: string;
  medicareExpiry?: string;
  driversLicence?: string;
  driversLicenceExpiry?: string;
  passportNumber?: string;
  employer?: string;
  jobTitle?: string;
  bankBsb?: string;
  bankAccount?: string;
  bankName?: string;
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

  const body = await req.json();

  // Validate required fields
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const profile = body as UserProfile;
  await getRedis().set(`profile:${userId}`, profile);

  return NextResponse.json({ ok: true });
}
