import {
  MEDIA_MAX_ENCODED_SOURCE_BYTES,
  MEDIA_MAX_SANITIZED_EDGE_PX,
  MEDIA_MAX_SANITIZED_PIXELS,
  MEDIA_PROCESSING_DEADLINE_MS,
  MEDIA_SANITIZED_JPEG_QUALITY,
} from "./media-limits";
import {
  MediaInspectionError,
  inspectRasterBytes,
  inspectSanitizedRasterBytes,
  rasterBytesForLocalDecode,
  stripSanitizedRasterMetadata,
  type ExifOrientation,
  type RasterFormat,
  type RasterInspection,
  type RasterMimeType,
} from "./media-inspection";

export type MediaSanitizationErrorCode =
  | "aborted"
  | "timed-out"
  | "stale-generation"
  | "source-type-mismatch"
  | "decode-unavailable"
  | "decode-failed"
  | "decoded-dimensions-mismatch"
  | "canvas-unavailable"
  | "encode-failed"
  | "output-invalid"
  | "coordinator-disposed";

export class MediaSanitizationError extends Error {
  readonly code: MediaSanitizationErrorCode;

  constructor(code: MediaSanitizationErrorCode, message: string) {
    super(message);
    this.name = "MediaSanitizationError";
    this.code = code;
  }
}

export interface SanitizedRaster {
  readonly bytes: Uint8Array;
  readonly blob: Blob;
  readonly format: "jpeg" | "png";
  readonly mimeType: "image/jpeg" | "image/png";
  readonly width: number;
  readonly height: number;
  readonly sourceFormat: RasterFormat;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

export interface SanitizeRasterOptions {
  readonly signal?: AbortSignal;
  /** Internal latest-wins guard used by RasterSanitizationCoordinator. */
  readonly isCurrentGeneration?: () => boolean;
}

export interface SanitizedDimensions {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export type CanvasTransform = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
];

type ActiveGeneration = {
  generation: number;
  controller: AbortController;
};

function sanitizationFailure(
  code: MediaSanitizationErrorCode,
  message: string,
): MediaSanitizationError {
  return new MediaSanitizationError(code, message);
}

function abortFailureFromSignal(signal: AbortSignal): MediaSanitizationError {
  const reason = signal.reason;
  if (reason instanceof MediaSanitizationError) return reason;
  return sanitizationFailure("aborted", "Raster processing was cancelled");
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function blobFromBytes(bytes: Uint8Array, type: RasterMimeType): Blob {
  return new Blob([ownedArrayBuffer(bytes)], { type });
}

class SanitizationGuard {
  private readonly startedAt = Date.now();
  private readonly internalController = new AbortController();
  private readonly externalSignal?: AbortSignal;
  private readonly isCurrentGeneration?: () => boolean;
  private readonly onExternalAbort: () => void;
  private deadlineTimer: ReturnType<typeof setTimeout> | null;
  private failure: MediaSanitizationError | null = null;

  constructor(options: SanitizeRasterOptions) {
    this.externalSignal = options.signal;
    this.isCurrentGeneration = options.isCurrentGeneration;
    this.onExternalAbort = () => {
      if (this.externalSignal) this.abort(abortFailureFromSignal(this.externalSignal));
    };
    this.deadlineTimer = setTimeout(() => {
      this.abort(sanitizationFailure("timed-out", "Raster processing exceeded 15 seconds"));
    }, MEDIA_PROCESSING_DEADLINE_MS);

    if (this.externalSignal?.aborted) {
      this.onExternalAbort();
    } else {
      this.externalSignal?.addEventListener("abort", this.onExternalAbort, { once: true });
    }
  }

  private abort(error: MediaSanitizationError): void {
    if (this.failure) return;
    this.failure = error;
    this.internalController.abort(error);
  }

  checkpoint(): void {
    if (this.failure) throw this.failure;
    if (this.isCurrentGeneration && !this.isCurrentGeneration()) {
      this.abort(
        sanitizationFailure(
          "stale-generation",
          "A newer raster processing generation replaced this result",
        ),
      );
      throw this.failure;
    }
    if (Date.now() - this.startedAt >= MEDIA_PROCESSING_DEADLINE_MS) {
      this.abort(sanitizationFailure("timed-out", "Raster processing exceeded 15 seconds"));
      throw this.failure;
    }
  }

  waitFor<T>(
    promise: PromiseLike<T>,
    cleanupLateValue?: (value: T) => void,
  ): Promise<T> {
    this.checkpoint();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const signal = this.internalController.signal;
      const cleanup = () => signal.removeEventListener("abort", onAbort);
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(this.failure ?? sanitizationFailure("aborted", "Raster processing was cancelled"));
      };
      signal.addEventListener("abort", onAbort, { once: true });

      Promise.resolve(promise).then(
        (value) => {
          if (settled) {
            cleanupLateValue?.(value);
            return;
          }
          try {
            this.checkpoint();
          } catch (error) {
            settled = true;
            cleanup();
            cleanupLateValue?.(value);
            reject(error);
            return;
          }
          settled = true;
          cleanup();
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        },
      );
    });
  }

  close(): void {
    if (this.deadlineTimer !== null) {
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = null;
    }
    this.externalSignal?.removeEventListener("abort", this.onExternalAbort);
  }
}

