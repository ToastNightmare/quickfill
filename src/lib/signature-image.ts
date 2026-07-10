const MAX_SOURCE_SIDE = 1800;
const MAX_SIGNATURE_DATA_URL_CHARS = 180_000;

type Rgb = { r: number; g: number; b: number };

// --- Cleanup options ---------------------------------------------------
//
// Photo signature cleanup exposes two user-facing knobs. Both default to 0,
// which reproduces the historical cleanup output exactly, so existing users
// who never touch the sliders see no change.
//
// - backgroundRemoval (0..1): raises a hard alpha cutoff so weak background
//   haze (shadows, grey paper) becomes fully transparent.
// - inkStrength (0..1): boosts alpha for surviving ink so the signature
//   stays strong and readable, especially at high background removal. It
//   never resurrects pixels below the cutoff.

export interface SignatureCleanupOptions {
  backgroundRemoval: number;
  inkStrength: number;
}

export const SIGNATURE_CLEANUP_DEFAULTS: SignatureCleanupOptions = {
  backgroundRemoval: 0,
  inkStrength: 0,
};

/** Maximum strength cutoff at backgroundRemoval = 1. */
const MAX_BACKGROUND_CUTOFF = 0.45;
/** Historical alpha gamma; strength^0.72 protects faint ink. */
const DEFAULT_ALPHA_GAMMA = 0.72;

function clampOption(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(value, 0, 1);
}

/** Normalize possibly-partial/invalid options into safe 0..1 values. */
export function clampCleanupOptions(
  options?: Partial<SignatureCleanupOptions> | null,
): SignatureCleanupOptions {
  return {
    backgroundRemoval: clampOption(
      options?.backgroundRemoval,
      SIGNATURE_CLEANUP_DEFAULTS.backgroundRemoval,
    ),
    inkStrength: clampOption(options?.inkStrength, SIGNATURE_CLEANUP_DEFAULTS.inkStrength),
  };
}

/** True when options differ from the defaults (drives the Reset control). */
export function hasCleanupAdjustments(
  options?: Partial<SignatureCleanupOptions> | null,
): boolean {
  const clamped = clampCleanupOptions(options);
  return (
    clamped.backgroundRemoval !== SIGNATURE_CLEANUP_DEFAULTS.backgroundRemoval ||
    clamped.inkStrength !== SIGNATURE_CLEANUP_DEFAULTS.inkStrength
  );
}

/**
 * Map a per-pixel ink strength (0..1) to an output alpha byte (0..255).
 *
 * With default options this is exactly the historical mapping:
 * round(strength^0.72 * 255).
 *
 * Pure and monotonic in `strength` so it can be unit tested without canvas.
 */
export function cleanupAlpha(
  strength: number,
  options?: Partial<SignatureCleanupOptions> | null,
): number {
  const { backgroundRemoval, inkStrength } = clampCleanupOptions(options);
  const s = clamp(strength, 0, 1);

  const cutoff = backgroundRemoval * MAX_BACKGROUND_CUTOFF;
  if (s <= cutoff) return 0;

  // Re-normalize the surviving range so ink still spans the full ramp.
  const normalized = cutoff > 0 ? (s - cutoff) / (1 - cutoff) : s;

  // Higher ink strength lowers gamma (lifts mid alphas) and adds gain.
  const gamma = DEFAULT_ALPHA_GAMMA * (1 - inkStrength * 0.45);
  const gain = 1 + inkStrength * 0.35;
  const alpha = clamp(Math.pow(normalized, gamma) * gain, 0, 1);

  return Math.round(alpha * 255);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function luminance(r: number, g: number, b: number) {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function colorDistance(a: Rgb, b: Rgb) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function loadImageFromSource(source: File | string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source);
    const image = new Image();

    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image"));
    };
    image.src = objectUrl ?? (source as string);
  });
}

function shrinkPngDataUrl(canvas: HTMLCanvasElement) {
  let current = canvas;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dataUrl = current.toDataURL("image/png");
    if (dataUrl.length <= MAX_SIGNATURE_DATA_URL_CHARS) return dataUrl;

    const next = document.createElement("canvas");
    next.width = Math.max(1, Math.round(current.width * 0.78));
    next.height = Math.max(1, Math.round(current.height * 0.78));
    const nextCtx = next.getContext("2d")!;
    nextCtx.imageSmoothingEnabled = true;
    nextCtx.imageSmoothingQuality = "high";
    nextCtx.drawImage(current, 0, 0, next.width, next.height);
    current = next;
  }

  return current.toDataURL("image/png");
}

