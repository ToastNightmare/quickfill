import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

const MAX_SIGNATURE_SIZE = 200_000; // ~200KB base64 limit

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getRedis().get<{ signatureDataUrl: string }>(
    `signature:${userId}`
  );
  return NextResponse.json(data ?? { signatureDataUrl: null });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { signatureDataUrl: string };

  if (
    !body.signatureDataUrl ||
    typeof body.signatureDataUrl !== "string" ||
    !body.signatureDataUrl.startsWith("data:image/png;base64,")
  ) {
    return NextResponse.json(
      { error: "Invalid signature data" },
      { status: 400 }
    );
  }

  if (body.signatureDataUrl.length > MAX_SIGNATURE_SIZE) {
    return NextResponse.json(
      { error: "Signature too large" },
      { status: 400 }
    );
  }

  await getRedis().set(`signature:${userId}`, {
    signatureDataUrl: body.signatureDataUrl,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await getRedis().del(`signature:${userId}`);
  return NextResponse.json({ ok: true });
}