export function sanitizedRasterDimensions(
  width: number,
  height: number,
): Readonly<SanitizedDimensions> {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError("Raster dimensions must be positive safe integers");
  }
  const edgeScale = MEDIA_MAX_SANITIZED_EDGE_PX / Math.max(width, height);
  const pixelScale = Math.sqrt(MEDIA_MAX_SANITIZED_PIXELS / (width * height));
  const scale = Math.min(1, edgeScale, pixelScale);
  let sanitizedWidth = Math.max(1, Math.floor(width * scale));
  let sanitizedHeight = Math.max(1, Math.floor(height * scale));

  while (
    sanitizedWidth > MEDIA_MAX_SANITIZED_EDGE_PX ||
    sanitizedHeight > MEDIA_MAX_SANITIZED_EDGE_PX ||
    sanitizedWidth * sanitizedHeight > MEDIA_MAX_SANITIZED_PIXELS
  ) {
    if (sanitizedWidth >= sanitizedHeight && sanitizedWidth > 1) sanitizedWidth -= 1;
    else if (sanitizedHeight > 1) sanitizedHeight -= 1;
    else break;
  }

  return Object.freeze({
    width: sanitizedWidth,
    height: sanitizedHeight,
    scale: Math.min(sanitizedWidth / width, sanitizedHeight / height),
  });
}

export function exifOrientationTransform(
  orientation: ExifOrientation,
  width: number,
  height: number,
): CanvasTransform {
  switch (orientation) {
    case 1:
      return Object.freeze([1, 0, 0, 1, 0, 0]);
    case 2:
      return Object.freeze([-1, 0, 0, 1, width, 0]);
    case 3:
      return Object.freeze([-1, 0, 0, -1, width, height]);
    case 4:
      return Object.freeze([1, 0, 0, -1, 0, height]);
    case 5:
      return Object.freeze([0, 1, 1, 0, 0, 0]);
    case 6:
      return Object.freeze([0, 1, -1, 0, height, 0]);
    case 7:
      return Object.freeze([0, -1, -1, 0, height, width]);
    case 8:
      return Object.freeze([0, -1, 1, 0, 0, width]);
  }
}

function expectedFormatForFileName(name: string): RasterFormat | null | "unsupported" {
  const finalSlash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  const baseName = name.slice(finalSlash + 1);
  const dot = baseName.lastIndexOf(".");
  if (dot < 0) return null;
  const extension = baseName.slice(dot + 1).toLowerCase();
  if (extension === "jpg" || extension === "jpeg" || extension === "jfif") return "jpeg";
  if (extension === "png") return "png";
  if (extension === "webp") return "webp";
  return "unsupported";
}

function validateDeclaredIdentity(source: Blob, inspection: RasterInspection): void {
  const declaredType = source.type.trim().toLowerCase();
  if (declaredType !== "" && declaredType !== inspection.mimeType) {
    throw sanitizationFailure(
      "source-type-mismatch",
      "Declared raster MIME type does not match its bytes",
    );
  }

  const possibleFile = source as Blob & { readonly name?: unknown };
  if (typeof possibleFile.name === "string" && possibleFile.name !== "") {
    const expectedFormat = expectedFormatForFileName(possibleFile.name);
    if (expectedFormat === "unsupported" || (expectedFormat && expectedFormat !== inspection.format)) {
      throw sanitizationFailure(
        "source-type-mismatch",
        "Declared raster file extension does not match its bytes",
      );
    }
  }
}

