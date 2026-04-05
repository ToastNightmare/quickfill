import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, PDFName, rgb, StandardFonts } from "pdf-lib";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require("@pdf-lib/fontkit") as typeof import("@pdf-lib/fontkit");
import type { EditorField } from "@/lib/types";
import { APP_CONFIG } from "@/lib/config";
import { NOTO_SANS_REGULAR_B64, NOTO_SANS_ITALIC_B64 } from "@/lib/fonts";

// Decode base64 fonts once — bundled directly in code, no fs dependency
const notoSansBytes = Buffer.from(NOTO_SANS_REGULAR_B64, "base64");
const notoSansItalicBytes = Buffer.from(NOTO_SANS_ITALIC_B64, "base64");

/** Decode a base64 data URL to raw bytes */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return new Uint8Array(0);
  const binary = Buffer.from(base64, "base64");
  return new Uint8Array(binary);
}

/** Strip control characters except newline */
function sanitize(text: string): string {
  return text.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const pdfFile = formData.get("pdf") as File | null;
    if (!pdfFile) {
      return NextResponse.json({ error: "Missing pdf file" }, { status: 400 });
    }

    const fieldsJson = formData.get("fields") as string | null;
    const pageScalesJson = formData.get("pageScales") as string | null;
    const hasAcroForm = formData.get("hasAcroForm") === "true";
    const addWatermark = formData.get("addWatermark") === "true";

    if (!fieldsJson || !pageScalesJson) {
      return NextResponse.json(
        { error: "Missing fields or pageScales" },
        { status: 400 }
      );
    }

    const editorFields: EditorField[] = JSON.parse(fieldsJson);
    const pageScaleEntries: [number, number][] = JSON.parse(pageScalesJson);
    const pageScales = new Map(pageScaleEntries);

    const pdfBytes = await pdfFile.arrayBuffer();

    console.log("[fill-pdf] notoSansBytes length:", notoSansBytes.length);
    console.log("[fill-pdf] notoSansItalicBytes length:", notoSansItalicBytes.length);
    console.log("[fill-pdf] fontkit keys:", Object.keys(fontkit));
    console.log("[fill-pdf] hasAcroForm:", hasAcroForm);

    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
    });

    // Register fontkit so pdf-lib can embed custom TTF fonts
    pdfDoc.registerFontkit(fontkit);
    console.log("[fill-pdf] fontkit registered");

    // Embed Unicode fonts (bundled as base64 — no fs dependency)
    const font = await pdfDoc.embedFont(notoSansBytes);
    console.log("[fill-pdf] font embedded:", font.name);
    const signatureFont = await pdfDoc.embedFont(notoSansItalicBytes);
    console.log("[fill-pdf] signatureFont embedded:", signatureFont.name);

    if (hasAcroForm) {
      // For AcroForm PDFs: read widget positions, then draw directly onto pages.
      // We bypass AcroForm entirely — no setText, no flatten.
      // SAFETY: Wrap in try-catch to handle PDFs with malformed or problematic AcroForm
      try {
        const form = pdfDoc.getForm();
        const acroFields = form.getFields();

      // Build a map of field name -> widget info (position, page)
      const widgetMap = new Map<
        string,
        { x: number; y: number; width: number; height: number; pageIndex: number }
      >();

      for (const af of acroFields) {
        const widgets = af.acroField.getWidgets();
        for (const widget of widgets) {
          const rect = widget.getRectangle();
          const pageRef = widget.P();
          let pageIndex = 0;
          if (pageRef) {
            const pages = pdfDoc.getPages();
            for (let i = 0; i < pages.length; i++) {
              if (pages[i].ref === pageRef) {
                pageIndex = i;
                break;
              }
            }
          }
          widgetMap.set(af.getName(), {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            pageIndex,
          });
        }
      }

      for (const field of editorFields) {
        const widget = widgetMap.get(field.id);

        if (widget) {
          // This is an AcroForm field — draw content at the widget position
          const page = pdfDoc.getPages()[widget.pageIndex];
          if (!page) continue;

          if (field.type === "signature" && field.signatureDataUrl) {
            await drawSignatureImage(
              pdfDoc,
              page,
              field.signatureDataUrl,
              widget.x,
              widget.y,
              widget.width,
              widget.height,
              field.value,
              signatureFont,
              14
            );
          } else if (
            field.type === "text" ||
            field.type === "date" ||
            field.type === "signature"
          ) {
            if (field.value) {
              const fontSize = 10; // sensible default for AcroForm fields
              const activeFont =
                field.type === "signature" ? signatureFont : font;
              drawMultilineText(
                page,
                sanitize(field.value),
                widget.x + 2,
                widget.y + widget.height - fontSize - 2,
                fontSize,
                activeFont
              );
            }
          } else if (field.type === "checkbox" && field.checked) {
            const stamp = (field as { stamp?: string }).stamp ?? "tick";
            drawCheckmark(
              page,
              widget.x,
              widget.y,
              widget.width,
              widget.height,
              stamp
            );
          }
        } else {
          // Not an AcroForm field — draw using editor coordinates
          await drawFieldOnPage(
            pdfDoc,
            field,
            pageScales,
            font,
            signatureFont
          );
        }
      }

        // Remove AcroForm dictionary entirely from the PDF catalog.
        // This prevents pdf-lib from calling updateFieldAppearances() during save(),
        // which would re-encode existing field values through WinAnsi and crash on
        // newlines (0x0a) or non-Latin characters.
        pdfDoc.catalog.delete(PDFName.of("AcroForm"));
      } catch {
        // If AcroForm processing fails (e.g., malformed fields with newlines),
        // fall back to drawing all fields as non-AcroForm fields.
        // Always delete the AcroForm dictionary to prevent WinAnsi errors during save.
        try {
          pdfDoc.catalog.delete(PDFName.of("AcroForm"));
        } catch {
          // Ignore if deletion fails
        }
        for (const field of editorFields) {
          await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
        }
      }
    } else {
      // Non-AcroForm: draw all fields using editor coordinates
      for (const field of editorFields) {
        await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
      }
    }

    // Watermark (Helvetica is fine for ASCII watermark text)
    if (addWatermark) {
      const watermarkFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        const { width } = page.getSize();
        const text = `Filled with QuickFill - ${APP_CONFIG.domain}`;
        const textWidth = watermarkFont.widthOfTextAtSize(text, 8);
        page.drawText(text, {
          x: width - textWidth - 12,
          y: 10,
          size: 8,
          font: watermarkFont,
          color: rgb(0.6, 0.6, 0.6),
        });
      }
    }

    const resultBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(resultBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("fill-pdf error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Drawing helpers ────────────────────────────────────────────────

type PDFPage = ReturnType<PDFDocument["getPages"]>[number];
type PDFFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;

function drawMultilineText(
  page: PDFPage,
  text: string,
  x: number,
  startY: number,
  fontSize: number,
  activeFont: PDFFont
) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  const lineHeight = fontSize * 1.2;
  lines.forEach((line, i) => {
    const safeLine = sanitize(line);
    if (!safeLine) return;
    page.drawText(safeLine, {
      x,
      y: startY - i * lineHeight,
      size: fontSize,
      font: activeFont,
      color: rgb(0, 0, 0),
    });
  });
}

async function drawSignatureImage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  signatureDataUrl: string,
  pdfX: number,
  pdfY: number,
  pdfW: number,
  pdfH: number,
  fallbackText: string,
  signatureFont: PDFFont,
  fontSize: number
) {
  try {
    const imgBytes = dataUrlToBytes(signatureDataUrl);
    if (imgBytes.length === 0) throw new Error("Empty signature data");
    const isJpeg =
      signatureDataUrl.startsWith("data:image/jpeg") ||
      signatureDataUrl.startsWith("data:image/jpg");
    const img = isJpeg
      ? await pdfDoc.embedJpg(imgBytes)
      : await pdfDoc.embedPng(imgBytes);
    const imgDims = img.scale(1);
    const imgAspect = imgDims.width / imgDims.height;
    const fieldAspect = pdfW / pdfH;
    let drawW = pdfW - 4;
    let drawH = pdfH - 4;
    if (imgAspect > fieldAspect) {
      drawH = drawW / imgAspect;
    } else {
      drawW = drawH * imgAspect;
    }
    const drawX = pdfX + (pdfW - drawW) / 2;
    const drawY = pdfY + (pdfH - drawH) / 2;
    page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
  } catch {
    if (fallbackText) {
      const safeFallback = sanitize(fallbackText).replace(/\n/g, " ");
      page.drawText(safeFallback, {
        x: pdfX + 2,
        y: pdfY + 4,
        size: fontSize,
        font: signatureFont,
        color: rgb(0, 0, 0),
      });
    }
  }
}

