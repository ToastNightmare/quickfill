import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  SUPPORT_SCREENSHOT_MAX_BYTES,
  SUPPORT_SCREENSHOT_MAX_FILES,
  SUPPORT_SCREENSHOT_TOTAL_MAX_BYTES,
  cleanAttachmentFilename,
  extensionForContentType,
  isAllowedSupportScreenshotType,
  type SupportAttachment,
} from "@/lib/support-attachments";
import { checkRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";

export const runtime = "nodejs";

type UploadFile = File & { name: string; type: string; size: number };

function isUploadFile(value: FormDataEntryValue): value is UploadFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof (value as File).name === "string" &&
    typeof (value as File).type === "string" &&
    typeof (value as File).size === "number"
  );
}

function clientIdentifier(request: NextRequest, userId: string | null) {
  if (userId) return "support-attachment-user:" + userId;
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return "support-attachment-ip:" + (forwarded?.split(",")[0] || realIp || "unknown");
}

function monthPrefix(uploadedAt: string) {
  return uploadedAt.slice(0, 7);
}

function uploadedFilename(file: UploadFile, contentType: string) {
  const cleaned = cleanAttachmentFilename(file.name, "screenshot");
  const base = cleaned.replace(/\.[^.]+$/, "") || "screenshot";
  return `${base}.${extensionForContentType(contentType)}`;
}

function validateFiles(files: UploadFile[]) {
  if (files.length === 0) return "Choose at least one screenshot.";
  if (files.length > SUPPORT_SCREENSHOT_MAX_FILES) {
    return `Attach up to ${SUPPORT_SCREENSHOT_MAX_FILES} screenshots.`;
  }

  let totalBytes = 0;
  for (const file of files) {
    const contentType = file.type.toLowerCase();
    if (!isAllowedSupportScreenshotType(contentType)) {
      return "Screenshots must be PNG, JPG, or WebP images.";
    }
    if (file.size <= 0) return "One of the screenshots is empty.";
    if (file.size > SUPPORT_SCREENSHOT_MAX_BYTES) return "Each screenshot must be 5 MB or smaller.";
    totalBytes += file.size;
  }

  if (totalBytes > SUPPORT_SCREENSHOT_TOTAL_MAX_BYTES) {
    return "Screenshots must be 10 MB total or smaller.";
  }

  return "";
}

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Screenshot uploads are not configured yet." }, { status: 503 });
  }

  try {
    const { userId } = await auth().catch(() => ({ userId: null }));
    const rateKey = clientIdentifier(request, userId);
    const { success } = await checkRateLimit(rateKey, "support");
    if (!success) {
      return NextResponse.json({ error: "Too many screenshot uploads, try again soon." }, { status: 429 });
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Invalid screenshot upload." }, { status: 400 });
    }

    const files = formData.getAll("screenshots").filter(isUploadFile).filter((file) => file.size > 0);
    const validationError = validateFiles(files);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const attachments: SupportAttachment[] = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const uploadedAt = new Date().toISOString();
      const contentType = file.type.toLowerCase();
      const filename = uploadedFilename(file, contentType);
      const pathname = `support/${monthPrefix(uploadedAt)}/${id}-${filename}`;
      const blob = await put(pathname, file, {
        access: "private",
        addRandomSuffix: false,
      });

      attachments.push({
        id,
        filename,
        pathname: blob.pathname || pathname,
        url: blob.url,
        contentType,
        size: file.size,
        uploadedAt,
      });
    }

    return NextResponse.json({ ok: true, attachments });
  } catch (error) {
    log.error("support_attachment_upload_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not upload screenshots." }, { status: 500 });
  }
}