function drawDecodedRaster(
  context: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  inspection: RasterInspection,
  outputWidth: number,
  outputHeight: number,
): void {
  if (!inspection.hasAlpha) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, outputWidth, outputHeight);
  }

  const orientation = exifOrientationTransform(
    inspection.orientation,
    inspection.width,
    inspection.height,
  );
  const scaleX = outputWidth / inspection.orientedWidth;
  const scaleY = outputHeight / inspection.orientedHeight;
  context.setTransform(
    scaleX * orientation[0],
    scaleY * orientation[1],
    scaleX * orientation[2],
    scaleY * orientation[3],
    scaleX * orientation[4],
    scaleY * orientation[5],
  );
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, inspection.width, inspection.height);
  context.setTransform(1, 0, 0, 1, 0, 0);
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  mimeType: "image/jpeg" | "image/png",
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(sanitizationFailure("encode-failed", "Canvas encoding is unavailable"));
      return;
    }
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(sanitizationFailure("encode-failed", "Canvas encoding returned no data"));
        },
        mimeType,
        mimeType === "image/jpeg" ? MEDIA_SANITIZED_JPEG_QUALITY : undefined,
      );
    } catch {
      reject(sanitizationFailure("encode-failed", "Canvas encoding failed"));
    }
  });
}

function verifySanitizedOutput(
  bytes: Uint8Array,
  expectedFormat: "jpeg" | "png",
  expectedWidth: number,
  expectedHeight: number,
): RasterInspection {
  let inspection: RasterInspection;
  try {
    inspection = inspectSanitizedRasterBytes(bytes);
  } catch (error) {
    if (error instanceof MediaInspectionError) {
      throw sanitizationFailure("output-invalid", "Sanitized raster output is structurally invalid");
    }
    throw error;
  }
  if (
    inspection.format !== expectedFormat ||
    inspection.width !== expectedWidth ||
    inspection.height !== expectedHeight ||
    inspection.orientation !== 1 ||
    inspection.hasMetadata ||
    inspection.animated
  ) {
    throw sanitizationFailure(
      "output-invalid",
      "Sanitized raster output failed its format or metadata checks",
    );
  }
  if (expectedFormat === "png" && !inspection.hasAlpha) {
    throw sanitizationFailure("output-invalid", "Sanitized PNG did not preserve an alpha channel");
  }
  return inspection;
}

