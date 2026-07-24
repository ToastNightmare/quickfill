import {
  applyAffineMatrix,
  assertValidAffineMatrix,
  assertValidMediaPlacement,
  assertValidMediaTransform,
  invertAffineMatrix,
  normalizeMediaRotation,
  resolveMediaTransform,
} from "./media-transform";
import type {
  AffineMatrix,
  LocalMediaAssetId,
  LocalMediaResourceId,
  MediaAssetDescriptor,
  MediaPlacement,
  MediaTransform,
  SanitizedMediaMimeType,
} from "./media-types";
import {
  MEDIA_MAX_SANITIZED_EDGE_PX,
  MEDIA_MAX_SANITIZED_PIXELS,
} from "./media-limits";

export const MEDIA_EDITOR_MAX_ASSETS = 12;
export const MEDIA_EDITOR_MAX_RESOURCES = 12;
export const MEDIA_EDITOR_MAX_AGGREGATE_BYTES = 64 * 1024 * 1024;
export const MEDIA_EDITOR_MIN_SIZE_PTS = 24;
export const MEDIA_FILE_INPUT_ACCEPT =
  "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

const MAX_MEDIA_FILE_NAME_LENGTH = 120;
const LOCAL_MEDIA_ASSET_ID_PATTERN = /^media-[a-z0-9][a-z0-9-]{0,95}$/;
const LOCAL_MEDIA_RESOURCE_ID_PATTERN =
  /^(?:sha256-[0-9a-f]{64}|ephemeral-[a-z0-9][a-z0-9-]{0,95})$/;

export interface MediaPageBounds {
  readonly widthPts: number;
  readonly heightPts: number;
}

export interface LocalMediaAssetRecord {
  readonly descriptor: Readonly<
    MediaAssetDescriptor & { readonly resourceId: LocalMediaResourceId }
  >;
  readonly blob: Blob;
  readonly objectUrl: string;
}

export interface LocalMediaResourceRecord {
  readonly resourceId: LocalMediaResourceId;
  readonly mimeType: SanitizedMediaMimeType;
  readonly intrinsicWidthPx: number;
  readonly intrinsicHeightPx: number;
  readonly byteLength: number;
  readonly blob: Blob;
  readonly objectUrl: string;
}

interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

interface MutableMediaResourceRecord extends LocalMediaResourceRecord {
  referenceCount: number;
}

function assertPositiveFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number`);
  }
}

export function assertValidMediaPageBounds(
  value: unknown,
): asserts value is MediaPageBounds {
  if (!value || typeof value !== "object") {
    throw new TypeError("media page bounds must be an object");
  }
  const bounds = value as Partial<MediaPageBounds>;
  assertPositiveFinite(bounds.widthPts, "media page width");
  assertPositiveFinite(bounds.heightPts, "media page height");
}

export function localMediaAssetIdFromString(value: string): LocalMediaAssetId {
  if (!LOCAL_MEDIA_ASSET_ID_PATTERN.test(value)) {
    throw new TypeError("local media asset id is invalid");
  }
  return value as LocalMediaAssetId;
}

export function runtimeMediaResourceIdFromString(
  value: string,
): LocalMediaResourceId {
  if (!LOCAL_MEDIA_RESOURCE_ID_PATTERN.test(value)) {
    throw new TypeError("local media resource id is invalid");
  }
  return value as LocalMediaResourceId;
}

function sanitizedOutputExtension(mimeType: string): "jpg" | "png" {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  throw new TypeError("sanitized media must be JPEG or PNG");
}

export function sanitizedMediaFileName(
  sourceName: string,
  mimeType: "image/jpeg" | "image/png",
): string {
  const extension = sanitizedOutputExtension(mimeType);
  const withoutPath = sourceName.split(/[\\/]/).pop() ?? "";
  const withoutKnownExtension = withoutPath.replace(/\.(?:jpe?g|jfif|png|webp)$/i, "");
  const normalized = withoutKnownExtension
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "-")
    .trim()
    .replace(/^\.+|\.+$/g, "");
  const fallback = normalized || "media";
  const maxStemLength = MAX_MEDIA_FILE_NAME_LENGTH - extension.length - 1;
  return `${fallback.slice(0, maxStemLength)}.${extension}`;
}

export function createMediaAssetDescriptor(input: {
  readonly id: LocalMediaAssetId;
  readonly resourceId: LocalMediaResourceId;
  readonly sourceFileName: string;
  readonly mimeType: SanitizedMediaMimeType;
  readonly width: number;
  readonly height: number;
}): Readonly<
  MediaAssetDescriptor & { readonly resourceId: LocalMediaResourceId }
> {
  const descriptor = Object.freeze({
    id: localMediaAssetIdFromString(input.id),
    resourceId: runtimeMediaResourceIdFromString(input.resourceId),
    kind: "image" as const,
    fileName: sanitizedMediaFileName(input.sourceFileName, input.mimeType),
    mimeType: input.mimeType,
    intrinsicWidthPx: input.width,
    intrinsicHeightPx: input.height,
  });
  assertValidMediaAssetDescriptor(descriptor);
  return descriptor;
}

export function assertValidMediaAssetDescriptor(
  value: unknown,
): asserts value is MediaAssetDescriptor & {
  readonly resourceId: LocalMediaResourceId;
} {
  if (!value || typeof value !== "object") {
    throw new TypeError("media asset descriptor must be an object");
  }
  const descriptor = value as Partial<MediaAssetDescriptor>;
  if (typeof descriptor.id !== "string") {
    throw new TypeError("media asset descriptor id is invalid");
  }
  localMediaAssetIdFromString(descriptor.id);
  if (typeof descriptor.resourceId !== "string") {
    throw new TypeError("media asset descriptor resource id is invalid");
  }
  runtimeMediaResourceIdFromString(descriptor.resourceId);
  if (descriptor.kind !== "image") {
    throw new TypeError("media asset descriptor kind is invalid");
  }
  if (
    typeof descriptor.fileName !== "string" ||
    descriptor.fileName.length === 0 ||
    descriptor.fileName.length > MAX_MEDIA_FILE_NAME_LENGTH ||
    /[\u0000-\u001f\u007f\\/]/.test(descriptor.fileName)
  ) {
    throw new TypeError("media asset descriptor file name is invalid");
  }
  if (descriptor.mimeType !== "image/jpeg" && descriptor.mimeType !== "image/png") {
    throw new TypeError("media asset descriptor MIME type is invalid");
  }
  if (
    !Number.isSafeInteger(descriptor.intrinsicWidthPx) ||
    !Number.isSafeInteger(descriptor.intrinsicHeightPx) ||
    (descriptor.intrinsicWidthPx ?? 0) <= 0 ||
    (descriptor.intrinsicHeightPx ?? 0) <= 0 ||
    (descriptor.intrinsicWidthPx ?? 0) > MEDIA_MAX_SANITIZED_EDGE_PX ||
    (descriptor.intrinsicHeightPx ?? 0) > MEDIA_MAX_SANITIZED_EDGE_PX ||
    (descriptor.intrinsicWidthPx ?? 0) * (descriptor.intrinsicHeightPx ?? 0) >
      MEDIA_MAX_SANITIZED_PIXELS
  ) {
    throw new RangeError("media asset descriptor dimensions are invalid");
  }
}

export class LocalMediaAssetRegistry {
  private readonly records = new Map<
    LocalMediaAssetId,
    Readonly<LocalMediaAssetRecord>
  >();
  private readonly resources = new Map<
    LocalMediaResourceId,
    MutableMediaResourceRecord
  >();
  private readonly objectUrlApi: ObjectUrlApi;
  private readonly maxAssets: number;
  private readonly maxResources: number;
  private readonly maxAggregateBytes: number;
  private aggregateBytes = 0;

  constructor(
    objectUrlApi: ObjectUrlApi = URL,
    maxAssets = MEDIA_EDITOR_MAX_ASSETS,
    maxResources = MEDIA_EDITOR_MAX_RESOURCES,
    maxAggregateBytes = MEDIA_EDITOR_MAX_AGGREGATE_BYTES,
  ) {
    if (!Number.isSafeInteger(maxAssets) || maxAssets <= 0) {
      throw new RangeError("media registry capacity must be a positive safe integer");
    }
    if (!Number.isSafeInteger(maxResources) || maxResources <= 0) {
      throw new RangeError(
        "media resource capacity must be a positive safe integer",
      );
    }
    if (!Number.isSafeInteger(maxAggregateBytes) || maxAggregateBytes <= 0) {
      throw new RangeError(
        "media byte capacity must be a positive safe integer",
      );
    }
    this.objectUrlApi = objectUrlApi;
    this.maxAssets = maxAssets;
    this.maxResources = maxResources;
    this.maxAggregateBytes = maxAggregateBytes;
  }

  get size(): number {
    return this.records.size;
  }

  get capacity(): number {
    return this.maxAssets;
  }

  get resourceCount(): number {
    return this.resources.size;
  }

  get resourceCapacity(): number {
    return this.maxResources;
  }

  get totalBytes(): number {
    return this.aggregateBytes;
  }

  get byteCapacity(): number {
    return this.maxAggregateBytes;
  }

  has(id: LocalMediaAssetId): boolean {
    return this.records.has(id);
  }

  get(id: LocalMediaAssetId): Readonly<LocalMediaAssetRecord> | null {
    return this.records.get(id) ?? null;
  }

  getResource(
    resourceId: LocalMediaResourceId,
  ): Readonly<LocalMediaResourceRecord> | null {
    return this.resources.get(resourceId) ?? null;
  }

  add(
    descriptor: Readonly<
      MediaAssetDescriptor & { readonly resourceId: LocalMediaResourceId }
    >,
    blob: Blob,
  ): Readonly<LocalMediaAssetRecord> {
    assertValidMediaAssetDescriptor(descriptor);
    if (!(blob instanceof Blob) || blob.size <= 0) {
      throw new TypeError("sanitized media blob is invalid");
    }
    if (blob.type !== descriptor.mimeType) {
      throw new TypeError("sanitized media blob type does not match its descriptor");
    }
    if (this.records.has(descriptor.id)) {
      throw new Error("local media asset id already exists");
    }
    if (this.records.size >= this.maxAssets) {
      throw new RangeError("local media asset registry is full");
    }

    let resource = this.resources.get(descriptor.resourceId);
    if (resource) {
      if (
        resource.mimeType !== descriptor.mimeType ||
        resource.intrinsicWidthPx !== descriptor.intrinsicWidthPx ||
        resource.intrinsicHeightPx !== descriptor.intrinsicHeightPx ||
        resource.byteLength !== blob.size
      ) {
        throw new Error("shared sanitized media resource is inconsistent");
      }
      resource.referenceCount += 1;
    } else {
      if (this.resources.size >= this.maxResources) {
        throw new RangeError("local media resource registry is full");
      }
      if (this.aggregateBytes + blob.size > this.maxAggregateBytes) {
        throw new RangeError("local media byte capacity is exceeded");
      }
      const objectUrl = this.objectUrlApi.createObjectURL(blob);
      if (typeof objectUrl !== "string" || objectUrl.length === 0) {
        throw new Error("sanitized media object URL could not be created");
      }
      resource = {
        resourceId: descriptor.resourceId,
        mimeType: descriptor.mimeType,
        intrinsicWidthPx: descriptor.intrinsicWidthPx,
        intrinsicHeightPx: descriptor.intrinsicHeightPx,
        byteLength: blob.size,
        blob,
        objectUrl,
        referenceCount: 1,
      };
      this.resources.set(descriptor.resourceId, resource);
      this.aggregateBytes += blob.size;
    }

    const record = Object.freeze({
      descriptor,
      blob: resource.blob,
      objectUrl: resource.objectUrl,
    });
    this.records.set(descriptor.id, record);
    return record;
  }

  release(id: LocalMediaAssetId): boolean {
    const record = this.records.get(id);
    if (!record) return false;
    this.records.delete(id);
    const resource = this.resources.get(record.descriptor.resourceId);
    if (!resource) {
      throw new Error("local media resource registry is inconsistent");
    }
    resource.referenceCount -= 1;
    if (resource.referenceCount === 0) {
      this.resources.delete(record.descriptor.resourceId);
      this.aggregateBytes -= resource.byteLength;
      this.objectUrlApi.revokeObjectURL(resource.objectUrl);
    }
    return true;
  }

  clear(): void {
    for (const resource of this.resources.values()) {
      this.objectUrlApi.revokeObjectURL(resource.objectUrl);
    }
    this.records.clear();
    this.resources.clear();
    this.aggregateBytes = 0;
  }
}

function frozenPlacement(placement: Readonly<MediaPlacement>): Readonly<MediaPlacement> {
  return Object.freeze({
    pageIndex: placement.pageIndex,
    xPts: placement.xPts === 0 ? 0 : placement.xPts,
    yPts: placement.yPts === 0 ? 0 : placement.yPts,
    widthPts: placement.widthPts,
    heightPts: placement.heightPts,
  });
}

export function createCenteredMediaPlacement(
  descriptor: Readonly<MediaAssetDescriptor>,
  pageIndex: number,
  bounds: Readonly<MediaPageBounds>,
): Readonly<MediaPlacement> {
  assertValidMediaAssetDescriptor(descriptor);
  assertValidMediaPageBounds(bounds);
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0) {
    throw new RangeError("media page index must be a non-negative safe integer");
  }

  const scale = Math.min(
    (bounds.widthPts * 0.6) / descriptor.intrinsicWidthPx,
    (bounds.heightPts * 0.6) / descriptor.intrinsicHeightPx,
  );
  const widthPts = descriptor.intrinsicWidthPx * scale;
  const heightPts = descriptor.intrinsicHeightPx * scale;
  return frozenPlacement({
    pageIndex,
    xPts: (bounds.widthPts - widthPts) / 2,
    yPts: (bounds.heightPts - heightPts) / 2,
    widthPts,
    heightPts,
  });
}

function rotatedBoundingDimensions(
  widthPts: number,
  heightPts: number,
  rotationDeg: number,
): Readonly<{ widthPts: number; heightPts: number }> {
  const radians = (normalizeMediaRotation(rotationDeg) * Math.PI) / 180;
  const absoluteCosine = Math.abs(Math.cos(radians));
  const absoluteSine = Math.abs(Math.sin(radians));
  return Object.freeze({
    widthPts: absoluteCosine * widthPts + absoluteSine * heightPts,
    heightPts: absoluteSine * widthPts + absoluteCosine * heightPts,
  });
}

export function keepMediaPlacementWithinPage(
  placementValue: Readonly<MediaPlacement>,
  transformValue: Readonly<MediaTransform>,
  bounds: Readonly<MediaPageBounds>,
): Readonly<MediaPlacement> {
  assertValidMediaPlacement(placementValue);
  assertValidMediaTransform(transformValue);
  assertValidMediaPageBounds(bounds);

  let widthPts = placementValue.widthPts;
  let heightPts = placementValue.heightPts;
  const initialBounding = rotatedBoundingDimensions(
    widthPts,
    heightPts,
    transformValue.rotationDeg,
  );
  const fitScale = Math.min(
    1,
    bounds.widthPts / initialBounding.widthPts,
    bounds.heightPts / initialBounding.heightPts,
  );
  const centerX = placementValue.xPts + widthPts / 2;
  const centerY = placementValue.yPts + heightPts / 2;
  widthPts *= fitScale;
  heightPts *= fitScale;

  let placement = frozenPlacement({
    pageIndex: placementValue.pageIndex,
    xPts: centerX - widthPts / 2,
    yPts: centerY - heightPts / 2,
    widthPts,
    heightPts,
  });
  const resolved = resolveMediaTransform(placement, transformValue);
  const minX = Math.min(...resolved.pageCorners.map((corner) => corner.x));
  const maxX = Math.max(...resolved.pageCorners.map((corner) => corner.x));
  const minY = Math.min(...resolved.pageCorners.map((corner) => corner.y));
  const maxY = Math.max(...resolved.pageCorners.map((corner) => corner.y));
  const deltaX = minX < 0 ? -minX : maxX > bounds.widthPts ? bounds.widthPts - maxX : 0;
  const deltaY = minY < 0 ? -minY : maxY > bounds.heightPts ? bounds.heightPts - maxY : 0;

  placement = frozenPlacement({
    ...placement,
    xPts: placement.xPts + deltaX,
    yPts: placement.yPts + deltaY,
  });
  assertValidMediaPlacement(placement);
  return placement;
}

export function resizeMediaPlacementFromCenter(
  placement: Readonly<MediaPlacement>,
  transform: Readonly<MediaTransform>,
  scaleValue: number,
  bounds: Readonly<MediaPageBounds>,
): Readonly<MediaPlacement> {
  assertValidMediaPlacement(placement);
  assertValidMediaTransform(transform);
  assertValidMediaPageBounds(bounds);
  if (!Number.isFinite(scaleValue) || scaleValue <= 0) {
    throw new RangeError("media resize scale must be positive and finite");
  }
  const minimumScale = Math.max(
    MEDIA_EDITOR_MIN_SIZE_PTS / placement.widthPts,
    MEDIA_EDITOR_MIN_SIZE_PTS / placement.heightPts,
  );
  const scale = Math.max(scaleValue, minimumScale);
  const centerX = placement.xPts + placement.widthPts / 2;
  const centerY = placement.yPts + placement.heightPts / 2;
  const widthPts = placement.widthPts * scale;
  const heightPts = placement.heightPts * scale;
  return keepMediaPlacementWithinPage(
    {
      pageIndex: placement.pageIndex,
      xPts: centerX - widthPts / 2,
      yPts: centerY - heightPts / 2,
      widthPts,
      heightPts,
    },
    transform,
    bounds,
  );
}

export function pageDeltaFromViewportDelta(
  pageToViewport: AffineMatrix,
  deltaX: number,
  deltaY: number,
): Readonly<{ xPts: number; yPts: number }> {
  assertValidAffineMatrix(pageToViewport);
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    throw new RangeError("viewport delta must be finite");
  }
  const viewportToPage = invertAffineMatrix(pageToViewport);
  const origin = applyAffineMatrix(viewportToPage, { x: 0, y: 0 });
  const destination = applyAffineMatrix(viewportToPage, {
    x: deltaX,
    y: deltaY,
  });
  return Object.freeze({
    xPts: destination.x - origin.x,
    yPts: destination.y - origin.y,
  });
}

export function mediaPlacementsEqual(
  left: Readonly<MediaPlacement>,
  right: Readonly<MediaPlacement>,
): boolean {
  return (
    left.pageIndex === right.pageIndex &&
    left.xPts === right.xPts &&
    left.yPts === right.yPts &&
    left.widthPts === right.widthPts &&
    left.heightPts === right.heightPts
  );
}
