/**
 * Photo cleanup for uploaded images (PR #79).
 *
 * Runs BEFORE imageToPdfBytes so the cleaned image is baked into the PDF
 * page bytes. No new persistence state, no export changes, no restore changes.
 *
 * - EXIF orientation is corrected at decode time.
 * - Rotation is in 90-degree steps (0..3 clockwise quarter turns).
 * - Document mode converts to grayscale and stretches contrast so photos
 *   of paper forms look like scanned documents.
 * - Very large photos are downscaled to protect mobile memory and PDF size.
 */

/** Longest output edge in pixels. Keeps documents readable and memory safe. */
export const MAX_CLEANUP_EDGE_PX = 2200;

/** JPEG encode quality for cleaned output. */
export const CLEANUP_JPEG_QUALITY = 0.92;

export type ImageCleanupOptions = {
  /** Clockwise quarter turns: 0, 1, 2, or 3. */
  rotateQuarterTurns: number;
  /** Grayscale + contrast cleanup that makes photos look like scans. */
  documentMode: boolean;
};

export class ImageCleanupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageCleanupError";
  }
}

export function normalizeQuarterTurns(turns: number): number {
  return ((Math.round(turns) % 4) + 4) % 4;
}

/** Output dimensions after rotating by quarter turns. */
export function rotatedDimensions(width: number, height: number, quarterTurns: number) {
  return normalizeQuarterTurns(quarterTurns) % 2 === 1
    ? { width: height, height: width }
    : { width, height };
}

/** Scale dimensions so the longest edge is at most maxEdge. Never upscales. */
export function downscaleDimensions(width: number, height: number, maxEdge: number = MAX_CLEANUP_EDGE_PX) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height, scale: 1 };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/**
 * Document mode, in place on RGBA pixel data:
 * grayscale by luminance, then a contrast stretch anchored on the 5th/95th
 * luminance percentiles so paper turns white and ink turns dark.
 */
export function applyDocumentModeToPixels(data: Uint8ClampedArray): void {
  const pixelCount = data.length / 4;
  if (pixelCount === 0) return;

  // Luminance histogram
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[lum] += 1;
  }

  // 5th / 95th percentile black and white points
  const lowTarget = pixelCount * 0.05;
  const highTarget = pixelCount * 0.95;
  let cumulative = 0;
  let blackPoint = 0;
  let whitePoint = 255;
  let blackFound = false;
  for (let value = 0; value < 256; value += 1) {
    cumulative += histogram[value];
    if (!blackFound && cumulative >= lowTarget) {
      blackPoint = value;
      blackFound = true;
    }
    if (cumulative >= highTarget) {
      whitePoint = value;
      break;
    }
  }
  if (whitePoint - blackPoint < 24) {
    // Flat image (already near-uniform): fall back to a gentle fixed stretch.
    blackPoint = Math.max(0, blackPoint - 12);
    whitePoint = Math.min(255, whitePoint + 12);
  }
  const range = Math.max(1, whitePoint - blackPoint);

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const stretched = Math.max(0, Math.min(255, Math.round(((lum - blackPoint) / range) * 255)));
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
    // Alpha untouched
  }
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image decode failed"));
    image.src = url;
  });
}

/** Decode an image blob with EXIF orientation applied when supported. */
async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof window !== "undefined" && typeof window.createImageBitmap === "function") {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await window.createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      try {
        bitmap = await window.createImageBitmap(blob);
      } catch {
        bitmap = null;
      }
    }
    if (bitmap) {
      const b = bitmap;
      return { source: b, width: b.width, height: b.height, close: () => b.close() };
    }
  }

  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new ImageCleanupError("This photo could not be opened. Try a different JPG or PNG.");
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImageElement(objectUrl);
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/**
 * Draw the decoded image to a canvas with downscale + rotation + optional
 * document mode applied. Returns the canvas sized to the final dimensions.
 */
function renderToCanvas(
  decoded: DecodedImage,
  options: ImageCleanupOptions,
  maxEdge: number,
  canvas?: HTMLCanvasElement
): HTMLCanvasElement {
  const turns = normalizeQuarterTurns(options.rotateQuarterTurns);
  const scaled = downscaleDimensions(decoded.width, decoded.height, maxEdge);
  const finalDims = rotatedDimensions(scaled.width, scaled.height, turns);

  const target = canvas ?? document.createElement("canvas");
  target.width = finalDims.width;
  target.height = finalDims.height;
  const ctx = target.getContext("2d");
  if (!ctx) throw new ImageCleanupError("This photo could not be processed in this browser.");

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, finalDims.width, finalDims.height);
  ctx.translate(finalDims.width / 2, finalDims.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(decoded.source, -scaled.width / 2, -scaled.height / 2, scaled.width, scaled.height);
  ctx.restore();

  if (options.documentMode) {
    try {
      const imageData = ctx.getImageData(0, 0, finalDims.width, finalDims.height);
      applyDocumentModeToPixels(imageData.data);
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // Pixel access can fail in constrained environments; keep the rotated image.
    }
  }

  return target;
}

/** Render a live preview of the cleanup result into an existing canvas. */
export async function renderCleanupPreview(
  file: Blob,
  options: ImageCleanupOptions,
  canvas: HTMLCanvasElement,
  maxEdge = 900
): Promise<void> {
  const decoded = await decodeImage(file);
  try {
    renderToCanvas(decoded, options, maxEdge, canvas);
  } finally {
    decoded.close();
  }
}

/**
 * Clean up a photo and return JPEG bytes ready for the existing
 * document-intake / image-to-PDF pipeline.
 */
export async function cleanupImageToJpeg(
  file: Blob,
  options: ImageCleanupOptions,
  maxEdge = MAX_CLEANUP_EDGE_PX
): Promise<Uint8Array> {
  const decoded = await decodeImage(file);
  try {
    const canvas = renderToCanvas(decoded, options, maxEdge);
    const blob = await new Promise<Blob>((resolve, reject) => {
      if (typeof canvas.toBlob !== "function") {
        reject(new ImageCleanupError("This photo could not be processed in this browser."));
        return;
      }
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new ImageCleanupError("This photo could not be processed. Try a different JPG or PNG."));
      }, "image/jpeg", CLEANUP_JPEG_QUALITY);
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    decoded.close();
  }
}

/** Build a cleaned upload File preserving the original base name. */
export async function cleanupPhotoFile(file: File, options: ImageCleanupOptions): Promise<File> {
  const bytes = await cleanupImageToJpeg(file, options);
  const baseName = file.name.replace(/\.(png|jpe?g)$/i, "") || "photo";
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([buffer], `${baseName}.jpg`, { type: "image/jpeg" });
}

/** True when the upload should go through the photo cleanup modal. */
export function isCleanablePhoto(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png")
  );
}