export async function sanitizeRasterImage(
  source: Blob,
  options: SanitizeRasterOptions = {},
): Promise<Readonly<SanitizedRaster>> {
  if (!(source instanceof Blob)) throw new TypeError("Raster source must be a Blob or File");
  if (source.size === 0) {
    throw new MediaInspectionError("empty-source", "Raster source is empty");
  }
  if (source.size > MEDIA_MAX_ENCODED_SOURCE_BYTES) {
    throw new MediaInspectionError(
      "source-too-large",
      "Raster source exceeds the encoded byte limit",
    );
  }

  const guard = new SanitizationGuard(options);
  let bitmap: ImageBitmap | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    guard.checkpoint();
    if (typeof source.arrayBuffer !== "function") {
      throw sanitizationFailure("decode-unavailable", "Blob byte access is unavailable");
    }
    const sourceBuffer = await guard.waitFor(source.arrayBuffer());
    const sourceBytes = new Uint8Array(sourceBuffer);
    const inspection = inspectRasterBytes(sourceBytes);
    validateDeclaredIdentity(source, inspection);
    guard.checkpoint();

    const decodeBytes = rasterBytesForLocalDecode(sourceBytes);
    const decodeBlob = blobFromBytes(decodeBytes, inspection.mimeType);
    const decode = globalThis.createImageBitmap;
    if (typeof decode !== "function") {
      throw sanitizationFailure(
        "decode-unavailable",
        "Local bitmap decoding is unavailable in this browser",
      );
    }

    let decodePromise: Promise<ImageBitmap>;
    try {
      decodePromise = decode(decodeBlob, { imageOrientation: "from-image" });
    } catch {
      throw sanitizationFailure("decode-failed", "Raster decoding could not start");
    }
    try {
      bitmap = await guard.waitFor(decodePromise, (lateBitmap) => lateBitmap.close());
    } catch (error) {
      if (error instanceof MediaSanitizationError) throw error;
      throw sanitizationFailure("decode-failed", "Raster decoding failed");
    }
    if (bitmap.width !== inspection.width || bitmap.height !== inspection.height) {
      throw sanitizationFailure(
        "decoded-dimensions-mismatch",
        "Decoded raster dimensions do not match the inspected source",
      );
    }
    guard.checkpoint();

    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      throw sanitizationFailure("canvas-unavailable", "Local canvas processing is unavailable");
    }
    canvas = document.createElement("canvas");
    const dimensions = sanitizedRasterDimensions(
      inspection.orientedWidth,
      inspection.orientedHeight,
    );
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { alpha: inspection.hasAlpha });
    if (!context) {
      throw sanitizationFailure("canvas-unavailable", "Local 2D canvas processing is unavailable");
    }
    try {
      drawDecodedRaster(
        context,
        bitmap,
        inspection,
        dimensions.width,
        dimensions.height,
      );
    } catch {
      throw sanitizationFailure("decode-failed", "Decoded raster pixels could not be rendered");
    }
    guard.checkpoint();

    const outputFormat = inspection.hasAlpha ? "png" : "jpeg";
    const outputMimeType = outputFormat === "png" ? "image/png" : "image/jpeg";
    const encodedBlob = await guard.waitFor(encodeCanvas(canvas, outputMimeType));
    if (encodedBlob.type && encodedBlob.type.toLowerCase() !== outputMimeType) {
      throw sanitizationFailure("output-invalid", "Canvas returned an unexpected output format");
    }
    const encodedBuffer = await guard.waitFor(encodedBlob.arrayBuffer());
    guard.checkpoint();

    let strippedBytes: Uint8Array;
    try {
      strippedBytes = stripSanitizedRasterMetadata(new Uint8Array(encodedBuffer));
    } catch (error) {
      if (error instanceof MediaSanitizationError) throw error;
      throw sanitizationFailure("output-invalid", "Encoded raster output could not be sanitized");
    }
    verifySanitizedOutput(
      strippedBytes,
      outputFormat,
      dimensions.width,
      dimensions.height,
    );
    guard.checkpoint();

    return Object.freeze({
      bytes: strippedBytes,
      blob: blobFromBytes(strippedBytes, outputMimeType),
      format: outputFormat,
      mimeType: outputMimeType,
      width: dimensions.width,
      height: dimensions.height,
      sourceFormat: inspection.format,
      sourceWidth: inspection.width,
      sourceHeight: inspection.height,
    });
  } finally {
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    guard.close();
  }
}

/** Latest request wins; replaced generations are cancelled and may never publish. */
export class RasterSanitizationCoordinator {
  private generation = 0;
  private active: ActiveGeneration | null = null;
  private disposed = false;

  async sanitize(
    source: Blob,
    options: Pick<SanitizeRasterOptions, "signal"> = {},
  ): Promise<Readonly<SanitizedRaster>> {
    if (this.disposed) {
      throw sanitizationFailure("coordinator-disposed", "Raster coordinator has been disposed");
    }

    const generation = this.generation + 1;
    this.generation = generation;
    this.active?.controller.abort(
      sanitizationFailure(
        "stale-generation",
        "A newer raster processing generation replaced this result",
      ),
    );

    const controller = new AbortController();
    const active = { generation, controller };
    this.active = active;
    const externalSignal = options.signal;
    const onExternalAbort = () => {
      if (!controller.signal.aborted && externalSignal) {
        controller.abort(abortFailureFromSignal(externalSignal));
      }
    };
    if (externalSignal?.aborted) onExternalAbort();
    else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

    try {
      return await sanitizeRasterImage(source, {
        signal: controller.signal,
        isCurrentGeneration: () =>
          !this.disposed &&
          this.generation === generation &&
          this.active === active,
      });
    } finally {
      externalSignal?.removeEventListener("abort", onExternalAbort);
      if (this.active === active) this.active = null;
    }
  }

  cancel(): void {
    this.generation += 1;
    const active = this.active;
    this.active = null;
    active?.controller.abort(sanitizationFailure("aborted", "Raster processing was cancelled"));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
  }
}
