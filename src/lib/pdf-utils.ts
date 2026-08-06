import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  rgb,
  StandardFonts,
  type RGB,
} from "pdf-lib";
import type { EditorField } from "./types";
import { APP_CONFIG } from "./config";

type PDFFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;

/** Replace control characters (including newlines) with a space, keeps text WinAnsi-safe */
function sanitize(text: string): string {
  return text.replace(/[\x00-\x09\x0b-\x1f\x7f\n\r]/g, " ");
}

/** Keep intentional line breaks while making all other control characters safe. */
export function sanitizeMultiline(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, " ");
}

export interface OverlayTextFontMetrics {
  widthOfTextAtSize(text: string, fontSize: number): number;
  heightAtSize(
    fontSize: number,
    options?: { descender?: boolean },
  ): number;
}

function splitOverlayWord(
  word: string,
  innerWidth: number,
  widthOfText: (text: string) => number,
): string[] {
  const pieces: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const character of Array.from(word)) {
    const characterWidth = widthOfText(character);
    if (current && currentWidth + characterWidth > innerWidth) {
      pieces.push(current);
      current = character;
      currentWidth = characterWidth;
    } else if (!current && characterWidth > innerWidth) {
      pieces.push(character);
    } else {
      current += character;
      currentWidth += characterWidth;
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

/**
 * Preserve explicit paragraphs, then greedily wrap each paragraph to the
 * measured inner width. Words wider than the box are split by character so a
 * single token cannot escape horizontally.
 */
export function wrapOverlayTextLines(
  value: string,
  innerWidthPts: number,
  font: OverlayTextFontMetrics,
  fontSize: number,
): string[] {
  if (!value) return [];

  const innerWidth = Number.isFinite(innerWidthPts)
    ? Math.max(0, innerWidthPts)
    : Number.MAX_SAFE_INTEGER;
  const lines: string[] = [];
  const widthCache = new Map<string, number>();
  const widthOfText = (text: string) => {
    const cached = widthCache.get(text);
    if (cached !== undefined) return cached;
    const measured = font.widthOfTextAtSize(text, fontSize);
    widthCache.set(text, measured);
    return measured;
  };
  const spaceWidth = widthOfText(" ");

  for (const paragraph of value.replace(/\r\n?/g, "\n").split("\n")) {
    const words = paragraph.match(/\S+/g) ?? [];
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    let currentWidth = 0;
    for (const word of words) {
      const wordWidth = widthOfText(word);
      const candidate = current ? `${current} ${word}` : word;
      const candidateWidth = current
        ? currentWidth + spaceWidth + wordWidth
        : wordWidth;
      if (candidateWidth <= innerWidth) {
        current = candidate;
        currentWidth = candidateWidth;
        continue;
      }

      if (current) {
        lines.push(current);
        current = "";
        currentWidth = 0;
      }

      if (wordWidth <= innerWidth) {
        current = word;
        currentWidth = wordWidth;
        continue;
      }

      const pieces = splitOverlayWord(word, innerWidth, widthOfText);
      lines.push(...pieces.slice(0, -1));
      current = pieces.at(-1) ?? "";
      currentWidth = widthOfText(current);
    }

    if (current) lines.push(current);
  }

  return lines;
}

export function overlayTextBaseline(
  fieldBottom: number,
  fieldHeight: number,
  fontSize: number,
  activeFont: PDFFont,
) {
  const ascent = activeFont.heightAtSize(fontSize, { descender: false });
  const fullHeight = activeFont.heightAtSize(fontSize);
  const descent = fullHeight - ascent;
  return fieldBottom + (fieldHeight - fullHeight) / 2 + descent;
}

export const MIN_OVERLAY_FONT_SIZE = 4;
export const STANDARD_OVERLAY_TEXT_HEIGHT_RATIO = 0.925;

export interface MultilineOverlayTextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

/**
 * Find the largest font size whose wrapped lines fit inside the padded box.
 * If even 4pt cannot fit, retain the established 4pt floor and let the caller
 * apply its normal clipping policy.
 */
export function fitMultilineOverlayText(
  value: string,
  innerWidthPts: number,
  boxHeight: number,
  font: OverlayTextFontMetrics,
  requestedFontSize = 12,
  verticalPadding = 0,
): MultilineOverlayTextLayout {
  const requested = Number.isFinite(requestedFontSize)
    ? Math.max(MIN_OVERLAY_FONT_SIZE, requestedFontSize)
    : 12;
  const safeBoxHeight = Number.isFinite(boxHeight)
    ? Math.max(0, boxHeight)
    : 0;
  const safePadding = Number.isFinite(verticalPadding)
    ? Math.max(0, verticalPadding)
    : 0;
  const availableHeight = Math.max(0, safeBoxHeight - safePadding * 2);

  const layoutAt = (fontSize: number): MultilineOverlayTextLayout => {
    const lines = wrapOverlayTextLines(
      value,
      innerWidthPts,
      font,
      fontSize,
    );
    const measuredHeight = font.heightAtSize(fontSize);
    const lineHeight =
      Number.isFinite(measuredHeight) && measuredHeight > 0
        ? measuredHeight
        : standardOverlayTextHeightAtSize(fontSize);
    return { lines, fontSize, lineHeight };
  };
  const fits = (layout: MultilineOverlayTextLayout) =>
    layout.lines.length * layout.lineHeight <= availableHeight;

  const requestedLayout = layoutAt(requested);
  if (fits(requestedLayout)) return requestedLayout;

  const minimumLayout = layoutAt(MIN_OVERLAY_FONT_SIZE);
  if (!fits(minimumLayout)) return minimumLayout;

  let lower = MIN_OVERLAY_FONT_SIZE;
  let upper = requested;
  let fitted = minimumLayout;
  for (
    let index = 0;
    index < 20 && upper - lower > 0.01;
    index += 1
  ) {
    const candidate = (lower + upper) / 2;
    const candidateLayout = layoutAt(candidate);
    if (fits(candidateLayout)) {
      lower = candidate;
      fitted = candidateLayout;
    } else {
      upper = candidate;
    }
  }
  return fitted;
}

/**
 * pdf-lib's standard Helvetica and HelveticaOblique fonts both report a
 * full ascent-plus-descent height of 0.925pt at 1pt. Keep the editor's
 * height fit in the same metric family as the PDF overlay baseline.
 */
export function standardOverlayTextHeightAtSize(fontSize: number): number {
  return fontSize * STANDARD_OVERLAY_TEXT_HEIGHT_RATIO;
}

/**
 * Scale the existing overlay padding down before it can consume a small box.
 * Ten percent on each side always leaves a positive inner content area.
 */
export function fitOverlayTextPadding(
  boxWidth: number,
  boxHeight: number,
  preferredPadding: number,
): number {
  const smallerDimension = Math.max(0, Math.min(boxWidth, boxHeight));
  return Math.min(Math.max(0, preferredPadding), smallerDimension * 0.1);
}

/**
 * Find the largest font size whose full ascent-plus-descent height fits the
 * padded box. When even 4pt cannot fit, keep 4pt and let the renderer clip it
 * instead of hiding a non-empty value.
 */
export function fitOverlayFontSize(
  boxHeight: number,
  requestedFontSize: number,
  fullHeightAtSize: (fontSize: number) => number,
  verticalPadding = 0,
): number {
  const requested = Number.isFinite(requestedFontSize)
    ? Math.max(MIN_OVERLAY_FONT_SIZE, requestedFontSize)
    : MIN_OVERLAY_FONT_SIZE;
  const safeBoxHeight = Number.isFinite(boxHeight) ? Math.max(0, boxHeight) : 0;
  const safePadding = Number.isFinite(verticalPadding)
    ? Math.max(0, verticalPadding)
    : 0;
  const availableHeight = Math.max(0, safeBoxHeight - safePadding * 2);

  if (fullHeightAtSize(requested) <= availableHeight) return requested;
  if (fullHeightAtSize(MIN_OVERLAY_FONT_SIZE) > availableHeight) {
    return MIN_OVERLAY_FONT_SIZE;
  }

  let lower = MIN_OVERLAY_FONT_SIZE;
  let upper = requested;
  for (let index = 0; index < 40; index += 1) {
    const candidate = (lower + upper) / 2;
    if (fullHeightAtSize(candidate) <= availableHeight) {
      lower = candidate;
    } else {
      upper = candidate;
    }
  }
  return lower;
}

/**
 * Prepare a download-only copy whose matched AcroForm text appearances are
 * blank. The server can then flatten the source form before drawing the comb
 * overlays without retaining the original left-aligned value underneath.
 */
export async function clearAcroFormTextValuesForOverlay(
  originalPdfBytes: ArrayBuffer,
  fieldNames: readonly string[],
): Promise<ArrayBuffer> {
  const uniqueFieldNames = new Set(fieldNames);
  if (uniqueFieldNames.size === 0) return originalPdfBytes;

  const pdfDoc = await PDFDocument.load(originalPdfBytes, {
    ignoreEncryption: true,
  });
  const form = pdfDoc.getForm();
  const fieldsByName = new Map(
    form.getFields().map((field) => [field.getName(), field] as const),
  );
  const clearedFields: PDFTextField[] = [];

  for (const fieldName of uniqueFieldNames) {
    const field = fieldsByName.get(fieldName);
    if (!(field instanceof PDFTextField)) continue;
    field.setText("");
    clearedFields.push(field);
  }

  if (clearedFields.length === 0) return originalPdfBytes;
  const appearanceFont = form.getDefaultFont();
  for (const field of clearedFields) {
    field.updateAppearances(appearanceFont);
  }
  const bytes = await pdfDoc.save({ updateFieldAppearances: false });
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/**
 * Keep eraser/whiteout marks behind everything the customer adds afterwards.
 * This makes the final PDF match the editor: whiteout first, text/signature/checks on top.
 */
export function orderFieldsForPdfDraw(editorFields: EditorField[]): EditorField[] {
  const whiteoutFields = editorFields.filter((field) => field.type === "whiteout");
  const overlayFields = editorFields.filter((field) => field.type !== "whiteout");
  return [...whiteoutFields, ...overlayFields];
}

function parsePdfColor(color?: string | null): RGB {
  if (!color) return rgb(1, 1, 1);
  const value = color.trim().toLowerCase();

  const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const raw = hexMatch[1];
    const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
    const intValue = Number.parseInt(full, 16);
    return rgb(
      ((intValue >> 16) & 255) / 255,
      ((intValue >> 8) & 255) / 255,
      (intValue & 255) / 255
    );
  }

  const rgbaMatch = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbaMatch) {
    const [r, g, b] = rgbaMatch[1]
      .split(",")
      .slice(0, 3)
      .map((part) => Math.max(0, Math.min(255, Number.parseFloat(part.trim()) || 0)) / 255);
    return rgb(r ?? 1, g ?? 1, b ?? 1);
  }

  return rgb(1, 1, 1);
}

function hexToRgbPdf(hex: string): RGB {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Load a PDF and detect AcroForm fields with their positions.
 */
export async function detectAcroFormFields(pdfBytes: ArrayBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const downloadPreserveEnabled =
    process.env.NEXT_PUBLIC_QUICKFILL_DOWNLOAD_PRESERVE === "v1";
  const mobilePolishEnabled =
    process.env.NEXT_PUBLIC_QUICKFILL_MOBILE_POLISH === "v1";
  const formFidelityEnabled =
    process.env.NEXT_PUBLIC_QUICKFILL_FORM_FIDELITY === "v1";
  const combPreexistingEnabled =
    process.env.NEXT_PUBLIC_QUICKFILL_COMB_PREEXISTING === "v1";
  const result: {
    name: string;
    type: "text" | "checkbox";
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    value: string;
    checked?: boolean;
    valueSource?: "text" | "choice" | "none";
    kind?: "radio" | "choice";
    options?: string[];
    currentSelection?: string;
    multiselect?: boolean;
    multiline?: true;
    combed?: true;
    maxLength?: number;
  }[] = [];

  for (const field of fields) {
    const widgets = field.acroField.getWidgets();
    const choiceKind =
      field instanceof PDFRadioGroup
        ? "radio"
        : field instanceof PDFDropdown || field instanceof PDFOptionList
          ? "choice"
          : null;

    if (mobilePolishEnabled && choiceKind) {
      const widget = widgets[0];
      if (!widget) continue;

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

      let currentSelection = "";
      try {
        currentSelection =
          field instanceof PDFRadioGroup
            ? form.getRadioGroup(field.getName()).getSelected() ?? ""
            : field instanceof PDFDropdown
              ? form.getDropdown(field.getName()).getSelected().join(", ")
              : form.getOptionList(field.getName()).getSelected().join(", ");
      } catch {
        // An unreadable selection still produces a usable empty choice card.
      }

      let multiselect = false;
      try {
        multiselect =
          field instanceof PDFDropdown || field instanceof PDFOptionList
            ? field.isMultiselect()
            : false;
      } catch {
        // Default to the supported single-select UI.
      }
      const options =
        field instanceof PDFRadioGroup
          ? field.getOptions()
          : field instanceof PDFDropdown
            ? field.getOptions()
            : field instanceof PDFOptionList
              ? field.getOptions()
              : [];

      const page = pdfDoc.getPages()[pageIndex];
      result.push({
        name: field.getName(),
        type: "text",
        x: rect.x,
        y: page.getHeight() - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
        page: pageIndex,
        value: currentSelection,
        ...(downloadPreserveEnabled
          ? { checked: false, valueSource: "choice" as const }
          : {}),
        kind: choiceKind,
        options,
        currentSelection,
        ...(multiselect ? { multiselect: true } : {}),
      });
      continue;
    }

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

      const page = pdfDoc.getPages()[pageIndex];
      const pageHeight = page.getHeight();

      const fieldType = field.constructor.name;
      let type: "text" | "checkbox" = "text";
      let value = "";
      let checked = false;
      let valueSource: "text" | "choice" | "none" = "none";
      let multiline = false;
      let combed = false;
      let maxLength: number | undefined;

      if (
        (formFidelityEnabled || combPreexistingEnabled) &&
        field instanceof PDFTextField
      ) {
        try {
          multiline = form.getTextField(field.getName()).isMultiline();
        } catch {
          // Unreadable field metadata keeps the existing single-line editor.
        }
      }

      if (
        combPreexistingEnabled &&
        !multiline &&
        field instanceof PDFTextField
      ) {
        try {
          const textField = form.getTextField(field.getName());
          const declaredMaxLength = textField.getMaxLength();
          if (
            textField.isCombed() &&
            declaredMaxLength !== undefined &&
            declaredMaxLength >= 2
          ) {
            combed = true;
            maxLength = declaredMaxLength;
          }
        } catch {
          // Unreadable comb metadata leaves the field as declared text.
        }
      }

      if (combPreexistingEnabled && field instanceof PDFTextField) {
        type = "text";
        try {
          value = form.getTextField(field.getName()).getText() ?? "";
        } catch {
          // An unreadable value keeps the existing empty text fallback.
        }
      }

      if (combPreexistingEnabled && choiceKind) {
        valueSource = "choice";
      }

      if (downloadPreserveEnabled) {
        if (field instanceof PDFCheckBox) {
          type = "checkbox";
          try {
            checked = form.getCheckBox(field.getName()).isChecked();
          } catch {
            /* unchecked */
          }
        } else if (field instanceof PDFTextField) {
          type = "text";
          valueSource = "text";
          try {
            const tf = form.getTextField(field.getName());
            value = tf.getText() ?? "";
          } catch {
            /* empty */
          }
        } else if (field instanceof PDFDropdown) {
          valueSource = "choice";
          try {
            value = form.getDropdown(field.getName()).getSelected().join(", ");
          } catch {
            /* empty */
          }
        } else if (field instanceof PDFRadioGroup) {
          valueSource = "choice";
          try {
            value = form.getRadioGroup(field.getName()).getSelected() ?? "";
          } catch {
            /* empty */
          }
        } else if (field instanceof PDFOptionList) {
          valueSource = "choice";
          try {
            value = form.getOptionList(field.getName()).getSelected().join(", ");
          } catch {
            /* empty */
          }
        }
      } else if (fieldType === "PDFCheckBox") {
        type = "checkbox";
      } else if (fieldType === "PDFTextField") {
        type = "text";
        try {
          const tf = form.getTextField(field.getName());
          value = tf.getText() ?? "";
        } catch {
          /* empty */
        }
      }

      result.push({
        name: field.getName(),
        type,
        x: rect.x,
        y: pageHeight - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
        page: pageIndex,
        value,
        ...(downloadPreserveEnabled
          ? { checked, valueSource }
          : combPreexistingEnabled && valueSource === "choice"
            ? { valueSource }
            : {}),
        ...(multiline ? { multiline: true as const } : {}),
        ...(combed ? { combed: true as const, maxLength } : {}),
      });
    }
  }

  return result;
}

/**
 * Fill a PDF with user-placed fields and return the modified PDF bytes.
 * If addWatermark is true, adds a small footer watermark to each page.
 */
export async function fillPdf(
  originalPdfBytes: ArrayBuffer,
  editorFields: EditorField[],
  pageScales: Map<number, number>,
  hasAcroForm: boolean,
  addWatermark = false
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes, {
    ignoreEncryption: true,
  });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const signatureFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const watermarkFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const orderedFields = orderFieldsForPdfDraw(editorFields);

  if (hasAcroForm) {
    const form = pdfDoc.getForm();

    // Sanitize ALL existing field values so WinAnsi never sees control chars
    for (const af of form.getFields()) {
      if (af.constructor.name === "PDFTextField") {
        try {
          const tf = form.getTextField(af.getName());
          const existing = tf.getText() ?? "";
          if (existing) tf.setText(sanitize(existing));
        } catch { /* skip */ }
      }
    }

    // Set user-filled values (also sanitized). Ordered draw keeps whiteout behind overlays.
    for (const field of orderedFields) {
      try {
        if (field.type === "whiteout") {
          await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
        } else if (field.type === "signature" && field.signatureDataUrl) {
          await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
        } else if (field.type === "text" || field.type === "date" || field.type === "signature") {
          try {
            const tf = form.getTextField(field.id);
            tf.setText(sanitize(field.value ?? ""));
          } catch {
            await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
          }
        } else if (field.type === "checkbox") {
          try {
            const cb = form.getCheckBox(field.id);
            if (field.checked) cb.check();
            else cb.uncheck();
          } catch {
            await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
          }
        } else {
          await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
        }
      } catch {
        await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
      }
    }

    // Try to flatten the form - if it fails (e.g., fields without valid /AP/N appearance dicts),
    // fall back to making fields read-only
    try {
      form.flatten();
    } catch (flattenErr) {
      console.warn("form.flatten() failed, making fields read-only:", flattenErr);
      // Layer 2: Set all remaining fields to read-only to prevent tampering
      for (const field of form.getFields()) {
        try {
          field.enableReadOnly();
        } catch {
          // Skip fields that cannot be made read-only
        }
      }
    }

    // Layer 3: Remove AcroForm dictionary entirely to make PDF completely static
    // This prevents any form interaction even if read-only fails
    try {
      pdfDoc.catalog.delete(PDFName.of("AcroForm"));
    } catch {
      // AcroForm removal not critical - read-only fields are still protected
    }
  } else {
    for (const field of orderedFields) {
      await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
    }
  }

  if (addWatermark) {
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

  return pdfDoc.save();
}

/** Decode a base64 data URL to raw bytes */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return new Uint8Array(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function drawFieldOnPage(
  pdfDoc: PDFDocument,
  field: EditorField,
  _pageScales: Map<number, number>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  signatureFont: Awaited<ReturnType<PDFDocument["embedFont"]>>
) {
  const page = pdfDoc.getPages()[field.page];
  if (!page) return;

  // Field coordinates are now stored in PDF point space directly
  // No scaling needed - just flip Y axis (PDF origin is bottom-left)
  const pdfX = field.x;
  const pdfY = page.getHeight() - field.y - field.height;
  const pdfW = field.width;
  const pdfH = field.height;

  if (field.type === "whiteout") {
    page.drawRectangle({
      x: pdfX,
      y: pdfY,
      width: pdfW,
      height: pdfH,
      color: parsePdfColor(field.fillColor),
      borderWidth: 0,
    });
  } else if (field.type === "signature" && field.signatureDataUrl) {
    try {
      const imgBytes = dataUrlToBytes(field.signatureDataUrl);
      if (imgBytes.length === 0) throw new Error("Empty signature data");
      const isJpeg = field.signatureDataUrl.startsWith("data:image/jpeg") || field.signatureDataUrl.startsWith("data:image/jpg");
      const img = isJpeg ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
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
      if (field.value) {
        page.drawText(sanitize(field.value), {
          x: pdfX + 2,
          y: pdfY + 4,
          size: field.fontSize ?? 16,
          font: signatureFont,
          color: rgb(0, 0, 0),
        });
      }
    }
  } else if (field.type === "text" || field.type === "date" || field.type === "signature") {
    if (field.value) {
      const fontSize = field.type === "signature" ? 16 : field.fontSize ?? 14;
      const activeFont = field.type === "signature" ? signatureFont : font;
      page.drawText(sanitize(field.value), {
        x: pdfX + 2,
        y: pdfY + pdfH - fontSize - 2,
        size: fontSize,
        font: activeFont,
        color: rgb(0, 0, 0),
      });
    }
  } else if (field.type === "checkbox") {
    const stamp = field.stamp ?? (field.checked ? "tick" : "none");
    const cx = pdfX + pdfW / 2;
    const cy = pdfY + pdfH / 2;
    const r = Math.min(pdfW, pdfH) * 0.35;
    const lw = Math.max(1, r * 0.18);
    const strokeColor = hexToRgbPdf(field.color ?? "#121726");

    if (stamp === "none") {
      page.drawRectangle({
        x: pdfX,
        y: pdfY,
        width: pdfW,
        height: pdfH,
        borderColor: strokeColor,
        borderWidth: lw,
      });
    } else if (field.checked && stamp === "tick") {
      page.drawLine({ start: { x: cx - r * 0.55, y: cy - r * 0.05 }, end: { x: cx - r * 0.1, y: cy - r * 0.5 }, thickness: lw, color: strokeColor });
      page.drawLine({ start: { x: cx - r * 0.1, y: cy - r * 0.5 }, end: { x: cx + r * 0.6, y: cy + r * 0.5 }, thickness: lw, color: strokeColor });
    } else if (field.checked && stamp === "cross") {
      page.drawLine({ start: { x: cx - r * 0.6, y: cy - r * 0.6 }, end: { x: cx + r * 0.6, y: cy + r * 0.6 }, thickness: lw, color: strokeColor });
      page.drawLine({ start: { x: cx + r * 0.6, y: cy - r * 0.6 }, end: { x: cx - r * 0.6, y: cy + r * 0.6 }, thickness: lw, color: strokeColor });
    }
  } else if (field.type === "line") {
    const lineField = field as import("./types").LineField;
    const lineColor = hexToRgbPdf(lineField.color ?? "#000000");
    const lw = lineField.strokeWidth ?? 1;
    if (lineField.orientation === "horizontal") {
      page.drawLine({
        start: { x: pdfX, y: pdfY + pdfH / 2 },
        end: { x: pdfX + pdfW, y: pdfY + pdfH / 2 },
        thickness: lw,
        color: lineColor,
      });
    } else {
      // Vertical line: draw from top to bottom of the field
      // pdfY is the top of the field in PDF space, pdfY + pdfH is the bottom
      page.drawLine({
        start: { x: pdfX + pdfW / 2, y: pdfY + pdfH },
        end: { x: pdfX + pdfW / 2, y: pdfY },
        thickness: lw,
        color: lineColor,
      });
    }
  } else if (field.type === "comb") {
    // Box Field (comb): render each character in its own cell
    const combField = field as import("./types").CombField;
    const charCount = combField.charCount ?? 9;
    const slotWidth = combField.cellWidth ?? (pdfW / charCount);
    const fontSize = pdfH * 0.6;
    const value = combField.value || "";
    // Coordinates are already in PDF points - no scaling needed
    const offsetX = combField.offsetX ?? 0;
    const offsetY =
      process.env.NEXT_PUBLIC_QUICKFILL_FORM_FIDELITY === "v1"
        ? combField.offsetY ?? 0
        : 0;
    const charOffsetX = combField.charOffsetX ?? 0;
    // Non-uniform cell positions (for fields with gaps like DD/MM/YYYY)
    const cellPositions = combField.cellPositions;
    const cellWidthsArr = combField.cellWidths;

    for (let i = 0; i < charCount; i++) {
      const char = value[i] || "";
      if (char && char !== " ") {
        // Use detected cell positions if available, otherwise uniform spacing
        const hasCellPosition = cellPositions && cellPositions[i] !== undefined;
        const hasCellWidth = cellWidthsArr && cellWidthsArr[i] !== undefined;
        const thisCellWidth = hasCellWidth ? cellWidthsArr[i] : slotWidth;
        const cellCenterX = hasCellPosition
          ? cellPositions[i]
          : i * slotWidth + slotWidth * 0.5;

        // Center character in cell
        const charX = pdfX + offsetX + cellCenterX + charOffsetX - fontSize * 0.25;
        const charY =
          pdfY +
          pdfH -
          fontSize -
          (pdfH - fontSize) / 2 +
          offsetY;
        page.drawText(sanitize(char), {
          x: charX,
          y: charY,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }
    }
  }
}