function drawCheckmark(
  page: PDFPage,
  pdfX: number,
  pdfY: number,
  pdfW: number,
  pdfH: number,
  stamp: string
) {
  const cx = pdfX + pdfW / 2;
  const cy = pdfY + pdfH / 2;
  const r = Math.min(pdfW, pdfH) * 0.35;
  const lw = Math.max(1, r * 0.18);
  const dark = rgb(0.07, 0.09, 0.15);

  if (stamp === "tick") {
    page.drawLine({
      start: { x: cx - r * 0.55, y: cy - r * 0.05 },
      end: { x: cx - r * 0.1, y: cy - r * 0.5 },
      thickness: lw,
      color: dark,
    });
    page.drawLine({
      start: { x: cx - r * 0.1, y: cy - r * 0.5 },
      end: { x: cx + r * 0.6, y: cy + r * 0.5 },
      thickness: lw,
      color: dark,
    });
  } else if (stamp === "cross") {
    page.drawLine({
      start: { x: cx - r * 0.6, y: cy - r * 0.6 },
      end: { x: cx + r * 0.6, y: cy + r * 0.6 },
      thickness: lw,
      color: dark,
    });
    page.drawLine({
      start: { x: cx + r * 0.6, y: cy - r * 0.6 },
      end: { x: cx - r * 0.6, y: cy + r * 0.6 },
      thickness: lw,
      color: dark,
    });
  }
}

