import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { log } from "@/lib/log";

export const runtime = "nodejs";

function cleanPathname(value: string | null) {
  const pathname = (value || "").trim();
  if (!pathname || pathname.length > 260) return "";
  if (!pathname.startsWith("support/") || pathname.startsWith("/") || pathname.includes("\\")) return "";
  if (pathname.split("/").some((part) => part === "..")) return "";
  return pathname;
}

export async function GET(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pathname = cleanPathname(request.nextUrl.searchParams.get("pathname"));
  if (!pathname) {
    return NextResponse.json({ error: "Missing attachment" }, { status: 400 });
  }

  try {
    const result = await get(pathname, { access: "private" });
    if (result?.statusCode !== 200) {
      return new NextResponse("Not found", { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    log.warn("support_attachment_view_failed", { error: error instanceof Error ? error.message : String(error) });
    return new NextResponse("Not found", { status: 404 });
  }
}