function estimatePaperColor(data: Uint8ClampedArray, width: number, height: number): Rgb {
  const border = Math.max(3, Math.round(Math.min(width, height) * 0.06));
  const step = Math.max(2, Math.floor(Math.max(width, height) / 520));
  const samples: Rgb[] = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const nearEdge = x < border || y < border || x >= width - border || y >= height - border;
      if (!nearEdge) continue;

      const index = (y * width + x) * 4;
      if (data[index + 3] <= 20) continue;
      samples.push({ r: data[index], g: data[index + 1], b: data[index + 2] });
    }
  }

  if (samples.length === 0) return { r: 245, g: 245, b: 245 };

  samples.sort((a, b) => luminance(a.r, a.g, a.b) - luminance(b.r, b.g, b.b));
  const brightest = samples.slice(Math.floor(samples.length * 0.55));
  const median = brightest[Math.floor(brightest.length / 2)] ?? samples[Math.floor(samples.length / 2)];
  return median;
}

function getInkStrength(
  data: Uint8ClampedArray,
  index: number,
  paper: Rgb,
  paperLuma: number,
) {
  const alpha = data[index + 3] / 255;
  if (alpha <= 0.08) return 0;

  const pixel = { r: data[index], g: data[index + 1], b: data[index + 2] };
  const luma = luminance(pixel.r, pixel.g, pixel.b);
  const darkness = paperLuma - luma;
  const distance = colorDistance(pixel, paper);

  const darknessStrength = (darkness - 24) / 90;
  const distanceStrength = (distance - 34) / 118;
  const absoluteDarkStrength = (172 - luma) / 120;

  return clamp(Math.max(darknessStrength, distanceStrength, absoluteDarkStrength) * alpha, 0, 1);
}

function findSignatureBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  paper: Rgb,
) {
  const paperLuma = luminance(paper.r, paper.g, paper.b);
  const mask = new Uint8Array(width * height);
  const strengths = new Float32Array(width * height);
  let rawMinX = width;
  let rawMinY = height;
  let rawMaxX = -1;
  let rawMaxY = -1;
  let inkPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const dataIndex = pixelIndex * 4;
      const strength = getInkStrength(data, dataIndex, paper, paperLuma);
      strengths[pixelIndex] = strength;
      if (strength <= 0.2) continue;

      mask[pixelIndex] = 1;
      inkPixels += 1;
      rawMinX = Math.min(rawMinX, x);
      rawMinY = Math.min(rawMinY, y);
      rawMaxX = Math.max(rawMaxX, x);
      rawMaxY = Math.max(rawMaxY, y);
    }
  }

  if (inkPixels < 12 || rawMaxX <= rawMinX || rawMaxY <= rawMinY) {
    throw new Error("Could not find signature");
  }

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const minComponentArea = Math.max(8, Math.min(220, Math.round(inkPixels * 0.004)));
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let keptArea = 0;

  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || visited[i]) continue;

    let area = 0;
    let cMinX = width;
    let cMinY = height;
    let cMaxX = -1;
    let cMaxY = -1;
    visited[i] = 1;
    stack.push(i);

    while (stack.length > 0) {
      const current = stack.pop()!;
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      cMinX = Math.min(cMinX, x);
      cMinY = Math.min(cMinY, y);
      cMaxX = Math.max(cMaxX, x);
      cMaxY = Math.max(cMaxY, y);

      const left = x > 0 ? current - 1 : -1;
      const right = x < width - 1 ? current + 1 : -1;
      const up = y > 0 ? current - width : -1;
      const down = y < height - 1 ? current + width : -1;
      const neighbors = [left, right, up, down];
      for (const next of neighbors) {
        if (next >= 0 && mask[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }

    const componentWidth = cMaxX - cMinX + 1;
    const componentHeight = cMaxY - cMinY + 1;
    const isLineLike = componentWidth >= 5 || componentHeight >= 5;
    if (area >= minComponentArea || (area >= 5 && isLineLike)) {
      keptArea += area;
      minX = Math.min(minX, cMinX);
      minY = Math.min(minY, cMinY);
      maxX = Math.max(maxX, cMaxX);
      maxY = Math.max(maxY, cMaxY);
    }
  }

  if (keptArea < 8 || maxX <= minX || maxY <= minY) {
    minX = rawMinX;
    minY = rawMinY;
    maxX = rawMaxX;
    maxY = rawMaxY;
  }

  return { minX, minY, maxX, maxY, strengths, paperLuma };
}

/**
 * Immutable result of the expensive photo analysis pass.
 *
 * Crop bounds and per-pixel ink strengths are frozen here so slider-driven
 * re-renders are cheap and the preview never jumps while adjusting.
 */
export interface SignaturePhotoAnalysis {
  cropWidth: number;
  cropHeight: number;
  /** Per crop pixel ink strength, 0..1, row-major. */
  strengths: Float32Array;
  /** Per crop pixel RGB output colour (already ink-recoloured), 3 bytes each. */
  colors: Uint8ClampedArray;
}

/**
 * Expensive pass: decode, downscale, estimate paper colour, compute per-pixel
 * ink strength, find crop bounds, and bake the output ink colours.
 * Run once per photo; cache the result and feed it to renderCleanedSignature.
 */
export async function analyzeSignaturePhoto(
  source: File | string,
): Promise<SignaturePhotoAnalysis> {
  const image = await loadImageFromSource(source);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight) {
    throw new Error("Could not read image");
  }

  const sourceScale = Math.min(1, MAX_SOURCE_SIDE / Math.max(imageWidth, imageHeight));
  const width = Math.max(1, Math.round(imageWidth * sourceScale));
  const height = Math.max(1, Math.round(imageHeight * sourceScale));

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true })!;
  sourceCtx.drawImage(image, 0, 0, width, height);

  const imageData = sourceCtx.getImageData(0, 0, width, height);
  const paper = estimatePaperColor(imageData.data, width, height);
  let { minX, minY, maxX, maxY, strengths, paperLuma } = findSignatureBounds(
    imageData.data,
    width,
    height,
    paper,
  );

  const inkWidth = maxX - minX + 1;
  const inkHeight = maxY - minY + 1;
  const padX = Math.max(8, Math.round(inkWidth * 0.06));
  const padY = Math.max(8, Math.round(inkHeight * 0.16));
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(width - 1, maxX + padX);
  maxY = Math.min(height - 1, maxY + padY);

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const cropStrengths = new Float32Array(cropWidth * cropHeight);
  const colors = new Uint8ClampedArray(cropWidth * cropHeight * 3);

  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const sourceX = minX + x;
      const sourceY = minY + y;
      const sourceIndex = sourceY * width + sourceX;
      const dataIndex = sourceIndex * 4;
      const targetIndex = y * cropWidth + x;
      const luma = luminance(
        imageData.data[dataIndex],
        imageData.data[dataIndex + 1],
        imageData.data[dataIndex + 2],
      );
      const strength =
        strengths[sourceIndex] || getInkStrength(imageData.data, dataIndex, paper, paperLuma);

      cropStrengths[targetIndex] = clamp(strength, 0, 1);
      colors[targetIndex * 3] = luma < 105 ? imageData.data[dataIndex] : 13;
      colors[targetIndex * 3 + 1] = luma < 105 ? imageData.data[dataIndex + 1] : 13;
      colors[targetIndex * 3 + 2] = luma < 105 ? imageData.data[dataIndex + 2] : 26;
    }
  }

  return { cropWidth, cropHeight, strengths: cropStrengths, colors };
}

