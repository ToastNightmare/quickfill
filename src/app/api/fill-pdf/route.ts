// PDFs are processed in memory only and never persisted to disk or database

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFName,
  PDFArray,
  PDFDict,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clipEvenOdd,
  endPath,
} from "pdf-lib";
import type { EditorField } from "@/lib/types";
import { APP_CONFIG } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedis } from "@/lib/redis";
import { recordDownloadLog } from "@/lib/admin-logs";
import { getRequestEntitlement } from "@/lib/entitlements";
import { orderFieldsForPdfDraw } from "@/lib/pdf-utils";
import { buildPdfDownloadHeaders, filledPdfFilename } from "@/lib/pdf-download-response";
import { finalizePdfForDownload } from "@/lib/pdf-finalize";
import { PDF_UPLOAD_MAX_BYTES, PDF_UPLOAD_MAX_LABEL } from "@/lib/upload-limits";
import { lineMaskSegments } from "@/lib/eraser-mask";
import { maskToPdfRect } from "@/lib/pdf-mask-transform";
import { applyFlattenedPages, parseFlattenedPages, whiteoutPageSet } from "@/lib/pdf-flatten";

/** Replace control characters (including newlines) with a space */
function sanitize(text: string): string {
  return text.replace(/[\x00-\x09\x0b-\x1f\x7f\n\r]/g, " ");
}

/** Check if a string has characters outside WinAnsi range */
function hasNonWinAnsi(text: string): boolean {
  return /[^\x00-\xff]/.test(text) || /[\x00-\x09\x0b-\x1f\x7f]/.test(text);
}

const FREE_FILL_LIMIT = 3;
const USAGE_TTL_SECONDS = 35 * 24 * 60 * 60;
const GUEST_TTL_SECONDS = 30 * 24 * 60 * 60;

type DownloadAccess = {
  isPro: boolean;
  used: number;
  limit: number;
  key: string | null;
  userId: string | null;
  guest: boolean;
  isQaBypass?: boolean;
};

function usageKey(userId: string) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `usage:${userId}:${month}`;
}

function getGuestIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0] || realIp || "unknown";
  const hash = crypto.createHash("sha256").update(ip).digest("hex");
  return `guest:fills:${hash}`;
}

function hasValidQaToken(request: NextRequest): boolean {
  const expected = process.env.QUICKFILL_QA_TOKEN;
  const provided = request.headers.get("x-quickfill-qa-token");
  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

async function getDownloadAccess(request: NextRequest): Promise<DownloadAccess> {
  if (hasValidQaToken(request)) {
    return { isPro: true, used: 0, limit: FREE_FILL_LIMIT, key: null, userId: null, guest: false, isQaBypass: true };
  }

  const entitlement = await getRequestEntitlement(request);

  if (!entitlement.userId) {
    const key = entitlement.anonymousId ? `guest:fills:${entitlement.anonymousId}` : getGuestIdentifier(request);
    const used = await getRedis().get<number>(key);
    return { isPro: false, used: used ?? 0, limit: entitlement.limit, key, userId: null, guest: true };
  }

  const used = await getRedis().get<number>(usageKey(entitlement.userId));
  const isPro = entitlement.tier === "pro" || entitlement.tier === "business";
  return {
    isPro,
    used: used ?? 0,
    limit: entitlement.limit,
    key: isPro ? null : usageKey(entitlement.userId),
    userId: entitlement.userId,
    guest: false,
  };
}

async function incrementDownloadUsage(access: DownloadAccess) {
  if (access.isPro || !access.key) return;
  const newCount = await getRedis().incr(access.key);
  if (newCount === 1) {
    const ttl = access.key.startsWith("guest:") ? GUEST_TTL_SECONDS : USAGE_TTL_SECONDS;
    await getRedis().expire(access.key, ttl);
  }
}

/** Decode a base64 data URL to raw bytes */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return new Uint8Array(0);
  const binary = Buffer.from(base64, "base64");
  return new Uint8Array(binary);
}