async function drawFieldOnPage(
  pdfDoc: PDFDocument,
  field: EditorField,
  pageScales: Map<number, number>,
  font: PDFFont,
  signatureFont: PDFFont
) {
  const page = pdfDoc.getPages()[field.page];
  if (!page) return;

  const scale = pageScales.get(field.page) ?? 1;
  const pdfX = field.x / scale;
  const pdfY = page.getHeight() - field.y / scale - field.height / scale;
  const pdfW = field.width / scale;
  const pdfH = field.height / scale;

  if (field.type === "signature" && field.signatureDataUrl) {
    await drawSignatureImage(
      pdfDoc,
      page,
      field.signatureDataUrl,
      pdfX,
      pdfY,
      pdfW,
      pdfH,
      field.value,
      signatureFont,
      (field.fontSize ?? 16) / scale
    );
  } else if (
    field.type === "text" ||
    field.type === "date" ||
    field.type === "signature"
  ) {
    if (field.value) {
      const fontSize =
        (field.type === "signature" ? 16 : field.fontSize ?? 14) / scale;
      const activeFont = field.type === "signature" ? signatureFont : font;
      drawMultilineText(
        page,
        sanitize(field.value),
        pdfX + 2,
        pdfY + pdfH - fontSize - 2,
        fontSize,
        activeFont
      );
    }
  } else if (field.type === "checkbox" && field.checked) {
    const stamp = (field as { stamp?: string }).stamp ?? "tick";
    drawCheckmark(page, pdfX, pdfY, pdfW, pdfH, stamp);
  }
}