/**
 * Cheap pass: remap cached ink strengths to alpha using the cleanup options
 * and encode the final PNG data URL. Safe to run on every slider change.
 */
export function renderCleanedSignature(
  analysis: SignaturePhotoAnalysis,
  options?: Partial<SignatureCleanupOptions> | null,
): string {
  const { cropWidth, cropHeight, strengths, colors } = analysis;
  const clamped = clampCleanupOptions(options);

  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = cropWidth;
  alphaCanvas.height = cropHeight;
  const alphaCtx = alphaCanvas.getContext("2d")!;
  const output = alphaCtx.createImageData(cropWidth, cropHeight);

  for (let i = 0; i < strengths.length; i += 1) {
    const targetIndex = i * 4;
    output.data[targetIndex] = colors[i * 3];
    output.data[targetIndex + 1] = colors[i * 3 + 1];
    output.data[targetIndex + 2] = colors[i * 3 + 2];
    output.data[targetIndex + 3] = cleanupAlpha(strengths[i], clamped);
  }

  alphaCtx.putImageData(output, 0, 0);

  const targetScale = Math.min(1, 900 / cropWidth, 320 / cropHeight);
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = Math.max(1, Math.round(cropWidth * targetScale));
  finalCanvas.height = Math.max(1, Math.round(cropHeight * targetScale));
  const finalCtx = finalCanvas.getContext("2d")!;
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = "high";
  finalCtx.drawImage(alphaCanvas, 0, 0, finalCanvas.width, finalCanvas.height);

  return shrinkPngDataUrl(finalCanvas);
}

/**
 * One-shot clean: analyze then render. Defaults reproduce the historical
 * output exactly.
 */
export async function cleanSignatureImage(
  source: File | string,
  options?: Partial<SignatureCleanupOptions> | null,
) {
  const analysis = await analyzeSignaturePhoto(source);
  return renderCleanedSignature(analysis, options);
}