export async function POST(request: NextRequest) {
  let accessForLog: DownloadAccess | null = null;
  let fileForLog: { name?: string; size?: number } | null = null;
  let fieldsForLog: EditorField[] = [];
  let pageCountForLog = 0;
  let hasAcroFormForLog = false;

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const pdfFile = formData.get("pdf") as File | null;
    if (!pdfFile) return NextResponse.json({ error: "Missing pdf file" }, { status: 400 });
    fileForLog = { name: pdfFile.name, size: pdfFile.size };

    const fieldsJson = formData.get("fields") as string | null;
    const pageScalesJson = formData.get("pageScales") as string | null;
    const viewportDimsJson = formData.get("viewportDims") as string | null;
    const flattenedPagesJson = formData.get("flattenedPages") as string | null;
    const hasAcroForm = formData.get("hasAcroForm") === "true";
    hasAcroFormForLog = hasAcroForm;

    if (!fieldsJson || !pageScalesJson) {
      return NextResponse.json({ error: "Missing fields or pageScales" }, { status: 400 });
    }

    let editorFields: EditorField[];
    let pageScales: Map<number, number>;
    let viewportDims: Map<number, { width: number; height: number }> | null = null;
    try {
      editorFields = JSON.parse(fieldsJson);
      const pageScaleEntries: [number, number][] = JSON.parse(pageScalesJson);
      pageScales = new Map(pageScaleEntries);

      if (viewportDimsJson) {
        const viewportEntries: [number, { width: number; height: number }][] = JSON.parse(viewportDimsJson);
        viewportDims = new Map(viewportEntries);
      }
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const orderedFields = orderFieldsForPdfDraw(editorFields);
    fieldsForLog = editorFields;

    const qaBypass = hasValidQaToken(request);

    if (!qaBypass) {
      const forwarded = request.headers.get("x-forwarded-for");
      const realIp = request.headers.get("x-real-ip");
      const identifier = forwarded?.split(",")[0] || realIp || "anonymous";
      const { success } = await checkRateLimit(identifier);
      if (!success) {
        return NextResponse.json({ error: "Too many requests, try again in a minute" }, { status: 429 });
      }
    }

    const access = await getDownloadAccess(request);
    accessForLog = access;
    if (!access.isPro && access.used >= access.limit) {
      await recordDownloadLog({
        status: "blocked",
        userId: access.userId,
        guest: access.guest,
        reason: "free_limit",
        message: "Free fill limit reached",
      });
      return NextResponse.json({ error: "Free fill limit reached. Upgrade to Pro for unlimited downloads." }, { status: 402 });
    }

    if (pdfFile.size > PDF_UPLOAD_MAX_BYTES) {
      await recordDownloadLog({
        status: "blocked",
        userId: accessForLog?.userId,
        guest: accessForLog?.guest,
        filename: fileForLog?.name,
        fileSizeKb: Math.round((fileForLog?.size ?? 0) / 1024),
        reason: "file_too_large",
        message: "PDF too large",
      });
      return NextResponse.json({ error: `PDF too large (max ${PDF_UPLOAD_MAX_LABEL})` }, { status: 413 });
    }

    const pdfBytes = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    pageCountForLog = pdfDoc.getPageCount();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const signatureFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    if (hasAcroForm) {
      const form = pdfDoc.getForm();

      try {
        for (const acroField of form.getFields()) {
          if (acroField.constructor.name === "PDFTextField") {
            try {
              const textField = form.getTextField(acroField.getName());
              const raw = textField.getText() ?? "";
              if (raw) textField.setText(sanitize(raw));
            } catch { /* skip unreadable text fields */ }
          }
        }
        form.flatten({ updateFieldAppearances: false });
      } catch (flattenErr) {
        console.warn("blank form flatten failed, removing AcroForm artifacts:", flattenErr instanceof Error ? flattenErr.message : flattenErr);
        removeFilledAreaWidgets(pdfDoc, form, editorFields);
        try {
          for (const remainingField of form.getFields()) remainingField.enableReadOnly();
        } catch {
          // Form cleanup is best-effort; drawn output remains static.
        }
      }

      cleanupAcroFormArtifacts(pdfDoc);
    }

    // Flattened Whiteout: pages with whiteout may arrive with a client-rendered
    // image that already has the whiteout burned in. Replacing the page content
    // with that image removes the covered original text from the download.
    // Any invalid/missing image falls back to the vector whiteout below.
    const flattenedEntries = parseFlattenedPages(
      flattenedPagesJson,
      pdfDoc.getPageCount(),
      whiteoutPageSet(editorFields),
    );
    const flattenedPageSet = await applyFlattenedPages(pdfDoc, flattenedEntries);

    // Track which pages have been wrapped to avoid duplicate wrapping
    const wrappedPages = new Set<number>();
    for (const field of orderedFields) {
      // Whiteout is already burned into flattened page images; skip the vector rect.
      if (field.type === "whiteout" && flattenedPageSet.has(field.page)) continue;
      if (!wrappedPages.has(field.page)) {
        const page = pdfDoc.getPages()[field.page];
        // Prepare page for drawing by popping unbalanced graphics states once per page.
        // Flattened pages have fresh pdf-lib content and need no wrapping.
        if (page && !flattenedPageSet.has(field.page)) preparePageForDrawing(page, pdfDoc);
        wrappedPages.add(field.page);
      }
      await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont, viewportDims);
    }

    const resultBytes = await finalizePdfForDownload(pdfDoc, access.isPro || access.isQaBypass === true);
    const resultBuffer = Buffer.from(resultBytes);
    await incrementDownloadUsage(access);
    await recordDownloadLog({
      status: "success",
      userId: access.userId,
      guest: access.guest,
      filename: fileForLog?.name,
      fileSizeKb: Math.round((fileForLog?.size ?? 0) / 1024),
      fieldCount: editorFields.length,
      pageCount: pageCountForLog,
      hasAcroForm,
    });

    return new NextResponse(resultBuffer, {
      status: 200,
      headers: buildPdfDownloadHeaders(resultBuffer, filledPdfFilename(pdfFile.name)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("fill-pdf error:", message);
    await recordDownloadLog({
      status: "failed",
      userId: accessForLog?.userId,
      guest: accessForLog?.guest,
      filename: fileForLog?.name,
      fileSizeKb: Math.round((fileForLog?.size ?? 0) / 1024),
      fieldCount: fieldsForLog.length,
      pageCount: pageCountForLog,
      hasAcroForm: hasAcroFormForLog,
      reason: "server_error",
      message,
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Helpers

type PDFPage = ReturnType<PDFDocument["getPages"]>[number];
type PDFFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;
type PDFForm = ReturnType<PDFDocument["getForm"]>;

function findWidgetPageIndex(pdfDoc: PDFDocument, widget: any) {
  const pageRef = widget.P();
  if (!pageRef) return 0;
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].ref === pageRef) return i;
  }
  return 0;
}

function overlapRatio(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const overlapArea = overlapX * overlapY;
  if (overlapArea <= 0) return 0;
  const smallestArea = Math.min(a.width * a.height, b.width * b.height);
  return smallestArea > 0 ? overlapArea / smallestArea : 0;
}

function fieldPdfRect(page: PDFPage, field: EditorField) {
  return {
    x: field.x,
    y: page.getHeight() - field.y - field.height,
    width: field.width,
    height: field.height,
  };
}

function removeFilledAreaWidgets(pdfDoc: PDFDocument, form: PDFForm, editorFields: EditorField[]) {
  const pages = pdfDoc.getPages();
  const fieldsToRemove = new Set<ReturnType<PDFForm["getFields"]>[number]>();

  for (const acroField of form.getFields()) {
    const nameMatches = editorFields.some((field) => field.id === acroField.getName());
    if (nameMatches) {
      fieldsToRemove.add(acroField);
      continue;
    }

    try {
      for (const widget of acroField.acroField.getWidgets()) {
        const pageIndex = findWidgetPageIndex(pdfDoc, widget);
        const page = pages[pageIndex];
        if (!page) continue;

        const rect = widget.getRectangle();
        const widgetRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        const overlapsFilledField = editorFields.some((field) => {
          if (field.page !== pageIndex) return false;
          return overlapRatio(widgetRect, fieldPdfRect(page, field)) >= 0.35;
        });

        if (overlapsFilledField) {
          fieldsToRemove.add(acroField);
          break;
        }
      }
    } catch {
      // Keep unreadable widgets rather than risk stripping visible form structure.
    }
  }

  for (const field of fieldsToRemove) {
    try {
      form.removeField(field);
    } catch {
      try { field.enableReadOnly(); } catch { /* skip */ }
    }
  }
}

function cleanupAcroFormArtifacts(pdfDoc: PDFDocument) {
  try {
    removeWidgetAnnotations(pdfDoc);
  } catch { /* cleanup is best-effort */ }
  try {
    pdfDoc.catalog.delete(PDFName.of("AcroForm"));
  } catch { /* cleanup is best-effort */ }
}

function removeWidgetAnnotations(pdfDoc: PDFDocument) {
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.Annots();
    if (!(annots instanceof PDFArray)) continue;

    const keptAnnots = PDFArray.withContext(pdfDoc.context);
    for (let i = 0; i < annots.size(); i++) {
      const annotRef = annots.get(i);
      let annot: PDFDict | undefined;
      try {
        annot = pdfDoc.context.lookup(annotRef, PDFDict);
      } catch {
        continue;
      }

      if (!annot) continue;

      if (annot instanceof PDFDict) {
        const subtype = annot.get(PDFName.of("Subtype"));
        if (subtype?.toString() === "/Widget") continue;
      }

      keptAnnots.push(annotRef);
    }

    if (keptAnnots.size() > 0) page.node.set(PDFName.of("Annots"), keptAnnots);
    else page.node.delete(PDFName.of("Annots"));
  }
}

function drawMultilineText(page: PDFPage, text: string, x: number, startY: number, fontSize: number, activeFont: PDFFont) {
  const safeLine = sanitize(text);
  if (!safeLine) return;
  page.drawText(safeLine, { x, y: startY, size: fontSize, font: activeFont, color: rgb(0, 0, 0) });
}

async function drawSignatureImage(pdfDoc: PDFDocument, page: PDFPage, signatureDataUrl: string,
  pdfX: number, pdfY: number, pdfW: number, pdfH: number,
  fallbackText: string, signatureFont: PDFFont, fontSize: number) {
  try {
    const imgBytes = dataUrlToBytes(signatureDataUrl);
    if (imgBytes.length === 0) throw new Error("Empty signature data");
    const isJpeg = signatureDataUrl.startsWith("data:image/jpeg") || signatureDataUrl.startsWith("data:image/jpg");
    const img = isJpeg ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
    const imgDims = img.scale(1);
    const imgAspect = imgDims.width / imgDims.height;
    const fieldAspect = pdfW / pdfH;
    let drawW = pdfW - 4;
    let drawH = pdfH - 4;
    if (imgAspect > fieldAspect) { drawH = drawW / imgAspect; } else { drawW = drawH * imgAspect; }
    const drawX = pdfX + (pdfW - drawW) / 2;
    const drawY = pdfY + (pdfH - drawH) / 2;
    page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
  } catch {
    if (fallbackText) {
      page.drawText(sanitize(fallbackText), { x: pdfX + 2, y: pdfY + 4, size: fontSize, font: signatureFont, color: rgb(0, 0, 0) });
    }
  }
}

function drawCheckmark(page: PDFPage, pdfX: number, pdfY: number, pdfW: number, pdfH: number, stamp: string) {
  const cx = pdfX + pdfW / 2;
  const cy = pdfY + pdfH / 2;
  const r = Math.min(pdfW, pdfH) * 0.35;
  const lw = Math.max(1, r * 0.18);
  const dark = rgb(0.07, 0.09, 0.15);
  if (stamp === "tick") {
    page.drawLine({ start: { x: cx - r * 0.55, y: cy - r * 0.05 }, end: { x: cx - r * 0.1, y: cy - r * 0.5 }, thickness: lw, color: dark });
    page.drawLine({ start: { x: cx - r * 0.1, y: cy - r * 0.5 }, end: { x: cx + r * 0.6, y: cy + r * 0.5 }, thickness: lw, color: dark });
  } else if (stamp === "cross") {
    page.drawLine({ start: { x: cx - r * 0.6, y: cy - r * 0.6 }, end: { x: cx + r * 0.6, y: cy + r * 0.6 }, thickness: lw, color: dark });
    page.drawLine({ start: { x: cx + r * 0.6, y: cy - r * 0.6 }, end: { x: cx - r * 0.6, y: cy + r * 0.6 }, thickness: lw, color: dark });
  }
}

function hexToRgbPdf(hex: string) {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function pdfRectOps(x: number, y: number, w: number, h: number) {
  return [
    moveTo(x, y),
    lineTo(x + w, y),
    lineTo(x + w, y + h),
    lineTo(x, y + h),
    closePath(),
  ];
}

function fieldSupportsMaskClip(field: EditorField): boolean {
  return field.type === "text" || field.type === "date" || field.type === "signature" || field.type === "checkbox";
}

// Isolate existing page content so new drawings use clean page coordinates.
// Some source PDFs leave transforms or q states open at the end of a content stream.
// Wrapping the original streams and closing any leaked states prevents those
// transforms from scaling our field text, comb spacing, and positions.
function preparePageForDrawing(page: PDFPage, pdfDoc: PDFDocument) {
  const node = page.node;
  const context = pdfDoc.context;
  const contents = node.Contents();

  if (!contents) return;

  // Gather all existing content bytes
  let allBytes: Uint8Array;
  const contentRefs: any[] = [];

  if (contents instanceof PDFArray) {
    const chunks: Uint8Array[] = [];
    for (const ref of contents.asArray()) {
      contentRefs.push(ref);
      const stream = context.lookup(ref);
      if (stream && typeof (stream as any).getContents === "function") {
        chunks.push((stream as any).getContents());
      }
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    if (totalLen === 0) return;
    allBytes = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      allBytes.set(c, offset);
      offset += c.length;
    }
  } else {
    contentRefs.push(contents);
    if (typeof (contents as any).getContents === "function") {
      allBytes = (contents as any).getContents();
    } else {
      return;
    }
  }

  const text = new TextDecoder("latin1").decode(allBytes);

  // Count q/Q imbalance
  const qMatches = text.match(/(?:^|\s)q(?:\s|$)/g) || [];
  const QMatches = text.match(/(?:^|\s)Q(?:\s|$)/g) || [];
  const unbalanced = qMatches.length - QMatches.length;

  // Save the original graphics state before existing content runs.
  const qStream = context.stream(new TextEncoder().encode("q\n"));
  const qRef = context.register(qStream);

  // Close the wrapper plus any leaked states from the original content.
  let bridgeOps = "\n";
  for (let i = 0; i < Math.max(1, unbalanced + 1); i++) {
    bridgeOps += "Q\n";
  }

  // Append the bridge after existing content, leaving following draws clean.
  const bridgeStream = context.stream(new TextEncoder().encode(bridgeOps));
  const bridgeRef = context.register(bridgeStream);

  const newArray = context.obj([qRef, ...contentRefs, bridgeRef]);
  node.set(PDFName.of("Contents"), newArray);
}

async function drawFieldOnPage(pdfDoc: PDFDocument, field: EditorField, _pageScales: Map<number, number>, font: PDFFont, signatureFont: PDFFont, _viewportDims: Map<number, { width: number; height: number }> | null = null) {
  const page = pdfDoc.getPages()[field.page];
  if (!page) return;

  // Field coordinates are now in clean PDF page coordinate space
  // No scaling needed - the graphics state isolation handles any transforms
  const pdfX = field.x;
  const pdfY = field.y;
  const pdfW = field.width;
  const pdfH = field.height;

  // Flip Y axis (PDF origin is bottom-left, viewport origin is top-left)
  const finalPdfY = page.getHeight() - pdfY - pdfH;

  if (field.type === "line" && field.eraseMasks?.length) {
    const lineField = field as import("@/lib/types").LineField;
    const lineColor = hexToRgbPdf(lineField.color ?? "#000000");
    const lw = lineField.strokeWidth ?? 1;
    const segments = lineMaskSegments(lineField, field.eraseMasks);

    for (const [segStart, segEnd] of segments) {
      if (lineField.orientation === "horizontal") {
        page.drawLine({
          start: { x: segStart, y: finalPdfY + pdfH / 2 },
          end: { x: segEnd, y: finalPdfY + pdfH / 2 },
          thickness: lw,
          color: lineColor,
        });
      } else {
        const lineX = pdfX + pdfW / 2;
        page.drawLine({
          start: { x: lineX, y: page.getHeight() - segStart },
          end: { x: lineX, y: page.getHeight() - segEnd },
          thickness: lw,
          color: lineColor,
        });
      }
    }
    return;
  }

  if (field.type === "comb" && field.eraseMasks?.length) {
    console.warn("Ignoring eraseMasks on comb field:", field.id);
  }

  const shouldClipMasks = Boolean(field.eraseMasks?.length && fieldSupportsMaskClip(field));

  if (shouldClipMasks) {
    const pdfMasks = field.eraseMasks!.map((mask) => maskToPdfRect(mask, page.getHeight()));
    page.pushOperators(
      pushGraphicsState(),
      ...pdfRectOps(pdfX, finalPdfY, pdfW, pdfH),
      ...pdfMasks.flatMap((mask) => pdfRectOps(mask.x, mask.y, mask.width, mask.height)),
      clipEvenOdd(),
      endPath(),
    );
  }

  try {
  if (field.type === "whiteout") {
    // Draw a filled rectangle with the sampled background color
    const whiteoutField = field as import("@/lib/types").WhiteoutField;
    // Parse hex color to RGB (0-1 range for pdf-lib)
    let r = 1, g = 1, b = 1;
    const hex = whiteoutField.fillColor.replace("#", "");
    if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      b = parseInt(hex.slice(4, 6), 16) / 255;
    }
    page.drawRectangle({
      x: pdfX,
      y: finalPdfY,
      width: pdfW,
      height: pdfH,
      color: rgb(r, g, b),
    });
  } else if (field.type === "signature" && field.signatureDataUrl) {
    await drawSignatureImage(pdfDoc, page, field.signatureDataUrl, pdfX, finalPdfY, pdfW, pdfH, field.value, signatureFont, field.fontSize ?? 16);
  } else if (field.type === "text" || field.type === "date" || field.type === "signature") {
    if (field.value) {
      const fontSize = field.type === "signature" ? 16 : field.fontSize ?? 14;
      const activeFont = field.type === "signature" ? signatureFont : font;
      // Vertically center text in the field box (matching editor's verticalAlign: "middle")
      const textY = finalPdfY + (pdfH - fontSize) / 2;
      page.drawText(sanitize(field.value), {
        x: pdfX + 2,
        y: textY,
        size: fontSize,
        font: activeFont,
        color: rgb(0, 0, 0),
      });
    }
  } else if (field.type === "checkbox" && field.checked) {
    const stamp = (field as { stamp?: string }).stamp ?? "tick";
    drawCheckmark(page, pdfX, finalPdfY, pdfW, pdfH, stamp);
  } else if (field.type === "line") {
    const lineField = field as import("@/lib/types").LineField;
    const lineColor = hexToRgbPdf(lineField.color ?? "#000000");
    const lw = lineField.strokeWidth ?? 1;
    if (lineField.orientation === "horizontal") {
      page.drawLine({
        start: { x: pdfX, y: finalPdfY + pdfH / 2 },
        end: { x: pdfX + pdfW, y: finalPdfY + pdfH / 2 },
        thickness: lw,
        color: lineColor,
      });
    } else {
      page.drawLine({
        start: { x: pdfX + pdfW / 2, y: finalPdfY },
        end: { x: pdfX + pdfW / 2, y: finalPdfY - pdfH },
        thickness: lw,
        color: lineColor,
      });
    }
  } else if (field.type === "comb") {
    const combField = field as import("@/lib/types").CombField;
    const value = combField.value ?? "";
    if (!value) return;

    const fontSize = (combField as unknown as { fontSize?: number }).fontSize ?? pdfH * 0.6;
    const charCount = combField.charCount || 1;
    const offsetX = combField.offsetX ?? 0;
    const charOffsetX = combField.charOffsetX ?? 0;

    // Use non-uniform cell positions/widths if available, otherwise uniform spacing
    const cellPositions = combField.cellPositions;
    const cellWidths = combField.cellWidths;
    const uniformCellWidth = combField.cellWidth ?? (field.width / charCount);

    // Draw each character centered in its cell
    for (let i = 0; i < value.length && i < charCount; i++) {
      const char = value[i];
      // Skip space characters (gaps between groups)
      if (char === " ") continue;

      let cellCenterX: number;
      let cellW: number;

      if (cellPositions && cellPositions[i] !== undefined) {
        // Non-uniform: cellPositions are cell centers in PDF points, relative to field.x
        // cellPositions[i] is the center of cell i relative to field.x
        cellCenterX = pdfX + offsetX + cellPositions[i];
        cellW = (cellWidths && cellWidths[i] !== undefined) ? cellWidths[i] : uniformCellWidth;
      } else {
        // Uniform spacing: divide field width by charCount
        cellW = uniformCellWidth;
        cellCenterX = pdfX + offsetX + (i + 0.5) * cellW;
      }

      // Measure character width for centering
      const charWidth = font.widthOfTextAtSize(char, fontSize);
      const charX = cellCenterX - charWidth / 2 + charOffsetX;

      // Vertically center the character
      const charY = finalPdfY + (pdfH - fontSize) / 2;

      page.drawText(char, {
        x: charX,
        y: charY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
  }
  } finally {
    if (shouldClipMasks) {
      page.pushOperators(popGraphicsState());
    }
  }
}
