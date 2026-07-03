/**
 * Photo cleanup for uploaded images (PR #79, crop added in PR #81).
 *
 * Runs BEFORE imageToPdfBytes so the cleaned image is baked into the PDF
 * page bytes. No new persistence state, no export changes, no restore changes.
 *
 * - EXIF orientation is corrected at decode time.
 * - Rotation is in 90-degree steps (0..3 clockwise quarter turns).
 * - Crop is a normalized 0..1 rectangle relative to the rotated frame and is
 *   applied before document mode so background pixels never pollute the
 *   contrast histogram.
 * - Document mode converts to grayscale and stretches contrast so photos
 *   of paper forms look like scanned documents.
 * - Very large photos are downscaled to protect mobile memory and PDF size.
 */

/** Longest output edge in pixels. Keeps documents readable and memory safe. */
export const MAX_CLEANUP_EDGE_PX = 2200;

/** JPEG encode quality for cleaned output. */
export const CLEANUP_JPEG_QUALITY = 0.92;

/** Normalized crop rectangle, all values 0..1, relative to the rotated frame. */
export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** A crop rectangle covering the whole frame (crop is a no-op). */
export const FULL_FRAME_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

/** Minimum crop size per axis, as a fraction of the frame. */
export const MIN_CROP_FRACTION = 0.1;

export type ImageCleanupOptions = {
  /** Clockwise quarter turns: 0, 1, 2, or 3. */
  rotateQuarterTurns: number;
  /** Grayscale + contrast cleanup that makes photos look like scans. */
  documentMode: boolean;
  /** Normalized 0..1 crop relative to the rotated frame. Omitted = full frame. */
  cropRect?: CropRect;
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

/** True when the crop covers (effectively) the whole frame. */
export function isFullFrameCrop(crop?: CropRect): boolean {
  if (!crop) return true;
  const eps = 0.001;
  return (
    Math.abs(crop.x) < eps &&
    Math.abs(crop.y) < eps &&
    Math.abs(crop.width - 1) < eps &&
    Math.abs(crop.height - 1) < eps
  );
}

/** Clamp a crop rect into bounds and enforce the minimum size per axis. */
export function clampCropRect(crop: CropRect, minFraction: number = MIN_CROP_FRACTION): CropRect {
  const width = Math.min(1, Math.max(minFraction, crop.width));
  const height = Math.min(1, Math.max(minFraction, crop.height));
  const x = Math.min(1 - width, Math.max(0, crop.x));
  const y = Math.min(1 - height, Math.max(0, crop.y));
  return { x, y, width, height };
}

/** Pixel-space region of a normalized crop within a frame, clamped to bounds. */
export function cropRectToPixels(crop: CropRect, frameWidth: number, frameHeight: number) {
  const x = Math.min(frameWidth - 1, Math.max(0, Math.round(crop.x * frameWidth)));
  const y = Math.min(frameHeight - 1, Math.max(0, Math.round(crop.y * frameHeight)));
  const width = Math.max(1, Math.min(frameWidth - x, Math.round(crop.width * frameWidth)));
  const height = Math.max(1, Math.min(frameHeight - y, Math.round(crop.height * frameHeight)));
  return { x, y, width, height };
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

/** Pixel-space histogram sample region for document mode. */
export type DocumentModeLayout = {
  width: number;
  height: number;
  region: { x: number; y: number; width: number; height: number };
};

/**
 * Document mode, in place on RGBA pixel data:
 * grayscale by luminance, then a contrast stretch anchored on the 5th/95th
 * luminance percentiles so paper turns white and ink turns dark.
 *
 * When `layout` is given, the histogram is sampled only from `layout.region`
 * (used by the preview so its contrast matches the final cropped export),
 * but the stretch is still applied to every pixel.
 */
export function applyDocumentModeToPixels(data: Uint8ClampedArray, layout?: DocumentModeLayout): void {
  const pixelCount = data.length / 4;
  if (pixelCount === 0) return;

  // Luminance histogram
  const histogram = new Uint32Array(256);
  let sampleCount = 0;
  if (layout && layout.region.width > 0 && layout.region.height > 0) {
    const startX = Math.max(0, layout.region.x);
    const startY = Math.max(0, layout.region.y);
    const endX = Math.min(layout.width, layout.region.x + layout.region.width);
    const endY = Math.min(layout.height, layout.region.y + layout.region.height);
    for (let y = startY; y < endY; y += 1) {
      let i = (y * layout.width + startX) * 4;
      for (let x = startX; x < endX; x += 1, i += 4) {
        const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        histogram[lum] += 1;
        sampleCount += 1;
      }
    }
  }
  if (sampleCount === 0) {
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histogram[lum] += 1;
    }
    sampleCount = pixelCount;
  }

  // 5th / 95th percentile black and white points
  const lowTarget = sampleCount * 0.05;
  const highTarget = sampleCount * 0.95;
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
  canvas?: HTMLCanvasElement,
  applyCrop: boolean = true
): HTMLCanvasElement {
  const turns = normalizeQuarterTurns(options.rotateQuarterTurns);
  const scaled = downscaleDimensions(decoded.width, decoded.height, maxEdge);
  const frameDims = rotatedDimensions(scaled.width, scaled.height, turns);
  const crop = clampCropRect(options.cropRect ?? FULL_FRAME_CROP);
  const fullFrame = isFullFrameCrop(crop);
  const cropPx = cropRectToPixels(crop, frameDims.width, frameDims.height);
  const cropping = applyCrop && !fullFrame;
  const outDims = cropping ? { width: cropPx.width, height: cropPx.height } : frameDims;

  const target = canvas ?? document.createElement("canvas");
  target.width = outDims.width;
  target.height = outDims.height;
  const ctx = target.getContext("2d");
  if (!ctx) throw new ImageCleanupError("This photo could not be processed in this browser.");

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outDims.width, outDims.height);
  if (cropping) ctx.translate(-cropPx.x, -cropPx.y);
  ctx.translate(frameDims.width / 2, frameDims.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(decoded.source, -scaled.width / 2, -scaled.height / 2, scaled.width, scaled.height);
  ctx.restore();

  if (options.documentMode) {
    try {
      const imageData = ctx.getImageData(0, 0, outDims.width, outDims.height);
      if (cropping || fullFrame) {
        // Export path: the canvas already contains only the cropped region,
        // so the histogram naturally samples cropped pixels only.
        applyDocumentModeToPixels(imageData.data);
      } else {
        // Preview path: the full frame stays visible under the crop overlay,
        // but the histogram samples the crop region so the preview contrast
        // matches what the final cropped export will look like.
        applyDocumentModeToPixels(imageData.data, {
          width: outDims.width,
          height: outDims.height,
          region: cropPx,
        });
      }
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // Pixel access can fail in constrained environments; keep the rotated image.
    }
  }

  return target;
}

/**
 * Render a live preview of the cleanup result into an existing canvas.
 * The crop is NOT baked into the preview pixels: the full rotated frame is
 * drawn so the crop overlay can show what will be trimmed. Document mode
 * samples its histogram from the crop region so contrast still matches the
 * final export.
 */
export async function renderCleanupPreview(
  file: Blob,
  options: ImageCleanupOptions,
  canvas: HTMLCanvasElement,
  maxEdge = 900
): Promise<void> {
  const decoded = await decodeImage(file);
  try {
    renderToCanvas(decoded, options, maxEdge, canvas, false);
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
