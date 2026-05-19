const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const EOF_MARKER = [0x25, 0x25, 0x45, 0x4f, 0x46]; // %%EOF
const EOF_SCAN_BYTES = 2048;

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function includesMarker(bytes: Uint8Array, marker: number[], startIndex: number) {
  const lastStart = bytes.length - marker.length;
  for (let index = Math.max(0, startIndex); index <= lastStart; index += 1) {
    if (marker.every((value, markerIndex) => bytes[index + markerIndex] === value)) return true;
  }
  return false;
}

export function isLikelyCompletePdf(bytes: Uint8Array | ArrayBuffer) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < PDF_SIGNATURE.length + EOF_MARKER.length) return false;
  if (!startsWith(data, PDF_SIGNATURE)) return false;

  const eofScanStart = Math.max(0, data.length - EOF_SCAN_BYTES);
  return includesMarker(data, EOF_MARKER, eofScanStart);
}

export function assertValidGeneratedPdf(bytes: Uint8Array | ArrayBuffer) {
  if (!isLikelyCompletePdf(bytes)) {
    throw new Error("Generated PDF failed integrity check");
  }
}

export function sanitizePdfFilename(filename: string | null | undefined, fallback = "quickfill-filled.pdf") {
  const baseName = (filename ?? "").split(/[\\/]/).pop()?.trim() || fallback;
  const safeName = baseName
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  const withName = safeName || fallback;
  return /\.pdf$/i.test(withName) ? withName : `${withName}.pdf`;
}

export function filledPdfFilename(originalName: string | null | undefined) {
  const sanitizedOriginal = sanitizePdfFilename(originalName, "quickfill.pdf");
  return sanitizePdfFilename(`${sanitizedOriginal.replace(/\.pdf$/i, "")}-filled.pdf`);
}

function encodeRfc5987Value(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function asciiFilenameFallback(filename: string) {
  return filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
}

export function buildPdfDownloadHeaders(bytes: Uint8Array | ArrayBuffer, filename: string): HeadersInit {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const safeFilename = sanitizePdfFilename(filename);
  const asciiFilename = asciiFilenameFallback(safeFilename);

  return {
    "Accept-Ranges": "none",
    "Cache-Control": "no-store, max-age=0",
    "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeRfc5987Value(safeFilename)}`,
    "Content-Length": String(data.byteLength),
    "Content-Type": "application/pdf",
    "X-Content-Type-Options": "nosniff",
  };
}
