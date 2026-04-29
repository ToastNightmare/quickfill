// PDFs are processed in memory only and never persisted to disk or database

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import { PDFDocument, rgb, StandardFonts, degrees, PDFName, PDFArray, PDFDict } from "pdf-lib";
import type { EditorField } from "@/lib/types";
import { APP_CONFIG } from "@/lib/config";
import { applyBorderWatermark } from "@/lib/watermark";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedis } from "@/lib/redis";

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

async function getDownloadAccess(request: NextRequest): Promise<DownloadAccess> {
  const { userId } = await auth();

  if (!userId) {
    const key = getGuestIdentifier(request);
    const used = await getRedis().get<number>(key);
    return { isPro: false, used: used ?? 0, limit: FREE_FILL_LIMIT, key };
  }

  const [used, sub] = await Promise.all([
    getRedis().get<number>(usageKey(userId)),
    getRedis().get<string>(`sub:${userId}`),
  ]);
  const isPro = sub === "pro" || sub === "business";
  return { isPro, used: used ?? 0, limit: FREE_FILL_LIMIT, key: isPro ? null : usageKey(userId) };
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
  try {
    // Rate limiting check
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const identifier = forwarded?.split(",")[0] || realIp || "anonymous";
    const { success, remaining } = await checkRateLimit(identifier);
    if (!success) {
      return NextResponse.json({ error: "Too many requests, try again in a minute" }, { status: 429 });
    }

    const access = await getDownloadAccess(request);
    if (!access.isPro && access.used >= access.limit) {
      return NextResponse.json({ error: "Free fill limit reached. Upgrade to Pro for unlimited downloads." }, { status: 402 });
    }

    const formData = await request.formData();

    const pdfFile = formData.get("pdf") as File | null;
    if (!pdfFile) return NextResponse.json({ error: "Missing pdf file" }, { status: 400 });

    // Check file size limit (15MB max)
    const MAX_SIZE = 15 * 1024 * 1024; // 15MB in bytes
    if (pdfFile.size > MAX_SIZE) {
      return NextResponse.json({ error: "PDF too large (max 15MB)" }, { status: 413 });
    }

    const fieldsJson = formData.get("fields") as string | null;
    const pageScalesJson = formData.get("pageScales") as string | null;
    const viewportDimsJson = formData.get("viewportDims") as string | null;
    const hasAcroForm = formData.get("hasAcroForm") === "true";

    if (!fieldsJson || !pageScalesJson) {
      return NextResponse.json({ error: "Missing fields or pageScales" }, { status: 400 });
    }

    const editorFields: EditorField[] = JSON.parse(fieldsJson);
    const pageScaleEntries: [number, number][] = JSON.parse(pageScalesJson);
    const pageScales = new Map(pageScaleEntries);
    
    // Parse viewport dimensions if provided (for coordinate transformation)
    let viewportDims: Map<number, { width: number; height: number }> | null = null;
    if (viewportDimsJson) {
      try {
        const viewportEntries: [number, { width: number; height: number }][] = JSON.parse(viewportDimsJson);
        viewportDims = new Map(viewportEntries);
      } catch {
        viewportDims = null;
      }
    }

    const pdfBytes = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
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
        removeWidgetAnnotations(pdfDoc);
        pdfDoc.catalog.delete(PDFName.of("AcroForm"));
      } catch (flattenErr) {
        console.warn("blank form flatten failed, removing filled-area widgets:", flattenErr instanceof Error ? flattenErr.message : flattenErr);
        removeFilledAreaWidgets(pdfDoc, form, editorFields);
        try {
          for (const remainingField of form.getFields()) remainingField.enableReadOnly();
        } catch {
          // Form cleanup is best-effort; drawn output remains static.
        }
      }

      const wrappedPages = new Set<number>();
      for (const field of editorFields) {
        if (!wrappedPages.has(field.page)) {
          const page = pdfDoc.getPages()[field.page];
          if (page) preparePageForDrawing(page, pdfDoc);
          wrappedPages.add(field.page);
        }
        await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont, viewportDims);
      }
    } else {
      // Track which pages have been wrapped to avoid duplicate wrapping
      const wrappedPages = new Set<number>();
      for (const field of editorFields) {
        // Prepare page for drawing by popping unbalanced graphics states once per page
        if (!wrappedPages.has(field.page)) {
          const page = pdfDoc.getPages()[field.page];
          if (page) preparePageForDrawing(page, pdfDoc);
          wrappedPages.add(field.page);
        }
        await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont, viewportDims);
      }
    }

    // Apply border watermark for free/guest users (skip for Pro)
    const pages = pdfDoc.getPages();
    const watermarkFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    applyBorderWatermark(pages, watermarkFont, access.isPro);

    const resultBytes = await pdfDoc.save();
    await incrementDownloadUsage(access);

    return new NextResponse(Buffer.from(resultBytes), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("fill-pdf error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
      if (stream && typeof (stream as any).getContents === 'function') {
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
    if (typeof (contents as any).getContents === 'function') {
      allBytes = (contents as any).getContents();
    } else {
      return;
    }
  }
  
  const text = new TextDecoder('latin1').decode(allBytes);
  
  // Count q/Q imbalance
  const qMatches = text.match(/(?:^|\s)q(?:\s|$)/g) || [];
  const QMatches = text.match(/(?:^|\s)Q(?:\s|$)/g) || [];
  const unbalanced = qMatches.length - QMatches.length;

  // Save the original graphics state before existing content runs.
  const qStream = context.stream(new TextEncoder().encode("q\n"));
  const qRef = context.register(qStream);

  // Close the wrapper plus any leaked states from the original content.
  let bridgeOps = '\n';
  for (let i = 0; i < Math.max(1, unbalanced + 1); i++) {
    bridgeOps += 'Q\n';
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
}
