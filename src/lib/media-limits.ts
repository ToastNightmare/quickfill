/** Hard limits for the local Add Media raster pipeline. */
export const MEDIA_MAX_ENCODED_SOURCE_BYTES = 12 * 1024 * 1024;

export const MEDIA_MAX_SOURCE_AXIS_PX = 8_192;

export const MEDIA_MAX_DECODED_PIXELS = 16_000_000;

/** Bounds synchronous container parsing and per-record bookkeeping. */
export const MEDIA_MAX_CONTAINER_RECORDS = 4_096;

export const MEDIA_MAX_SANITIZED_EDGE_PX = 4_096;

export const MEDIA_MAX_SANITIZED_PIXELS = 8_000_000;

export const MEDIA_PROCESSING_DEADLINE_MS = 15_000;

export const MEDIA_SANITIZED_JPEG_QUALITY = 0.92;

export const MEDIA_LIMITS = Object.freeze({
  maxEncodedSourceBytes: MEDIA_MAX_ENCODED_SOURCE_BYTES,
  maxSourceAxisPx: MEDIA_MAX_SOURCE_AXIS_PX,
  maxDecodedPixels: MEDIA_MAX_DECODED_PIXELS,
  maxContainerRecords: MEDIA_MAX_CONTAINER_RECORDS,
  maxSanitizedEdgePx: MEDIA_MAX_SANITIZED_EDGE_PX,
  maxSanitizedPixels: MEDIA_MAX_SANITIZED_PIXELS,
  processingDeadlineMs: MEDIA_PROCESSING_DEADLINE_MS,
});
