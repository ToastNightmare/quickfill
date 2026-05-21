import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";

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

const MAX_PROFILE_JSON_CHARS = 32_000;

const PROFILE_FIELD_LIMITS: Record<keyof UserProfile, number> = {
  fullName: 120,
  email: 160,
  phone: 40,
  street: 180,
  addressLine1: 180,
  addressLine2: 180,
  city: 80,
  state: 40,
  postcode: 20,
  country: 80,
  abn: 40,
  organisation: 160,
  dateOfBirth: 40,
  gender: 40,
  tfn: 40,
  medicareNumber: 60,
  medicareExpiry: 40,
  driversLicence: 80,
  driversLicenceExpiry: 40,
  passportNumber: 80,
  employer: 160,
  jobTitle: 120,
  bankBsb: 40,
  bankAccount: 60,
  bankName: 120,
};

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function requestIdentifier(req: Request, userId: string) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return `profile:${userId}:${forwarded?.split(",")[0] || realIp || "unknown"}`;
}

function cleanString(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ").trim().slice(0, max);
}

function sanitizeProfile(input: Record<string, unknown>): UserProfile {
  const profile: UserProfile = {
    fullName: cleanString(input.fullName, PROFILE_FIELD_LIMITS.fullName),
    email: cleanString(input.email, PROFILE_FIELD_LIMITS.email),
    phone: cleanString(input.phone, PROFILE_FIELD_LIMITS.phone),
    street: cleanString(input.street, PROFILE_FIELD_LIMITS.street),
    city: cleanString(input.city, PROFILE_FIELD_LIMITS.city),
    state: cleanString(input.state, PROFILE_FIELD_LIMITS.state),
    postcode: cleanString(input.postcode, PROFILE_FIELD_LIMITS.postcode),
    abn: cleanString(input.abn, PROFILE_FIELD_LIMITS.abn),
  };

  for (const key of Object.keys(PROFILE_FIELD_LIMITS) as Array<keyof UserProfile>) {
    if (key in profile) continue;
    const value = cleanString(input[key], PROFILE_FIELD_LIMITS[key]);
    if (value) profile[key] = value;
  }

  return profile;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getRedis().get<UserProfile>(`profile:${userId}`);
  return privateJson(profile ?? {});
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(requestIdentifier(req, userId));
  if (!limited.success) {
    return privateJson({ error: "Too many profile updates. Please try again shortly." }, { status: 429 });
  }

  const rawBody = await req.text().catch(() => "");
  if (!rawBody || rawBody.length > MAX_PROFILE_JSON_CHARS) {
    return privateJson({ error: "Profile data is too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return privateJson({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return privateJson({ error: "Invalid request body" }, { status: 400 });
  }

  const profile = sanitizeProfile(body as Record<string, unknown>);
  await getRedis().set(`profile:${userId}`, profile);

  return privateJson({ ok: true });
}
