import {
  assertValidMediaPageBounds,
  localMediaAssetIdFromString,
  MEDIA_EDITOR_MAX_AGGREGATE_BYTES,
  MEDIA_EDITOR_MAX_ASSETS,
  MEDIA_EDITOR_MAX_RESOURCES,
  type MediaPageBounds,
} from "./media-editor";
import { freezeMediaOverlay } from "./media-editor-history";
import { inspectSanitizedRasterBytes } from "./media-inspection";
import {
  MEDIA_MAX_SANITIZED_EDGE_PX,
  MEDIA_MAX_SANITIZED_PIXELS,
} from "./media-limits";
import {
  normalizeMediaRotation,
  resolveMediaTransform,
} from "./media-transform";
import type {
  LocalMediaResourceId,
  MediaDocumentBinding,
  MediaDocumentPersistenceSession,
  MediaOverlayState,
  SanitizedMediaMimeType,
} from "./media-types";
import {
  QUICKFILL_MAX_SESSION_AGE_MS,
  QUICKFILL_MEDIA_ASSET_STORE,
  QUICKFILL_MEDIA_BINDING_KEY,
  QUICKFILL_MEDIA_SESSION_STORE,
  QUICKFILL_PDF_KEY,
  QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
  QUICKFILL_PDF_STORE,
  QUICKFILL_PDF_TIMESTAMP_KEY,
  QUICKFILL_TIMESTAMP_STORE,
  runQuickFillMediaTransaction,
  savePdfToIndexedDB,
  type QuickFillTransactionFacade,
} from "./persistence";

export const MEDIA_SESSION_SCHEMA_VERSION = 1;
export const MEDIA_SESSION_KEY = "current_media";
export const MEDIA_PERSISTENCE_MAX_OVERLAYS = MEDIA_EDITOR_MAX_ASSETS;
export const MEDIA_PERSISTENCE_MAX_RESOURCES = MEDIA_EDITOR_MAX_RESOURCES;
export const MEDIA_PERSISTENCE_MAX_BYTES =
  MEDIA_EDITOR_MAX_AGGREGATE_BYTES;
export const MEDIA_PERSISTENCE_WRITE_DELAY_MS = 250;

const PDF_DIGEST_PATTERN = /^pdf-sha256-v1-[0-9a-f]{64}$/;
const INCARNATION_PATTERN =
  /^incarnation-v1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RESOURCE_ID_PATTERN = /^sha256-[0-9a-f]{64}$/;
const SNAPSHOT_BOUND_EPSILON = 1e-6;

export type MediaPersistenceErrorCode =
  | "unavailable"
  | "invalid"
  | "stale"
  | "quota";

export class MediaPersistenceError extends Error {
  readonly code: MediaPersistenceErrorCode;

  constructor(code: MediaPersistenceErrorCode, message: string) {
    super(message);
    this.name = "MediaPersistenceError";
    this.code = code;
  }
}

interface PersistedMediaOverlayRecord {
  readonly assetId: string;
  readonly resourceId: string;
  readonly pageIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

interface PersistedMediaSessionRecord {
  readonly key: typeof MEDIA_SESSION_KEY;
  readonly schemaVersion: typeof MEDIA_SESSION_SCHEMA_VERSION;
  readonly documentBinding: Readonly<MediaDocumentBinding>;
  readonly savedAtMs: number;
  readonly writeSequence: number;
  readonly overlays: readonly PersistedMediaOverlayRecord[];
}

interface PersistedMediaAssetRecord {
  readonly schemaVersion: typeof MEDIA_SESSION_SCHEMA_VERSION;
  readonly resourceId: string;
  readonly mimeType: SanitizedMediaMimeType;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly blob: Blob;
}

export interface MediaPersistenceResource {
  readonly resourceId: LocalMediaResourceId;
  readonly mimeType: SanitizedMediaMimeType;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly blob: Blob;
}

export interface HydratedMediaSnapshot {
  readonly overlays: readonly Readonly<MediaOverlayState>[];
  readonly resources: readonly Readonly<MediaPersistenceResource>[];
  readonly writeSequence: number;
  readonly recoveredFromInvalid: boolean;
}

export interface MediaPersistenceSaveSnapshot {
  readonly overlays: readonly Readonly<MediaOverlayState>[];
  readonly resources: readonly Readonly<MediaPersistenceResource>[];
}

type RawHydrationSnapshot = Readonly<{
  marker: unknown;
  session: unknown;
  assets: readonly unknown[];
}>;

function persistenceFailure(
  code: MediaPersistenceErrorCode,
  message: string,
): MediaPersistenceError {
  return new MediaPersistenceError(code, message);
}

function assertCurrentGeneration(isCurrent: () => boolean): void {
  if (!isCurrent()) {
    throw persistenceFailure("stale", "media document generation changed");
  }
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw persistenceFailure("invalid", `${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw persistenceFailure("invalid", `${label} contains unexpected fields`);
  }
}

function safeNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw persistenceFailure("invalid", `${label} is invalid`);
  }
  return value as number;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw persistenceFailure("invalid", `${label} is invalid`);
  }
  return value as number;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw persistenceFailure("invalid", `${label} is invalid`);
  }
  return value;
}

function parseDocumentBinding(value: unknown): Readonly<MediaDocumentBinding> {
  const record = recordValue(value, "media document binding");
  assertExactKeys(
    record,
    ["schemaVersion", "pdfDigest", "incarnation"],
    "media document binding",
  );
  if (
    record.schemaVersion !== MEDIA_SESSION_SCHEMA_VERSION ||
    typeof record.pdfDigest !== "string" ||
    !PDF_DIGEST_PATTERN.test(record.pdfDigest) ||
    typeof record.incarnation !== "string" ||
    !INCARNATION_PATTERN.test(record.incarnation)
  ) {
    throw persistenceFailure("invalid", "media document binding is invalid");
  }
  return Object.freeze({
    schemaVersion: MEDIA_SESSION_SCHEMA_VERSION,
    pdfDigest: record.pdfDigest,
    incarnation: record.incarnation,
  });
}

export function mediaDocumentBindingsEqual(
  left: Readonly<MediaDocumentBinding>,
  right: Readonly<MediaDocumentBinding>,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.pdfDigest === right.pdfDigest &&
    left.incarnation === right.incarnation
  );
}

export function localMediaResourceIdFromString(
  value: string,
): LocalMediaResourceId {
  if (!RESOURCE_ID_PATTERN.test(value)) {
    throw persistenceFailure("invalid", "media resource identifier is invalid");
  }
  return value as LocalMediaResourceId;
}

function cryptoApi(): Crypto {
  const api = globalThis.crypto;
  if (
    !api ||
    !api.subtle ||
    typeof api.subtle.digest !== "function" ||
    typeof api.getRandomValues !== "function"
  ) {
    throw persistenceFailure(
      "unavailable",
      "Local cryptographic media persistence is unavailable",
    );
  }
  return api;
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await cryptoApi().subtle.digest(
    "SHA-256",
    ownedBytes(bytes).buffer,
  );
  return bytesToHex(new Uint8Array(digest));
}

function createIncarnation(): string {
  const api = cryptoApi();
  if (typeof api.randomUUID === "function") {
    return `incarnation-v1-${api.randomUUID().toLowerCase()}`;
  }
  const bytes = api.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `incarnation-v1-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function hashSanitizedMediaBytes(
  bytes: Uint8Array,
): Promise<LocalMediaResourceId> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw persistenceFailure("invalid", "sanitized media bytes are invalid");
  }
  return localMediaResourceIdFromString(`sha256-${await sha256Hex(bytes)}`);
}

export async function createMediaDocumentBinding(
  pdfBytes: ArrayBuffer,
): Promise<Readonly<MediaDocumentBinding>> {
  if (!(pdfBytes instanceof ArrayBuffer) || pdfBytes.byteLength === 0) {
    throw persistenceFailure("invalid", "PDF bytes are invalid");
  }
  const pdfDigest = `pdf-sha256-v1-${await sha256Hex(
    new Uint8Array(pdfBytes),
  )}`;
  return Object.freeze({
    schemaVersion: MEDIA_SESSION_SCHEMA_VERSION,
    pdfDigest,
    incarnation: createIncarnation(),
  });
}

function emptySessionRecord(
  binding: Readonly<MediaDocumentBinding>,
  writeSequence = 0,
  savedAtMs = Date.now(),
): Readonly<PersistedMediaSessionRecord> {
  return Object.freeze({
    key: MEDIA_SESSION_KEY,
    schemaVersion: MEDIA_SESSION_SCHEMA_VERSION,
    documentBinding: Object.freeze({ ...binding }),
    savedAtMs,
    writeSequence,
    overlays: Object.freeze([]),
  });
}

function parsePersistedOverlay(
  value: unknown,
): Readonly<PersistedMediaOverlayRecord> {
  const record = recordValue(value, "media overlay");
  assertExactKeys(
    record,
    [
      "assetId",
      "resourceId",
      "pageIndex",
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "flipX",
      "flipY",
    ],
    "media overlay",
  );
  if (typeof record.assetId !== "string") {
    throw persistenceFailure("invalid", "media asset identifier is invalid");
  }
  localMediaAssetIdFromString(record.assetId);
  if (typeof record.resourceId !== "string") {
    throw persistenceFailure("invalid", "media resource identifier is invalid");
  }
  localMediaResourceIdFromString(record.resourceId);
  const pageIndex = safeNonNegativeInteger(record.pageIndex, "media page");
  const x = finiteNumber(record.x, "media x");
  const y = finiteNumber(record.y, "media y");
  const width = finiteNumber(record.width, "media width");
  const height = finiteNumber(record.height, "media height");
  const rotation = finiteNumber(record.rotation, "media rotation");
  if (
    width <= 0 ||
    height <= 0 ||
    normalizeMediaRotation(rotation) !== rotation ||
    Object.is(rotation, -0) ||
    typeof record.flipX !== "boolean" ||
    typeof record.flipY !== "boolean"
  ) {
    throw persistenceFailure("invalid", "media geometry is invalid");
  }
  return Object.freeze({
    assetId: record.assetId,
    resourceId: record.resourceId,
    pageIndex,
    x,
    y,
    width,
    height,
    rotation,
    flipX: record.flipX,
    flipY: record.flipY,
  });
}

function parseSessionRecord(value: unknown): Readonly<PersistedMediaSessionRecord> {
  const record = recordValue(value, "media session");
  assertExactKeys(
    record,
    [
      "key",
      "schemaVersion",
      "documentBinding",
      "savedAtMs",
      "writeSequence",
      "overlays",
    ],
    "media session",
  );
  if (
    record.key !== MEDIA_SESSION_KEY ||
    record.schemaVersion !== MEDIA_SESSION_SCHEMA_VERSION ||
    !Array.isArray(record.overlays) ||
    record.overlays.length > MEDIA_PERSISTENCE_MAX_OVERLAYS
  ) {
    throw persistenceFailure("invalid", "media session schema is invalid");
  }
  const savedAtMs = positiveSafeInteger(
    record.savedAtMs,
    "media saved timestamp",
  );
  const writeSequence = safeNonNegativeInteger(
    record.writeSequence,
    "media write sequence",
  );
  return Object.freeze({
    key: MEDIA_SESSION_KEY,
    schemaVersion: MEDIA_SESSION_SCHEMA_VERSION,
    documentBinding: parseDocumentBinding(record.documentBinding),
    savedAtMs,
    writeSequence,
    overlays: Object.freeze(record.overlays.map(parsePersistedOverlay)),
  });
}

function parseAssetRecordShape(
  value: unknown,
): Readonly<PersistedMediaAssetRecord> {
  const record = recordValue(value, "media resource");
  assertExactKeys(
    record,
    [
      "schemaVersion",
      "resourceId",
      "mimeType",
      "width",
      "height",
      "byteLength",
      "blob",
    ],
    "media resource",
  );
  if (
    record.schemaVersion !== MEDIA_SESSION_SCHEMA_VERSION ||
    typeof record.resourceId !== "string" ||
    (record.mimeType !== "image/jpeg" && record.mimeType !== "image/png") ||
    !(record.blob instanceof Blob) ||
    (typeof File !== "undefined" && record.blob instanceof File)
  ) {
    throw persistenceFailure("invalid", "media resource schema is invalid");
  }
  localMediaResourceIdFromString(record.resourceId);
  const width = positiveSafeInteger(record.width, "media resource width");
  const height = positiveSafeInteger(record.height, "media resource height");
  const byteLength = positiveSafeInteger(
    record.byteLength,
    "media resource byte length",
  );
  if (
    width > MEDIA_MAX_SANITIZED_EDGE_PX ||
    height > MEDIA_MAX_SANITIZED_EDGE_PX ||
    width * height > MEDIA_MAX_SANITIZED_PIXELS ||
    byteLength > MEDIA_PERSISTENCE_MAX_BYTES ||
    record.blob.size !== byteLength ||
    record.blob.type !== record.mimeType
  ) {
    throw persistenceFailure("invalid", "media resource limits are invalid");
  }
  return Object.freeze({
    schemaVersion: MEDIA_SESSION_SCHEMA_VERSION,
    resourceId: record.resourceId,
    mimeType: record.mimeType,
    width,
    height,
    byteLength,
    blob: record.blob,
  });
}

function validatePageBounds(
  pageBounds: readonly Readonly<MediaPageBounds>[],
): void {
  if (!Array.isArray(pageBounds) || pageBounds.length === 0) {
    throw persistenceFailure("invalid", "PDF page bounds are unavailable");
  }
  for (const bounds of pageBounds) {
    try {
      assertValidMediaPageBounds(bounds);
    } catch {
      throw persistenceFailure("invalid", "PDF page bounds are invalid");
    }
  }
}

async function validateHydrationSnapshot(
  raw: RawHydrationSnapshot,
  expectedBinding: Readonly<MediaDocumentBinding>,
  pageBounds: readonly Readonly<MediaPageBounds>[],
  isCurrent: () => boolean,
): Promise<Readonly<HydratedMediaSnapshot>> {
  if (!isCurrent()) throw persistenceFailure("stale", "media hydration is stale");
  const marker = parseDocumentBinding(raw.marker);
  const session = parseSessionRecord(raw.session);
  if (
    !mediaDocumentBindingsEqual(marker, expectedBinding) ||
    !mediaDocumentBindingsEqual(session.documentBinding, expectedBinding)
  ) {
    throw persistenceFailure("stale", "media document binding changed");
  }
  if (Date.now() - session.savedAtMs > QUICKFILL_MAX_SESSION_AGE_MS) {
    throw persistenceFailure("invalid", "media session expired");
  }
  validatePageBounds(pageBounds);

  const expectedResourceIds = new Set(
    session.overlays.map(({ resourceId }) => resourceId),
  );
  if (
    expectedResourceIds.size > MEDIA_PERSISTENCE_MAX_RESOURCES ||
    raw.assets.length !== expectedResourceIds.size
  ) {
    throw persistenceFailure("invalid", "media resource count is invalid");
  }

  const resources = new Map<string, Readonly<MediaPersistenceResource>>();
  let aggregateBytes = 0;
  for (const rawAsset of raw.assets) {
    const asset = parseAssetRecordShape(rawAsset);
    if (
      !expectedResourceIds.has(asset.resourceId) ||
      resources.has(asset.resourceId)
    ) {
      throw persistenceFailure("invalid", "media resource references are invalid");
    }
    aggregateBytes += asset.byteLength;
    if (aggregateBytes > MEDIA_PERSISTENCE_MAX_BYTES) {
      throw persistenceFailure("invalid", "media resource bytes exceed the limit");
    }
    const bytes = new Uint8Array(await asset.blob.arrayBuffer());
    if (!isCurrent()) {
      throw persistenceFailure("stale", "media hydration is stale");
    }
    if (bytes.byteLength !== asset.byteLength) {
      throw persistenceFailure("invalid", "media resource bytes are truncated");
    }
    let inspection;
    try {
      inspection = inspectSanitizedRasterBytes(bytes);
    } catch {
      throw persistenceFailure("invalid", "media resource bytes are invalid");
    }
    const expectedFormat = asset.mimeType === "image/jpeg" ? "jpeg" : "png";
    if (
      inspection.format !== expectedFormat ||
      inspection.mimeType !== asset.mimeType ||
      inspection.width !== asset.width ||
      inspection.height !== asset.height ||
      inspection.orientation !== 1 ||
      inspection.hasMetadata ||
      inspection.animated
    ) {
      throw persistenceFailure("invalid", "media resource inspection failed");
    }
    const resourceId = await hashSanitizedMediaBytes(bytes);
    if (!isCurrent()) {
      throw persistenceFailure("stale", "media hydration is stale");
    }
    if (resourceId !== asset.resourceId) {
      throw persistenceFailure("invalid", "media resource digest is invalid");
    }
    resources.set(
      asset.resourceId,
      Object.freeze({
        resourceId,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        byteLength: asset.byteLength,
        blob: asset.blob,
      }),
    );
  }

  const seenAssetIds = new Set<string>();
  const overlays = session.overlays.map((record) => {
    if (seenAssetIds.has(record.assetId)) {
      throw persistenceFailure("invalid", "media asset identifiers are duplicated");
    }
    seenAssetIds.add(record.assetId);
    const resource = resources.get(record.resourceId);
    if (!resource) {
      throw persistenceFailure("invalid", "media resource is missing");
    }
    const bounds = pageBounds[record.pageIndex];
    if (!bounds) {
      throw persistenceFailure("invalid", "media page is invalid");
    }
    const overlay = freezeMediaOverlay({
      assetId: localMediaAssetIdFromString(record.assetId),
      resourceId: localMediaResourceIdFromString(record.resourceId),
      placement: {
        pageIndex: record.pageIndex,
        xPts: record.x,
        yPts: record.y,
        widthPts: record.width,
        heightPts: record.height,
      },
      transform: {
        rotationDeg: record.rotation,
        flipX: record.flipX,
        flipY: record.flipY,
      },
    });
    const intrinsicAspect = resource.width / resource.height;
    const placementAspect =
      overlay.placement.widthPts / overlay.placement.heightPts;
    if (
      Math.abs(intrinsicAspect - placementAspect) >
      Math.max(1, intrinsicAspect) * 1e-6
    ) {
      throw persistenceFailure("invalid", "media aspect ratio is invalid");
    }
    const corners = resolveMediaTransform(
      overlay.placement,
      overlay.transform,
    ).pageCorners;
    if (
      corners.some(
        ({ x, y }) =>
          x < -SNAPSHOT_BOUND_EPSILON ||
          y < -SNAPSHOT_BOUND_EPSILON ||
          x > bounds.widthPts + SNAPSHOT_BOUND_EPSILON ||
          y > bounds.heightPts + SNAPSHOT_BOUND_EPSILON,
      )
    ) {
      throw persistenceFailure("invalid", "media geometry is outside the PDF page");
    }
    return overlay;
  });

  return Object.freeze({
    overlays: Object.freeze(overlays),
    resources: Object.freeze([...resources.values()]),
    writeSequence: session.writeSequence,
    recoveredFromInvalid: false,
  });
}

function sessionResourceIds(value: unknown): readonly string[] {
  return parseSessionRecord(value).overlays.map(({ resourceId }) => resourceId);
}

async function readRawHydrationSnapshot(): Promise<RawHydrationSnapshot> {
  return runQuickFillMediaTransaction("readonly", async (transaction) => {
    const marker = await transaction.get(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_MEDIA_BINDING_KEY,
    );
    const session = await transaction.get(
      QUICKFILL_MEDIA_SESSION_STORE,
      MEDIA_SESSION_KEY,
    );
    let resourceIds: readonly string[] = Object.freeze([]);
    try {
      resourceIds = Object.freeze([...new Set(sessionResourceIds(session))]);
    } catch {
      return Object.freeze({
        marker,
        session,
        assets: Object.freeze([]),
      });
    }
    const assets: unknown[] = [];
    for (const resourceId of resourceIds) {
      assets.push(
        await transaction.get(QUICKFILL_MEDIA_ASSET_STORE, resourceId),
      );
    }
    return Object.freeze({
      marker,
      session,
      assets: Object.freeze(assets),
    });
  });
}

function sessionFingerprint(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

async function resetInvalidMediaSnapshot(
  expectedBinding: Readonly<MediaDocumentBinding>,
  invalidSession: unknown,
): Promise<void> {
  const expectedFingerprint = sessionFingerprint(invalidSession);
  if (expectedFingerprint === null) return;
  await runQuickFillMediaTransaction("readwrite", async (transaction) => {
    const markerValue = await transaction.get(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_MEDIA_BINDING_KEY,
    );
    let marker: Readonly<MediaDocumentBinding>;
    try {
      marker = parseDocumentBinding(markerValue);
    } catch {
      return;
    }
    if (!mediaDocumentBindingsEqual(marker, expectedBinding)) return;
    const currentSession = await transaction.get(
      QUICKFILL_MEDIA_SESSION_STORE,
      MEDIA_SESSION_KEY,
    );
    if (sessionFingerprint(currentSession) !== expectedFingerprint) {
      return;
    }
    let nextSequence = 0;
    try {
      nextSequence = parseSessionRecord(currentSession).writeSequence + 1;
    } catch {
      // A malformed session restarts from sequence zero.
    }
    await transaction.clear(QUICKFILL_MEDIA_ASSET_STORE);
    await transaction.put(
      QUICKFILL_MEDIA_SESSION_STORE,
      emptySessionRecord(expectedBinding, nextSequence),
    );
  });
}

export async function hydrateCurrentMediaSnapshot(options: {
  readonly binding: Readonly<MediaDocumentBinding>;
  readonly pageBounds: readonly Readonly<MediaPageBounds>[];
  readonly isCurrent?: () => boolean;
}): Promise<Readonly<HydratedMediaSnapshot>> {
  const isCurrent = options.isCurrent ?? (() => true);
  const raw = await readRawHydrationSnapshot();
  try {
    return await validateHydrationSnapshot(
      raw,
      options.binding,
      options.pageBounds,
      isCurrent,
    );
  } catch (error) {
    if (
      isCurrent() &&
      (!(error instanceof MediaPersistenceError) || error.code !== "stale")
    ) {
      try {
        await resetInvalidMediaSnapshot(options.binding, raw.session);
        const recovered = await validateHydrationSnapshot(
          await readRawHydrationSnapshot(),
          options.binding,
          options.pageBounds,
          isCurrent,
        );
        return Object.freeze({
          ...recovered,
          recoveredFromInvalid: true,
        });
      } catch {
        // Recovery is best effort and may not block the editor.
      }
    }
    throw error;
  }
}

export async function replaceCurrentMediaDocument(
  pdfBytes: ArrayBuffer,
  isCurrent: () => boolean = () => true,
): Promise<Readonly<MediaDocumentBinding>> {
  const binding = await createMediaDocumentBinding(pdfBytes);
  assertCurrentGeneration(isCurrent);
  const now = Date.now();
  await runQuickFillMediaTransaction("readwrite", async (transaction) => {
    assertCurrentGeneration(isCurrent);
    await transaction.put(QUICKFILL_PDF_STORE, pdfBytes, QUICKFILL_PDF_KEY);
    await transaction.put(
      QUICKFILL_TIMESTAMP_STORE,
      now,
      QUICKFILL_PDF_TIMESTAMP_KEY,
    );
    await transaction.delete(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
    );
    await transaction.put(
      QUICKFILL_TIMESTAMP_STORE,
      binding,
      QUICKFILL_MEDIA_BINDING_KEY,
    );
    await transaction.clear(QUICKFILL_MEDIA_ASSET_STORE);
    await transaction.clear(QUICKFILL_MEDIA_SESSION_STORE);
    await transaction.put(
      QUICKFILL_MEDIA_SESSION_STORE,
      emptySessionRecord(binding, 0, now),
    );
    assertCurrentGeneration(isCurrent);
  });
  assertCurrentGeneration(isCurrent);
  return binding;
}

export async function persistPdfAndInvalidateMedia(
  pdfBytes: ArrayBuffer,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  await runQuickFillMediaTransaction("readwrite", async (transaction) => {
    assertCurrentGeneration(isCurrent);
    await transaction.put(QUICKFILL_PDF_STORE, pdfBytes, QUICKFILL_PDF_KEY);
    await transaction.put(
      QUICKFILL_TIMESTAMP_STORE,
      Date.now(),
      QUICKFILL_PDF_TIMESTAMP_KEY,
    );
    await transaction.delete(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
    );
    await transaction.delete(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_MEDIA_BINDING_KEY,
    );
    await transaction.clear(QUICKFILL_MEDIA_SESSION_STORE);
    await transaction.clear(QUICKFILL_MEDIA_ASSET_STORE);
    assertCurrentGeneration(isCurrent);
  });
  assertCurrentGeneration(isCurrent);
}

export async function persistPdfForEditorMediaSession(
  pdfBytes: ArrayBuffer,
  enabled: boolean,
  isCurrent: () => boolean = () => true,
): Promise<Readonly<MediaDocumentPersistenceSession>> {
  if (!enabled) {
    assertCurrentGeneration(isCurrent);
    await savePdfToIndexedDB(pdfBytes);
    assertCurrentGeneration(isCurrent);
    return Object.freeze({ status: "unavailable" as const });
  }
  try {
    const binding = await replaceCurrentMediaDocument(pdfBytes, isCurrent);
    return Object.freeze({
      status: "ready" as const,
      binding,
      mediaState: Object.freeze({
        kind: "empty" as const,
        writeSequence: 0,
      }),
    });
  } catch (error) {
    if (error instanceof MediaPersistenceError && error.code === "stale") {
      throw error;
    }
    try {
      await persistPdfAndInvalidateMedia(pdfBytes, isCurrent);
    } catch {
      assertCurrentGeneration(isCurrent);
      await savePdfToIndexedDB(pdfBytes, {
        invalidateMediaBinding: true,
      });
      assertCurrentGeneration(isCurrent);
    }
    return Object.freeze({ status: "unavailable" as const });
  }
}

export async function prepareCurrentMediaDocument(
  pdfBytes: ArrayBuffer,
  isCurrent: () => boolean = () => true,
): Promise<
  Extract<Readonly<MediaDocumentPersistenceSession>, { status: "ready" }>
> {
  if (!(pdfBytes instanceof ArrayBuffer) || pdfBytes.byteLength === 0) {
    throw persistenceFailure("invalid", "PDF bytes are invalid");
  }
  const digest = `pdf-sha256-v1-${await sha256Hex(new Uint8Array(pdfBytes))}`;
  assertCurrentGeneration(isCurrent);
  return runQuickFillMediaTransaction("readwrite", async (transaction) => {
    assertCurrentGeneration(isCurrent);
    const storedPdf = await transaction.get(
      QUICKFILL_PDF_STORE,
      QUICKFILL_PDF_KEY,
    );
    if (!(storedPdf instanceof ArrayBuffer)) {
      throw persistenceFailure("stale", "current PDF is unavailable");
    }
    const markerValue = await transaction.get(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_MEDIA_BINDING_KEY,
    );
    const sessionValue = await transaction.get(
      QUICKFILL_MEDIA_SESSION_STORE,
      MEDIA_SESSION_KEY,
    );
    const replacementPendingValue = await transaction.get(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
    );
    assertCurrentGeneration(isCurrent);

    let binding: Readonly<MediaDocumentBinding> | null = null;
    let parsedSession: Readonly<PersistedMediaSessionRecord> | null = null;
    try {
      parsedSession = parseSessionRecord(sessionValue);
    } catch {
      // Hydration owns validation, all-or-nothing recovery, and warning state.
    }
    try {
      const marker = parseDocumentBinding(markerValue);
      if (
        marker.pdfDigest === digest &&
        replacementPendingValue === undefined
      ) {
        binding = marker;
      }
    } catch {
      // A missing or malformed marker establishes a new incarnation.
    }
    if (!binding) {
      binding = Object.freeze({
        schemaVersion: MEDIA_SESSION_SCHEMA_VERSION,
        pdfDigest: digest,
        incarnation: createIncarnation(),
      });
      await transaction.clear(QUICKFILL_MEDIA_ASSET_STORE);
      await transaction.clear(QUICKFILL_MEDIA_SESSION_STORE);
      await transaction.put(
        QUICKFILL_MEDIA_SESSION_STORE,
        emptySessionRecord(binding),
      );
      await transaction.put(
        QUICKFILL_TIMESTAMP_STORE,
        binding,
        QUICKFILL_MEDIA_BINDING_KEY,
      );
      await transaction.delete(
        QUICKFILL_TIMESTAMP_STORE,
        QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
      );
      assertCurrentGeneration(isCurrent);
      return Object.freeze({
        status: "ready" as const,
        binding,
        mediaState: Object.freeze({
          kind: "empty" as const,
          writeSequence: 0,
        }),
      });
    }

    await transaction.put(
      QUICKFILL_TIMESTAMP_STORE,
      binding,
      QUICKFILL_MEDIA_BINDING_KEY,
    );
    assertCurrentGeneration(isCurrent);
    try {
      const session = parsedSession ?? parseSessionRecord(sessionValue);
      if (
        mediaDocumentBindingsEqual(session.documentBinding, binding) &&
        session.overlays.length === 0
      ) {
        return Object.freeze({
          status: "ready" as const,
          binding,
          mediaState: Object.freeze({
            kind: "empty" as const,
            writeSequence: session.writeSequence,
          }),
        });
      }
    } catch {
      // Hydration owns validation, all-or-nothing recovery, and warning state.
    }
    return Object.freeze({
      status: "ready" as const,
      binding,
      mediaState: Object.freeze({ kind: "hydrate" as const }),
    });
  });
}

function persistedOverlayFromState(
  overlay: Readonly<MediaOverlayState>,
  resourceId: LocalMediaResourceId,
): Readonly<PersistedMediaOverlayRecord> {
  const frozen = freezeMediaOverlay(overlay);
  return Object.freeze({
    assetId: frozen.assetId,
    resourceId,
    pageIndex: frozen.placement.pageIndex,
    x: frozen.placement.xPts,
    y: frozen.placement.yPts,
    width: frozen.placement.widthPts,
    height: frozen.placement.heightPts,
    rotation: frozen.transform.rotationDeg,
    flipX: frozen.transform.flipX,
    flipY: frozen.transform.flipY,
  });
}

function prepareSaveRecords(snapshot: Readonly<MediaPersistenceSaveSnapshot>): {
  readonly overlays: readonly Readonly<PersistedMediaOverlayRecord>[];
  readonly assets: readonly Readonly<PersistedMediaAssetRecord>[];
} {
  if (
    !Array.isArray(snapshot.overlays) ||
    !Array.isArray(snapshot.resources) ||
    snapshot.overlays.length > MEDIA_PERSISTENCE_MAX_OVERLAYS ||
    snapshot.resources.length > MEDIA_PERSISTENCE_MAX_RESOURCES
  ) {
    throw persistenceFailure("invalid", "media snapshot exceeds its limits");
  }
  const resourceMap = new Map<
    LocalMediaResourceId,
    Readonly<MediaPersistenceResource>
  >();
  let aggregateBytes = 0;
  const assets = snapshot.resources.map((resource) => {
    const resourceId = localMediaResourceIdFromString(resource.resourceId);
    if (resourceMap.has(resourceId)) {
      throw persistenceFailure("invalid", "media resources are duplicated");
    }
    if (
      (resource.mimeType !== "image/jpeg" &&
        resource.mimeType !== "image/png") ||
      !Number.isSafeInteger(resource.width) ||
      !Number.isSafeInteger(resource.height) ||
      resource.width <= 0 ||
      resource.height <= 0 ||
      resource.width > MEDIA_MAX_SANITIZED_EDGE_PX ||
      resource.height > MEDIA_MAX_SANITIZED_EDGE_PX ||
      resource.width * resource.height > MEDIA_MAX_SANITIZED_PIXELS ||
      !(resource.blob instanceof Blob) ||
      resource.blob.type !== resource.mimeType ||
      resource.blob.size !== resource.byteLength ||
      resource.byteLength <= 0
    ) {
      throw persistenceFailure("invalid", "media resource is invalid");
    }
    aggregateBytes += resource.byteLength;
    if (aggregateBytes > MEDIA_PERSISTENCE_MAX_BYTES) {
      throw persistenceFailure("invalid", "media resource bytes exceed the limit");
    }
    resourceMap.set(resourceId, resource);
    return Object.freeze({
      schemaVersion: MEDIA_SESSION_SCHEMA_VERSION,
      resourceId,
      mimeType: resource.mimeType,
      width: resource.width,
      height: resource.height,
      byteLength: resource.byteLength,
      blob: resource.blob,
    });
  });

  const seenAssetIds = new Set<string>();
  const referencedResources = new Set<LocalMediaResourceId>();
  const overlays = snapshot.overlays.map((overlay) => {
    const assetId = localMediaAssetIdFromString(overlay.assetId);
    if (seenAssetIds.has(assetId)) {
      throw persistenceFailure("invalid", "media asset identifiers are duplicated");
    }
    seenAssetIds.add(assetId);
    const resourceId = localMediaResourceIdFromString(overlay.resourceId);
    if (!resourceMap.has(resourceId)) {
      throw persistenceFailure("invalid", "media resource reference is missing");
    }
    referencedResources.add(resourceId);
    return persistedOverlayFromState(overlay, resourceId);
  });
  if (referencedResources.size !== resourceMap.size) {
    throw persistenceFailure("invalid", "media snapshot contains an orphan resource");
  }
  return Object.freeze({
    overlays: Object.freeze(overlays),
    assets: Object.freeze(assets),
  });
}

async function saveMediaSnapshotOnce(
  binding: Readonly<MediaDocumentBinding>,
  writeSequence: number,
  snapshot: Readonly<MediaPersistenceSaveSnapshot>,
): Promise<void> {
  const records = prepareSaveRecords(snapshot);
  const referencedResourceIds = new Set(
    records.assets.map(({ resourceId }) => resourceId),
  );
  await runQuickFillMediaTransaction("readwrite", async (transaction) => {
    const marker = parseDocumentBinding(
      await transaction.get(
        QUICKFILL_TIMESTAMP_STORE,
        QUICKFILL_MEDIA_BINDING_KEY,
      ),
    );
    const currentSession = parseSessionRecord(
      await transaction.get(
        QUICKFILL_MEDIA_SESSION_STORE,
        MEDIA_SESSION_KEY,
      ),
    );
    if (
      !mediaDocumentBindingsEqual(marker, binding) ||
      !mediaDocumentBindingsEqual(currentSession.documentBinding, binding) ||
      currentSession.writeSequence >= writeSequence
    ) {
      throw persistenceFailure("stale", "media save was superseded");
    }
    for (const asset of records.assets) {
      await transaction.put(QUICKFILL_MEDIA_ASSET_STORE, asset);
    }
    await transaction.put(
      QUICKFILL_MEDIA_SESSION_STORE,
      Object.freeze({
        key: MEDIA_SESSION_KEY,
        schemaVersion: MEDIA_SESSION_SCHEMA_VERSION,
        documentBinding: Object.freeze({ ...binding }),
        savedAtMs: Date.now(),
        writeSequence,
        overlays: records.overlays,
      }),
    );
    const storedKeys = await transaction.getAllKeys(
      QUICKFILL_MEDIA_ASSET_STORE,
    );
    for (const key of storedKeys) {
      if (
        typeof key !== "string" ||
        !referencedResourceIds.has(key)
      ) {
        await transaction.delete(QUICKFILL_MEDIA_ASSET_STORE, key);
      }
    }
  });
}

function isQuotaFailure(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return true;
  }
  return (
    error instanceof Error &&
    (error.name === "QuotaExceededError" ||
      (error.cause !== undefined && isQuotaFailure(error.cause)))
  );
}

export async function saveMediaSnapshotWithRetry(
  binding: Readonly<MediaDocumentBinding>,
  writeSequence: number,
  snapshot: Readonly<MediaPersistenceSaveSnapshot>,
): Promise<void> {
  try {
    await saveMediaSnapshotOnce(binding, writeSequence, snapshot);
  } catch (error) {
    if (!isQuotaFailure(error)) throw error;
    try {
      await cleanupMediaPersistence();
      await saveMediaSnapshotOnce(binding, writeSequence, snapshot);
    } catch (retryError) {
      if (isQuotaFailure(retryError)) {
        throw persistenceFailure(
          "quota",
          "Local media storage capacity was exceeded",
        );
      }
      throw retryError;
    }
  }
}

export class MediaPersistenceWriter {
  private readonly binding: Readonly<MediaDocumentBinding>;
  private readonly onFailure: (error: unknown) => void;
  private readonly delayMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Readonly<MediaPersistenceSaveSnapshot> | null = null;
  private inFlight = false;
  private disposed = false;
  private failed = false;
  private nextSequence: number;

  constructor(options: {
    readonly binding: Readonly<MediaDocumentBinding>;
    readonly initialWriteSequence: number;
    readonly onFailure: (error: unknown) => void;
    readonly delayMs?: number;
  }) {
    this.binding = Object.freeze({ ...options.binding });
    this.nextSequence = safeNonNegativeInteger(
      options.initialWriteSequence,
      "initial media write sequence",
    );
    this.onFailure = options.onFailure;
    this.delayMs = options.delayMs ?? MEDIA_PERSISTENCE_WRITE_DELAY_MS;
    if (!Number.isSafeInteger(this.delayMs) || this.delayMs < 0) {
      throw new RangeError("media write delay must be a non-negative integer");
    }
  }

  schedule(snapshot: Readonly<MediaPersistenceSaveSnapshot>): void {
    if (this.disposed || this.failed) return;
    this.pending = Object.freeze({
      overlays: Object.freeze([...snapshot.overlays]),
      resources: Object.freeze([...snapshot.resources]),
    });
    if (!this.inFlight && this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.writeNewest();
      }, this.delayMs);
    }
  }

  private async writeNewest(): Promise<void> {
    if (
      this.disposed ||
      this.failed ||
      this.inFlight ||
      this.pending === null
    ) {
      return;
    }
    const snapshot = this.pending;
    this.pending = null;
    this.inFlight = true;
    this.nextSequence += 1;
    try {
      await saveMediaSnapshotWithRetry(
        this.binding,
        this.nextSequence,
        snapshot,
      );
    } catch (error) {
      if (!this.disposed) {
        this.failed = true;
        this.pending = null;
        this.onFailure(error);
      }
    } finally {
      this.inFlight = false;
      if (
        !this.disposed &&
        !this.failed &&
        this.pending !== null &&
        this.timer === null
      ) {
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.writeNewest();
        }, this.delayMs);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = null;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

async function clearWholeSession(
  transaction: QuickFillTransactionFacade,
): Promise<void> {
  await transaction.delete(QUICKFILL_PDF_STORE, QUICKFILL_PDF_KEY);
  await transaction.delete(
    QUICKFILL_TIMESTAMP_STORE,
    QUICKFILL_PDF_TIMESTAMP_KEY,
  );
  await transaction.delete(
    QUICKFILL_TIMESTAMP_STORE,
    QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
  );
  await transaction.delete(
    QUICKFILL_TIMESTAMP_STORE,
    QUICKFILL_MEDIA_BINDING_KEY,
  );
  await transaction.clear(QUICKFILL_MEDIA_SESSION_STORE);
  await transaction.clear(QUICKFILL_MEDIA_ASSET_STORE);
}

async function clearMediaSession(
  transaction: QuickFillTransactionFacade,
): Promise<void> {
  await transaction.delete(
    QUICKFILL_TIMESTAMP_STORE,
    QUICKFILL_MEDIA_BINDING_KEY,
  );
  await transaction.clear(QUICKFILL_MEDIA_SESSION_STORE);
  await transaction.clear(QUICKFILL_MEDIA_ASSET_STORE);
}

export async function cleanupMediaPersistence(
  nowMs = Date.now(),
): Promise<void> {
  await runQuickFillMediaTransaction("readwrite", async (transaction) => {
    const timestamp = await transaction.get(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_PDF_TIMESTAMP_KEY,
    );
    const pdf = await transaction.get(
      QUICKFILL_PDF_STORE,
      QUICKFILL_PDF_KEY,
    );
    if (
      typeof timestamp !== "number" ||
      !Number.isFinite(timestamp) ||
      timestamp <= 0 ||
      !(pdf instanceof ArrayBuffer) ||
      nowMs - timestamp > QUICKFILL_MAX_SESSION_AGE_MS
    ) {
      await clearWholeSession(transaction);
      return;
    }

    const markerValue = await transaction.get(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_MEDIA_BINDING_KEY,
    );
    const sessionValue = await transaction.get(
      QUICKFILL_MEDIA_SESSION_STORE,
      MEDIA_SESSION_KEY,
    );
    if (markerValue === undefined && sessionValue === undefined) {
      await transaction.clear(QUICKFILL_MEDIA_ASSET_STORE);
      return;
    }

    let marker: Readonly<MediaDocumentBinding>;
    let session: Readonly<PersistedMediaSessionRecord>;
    try {
      marker = parseDocumentBinding(markerValue);
      session = parseSessionRecord(sessionValue);
    } catch {
      await clearMediaSession(transaction);
      return;
    }
    if (
      !mediaDocumentBindingsEqual(marker, session.documentBinding) ||
      nowMs - session.savedAtMs > QUICKFILL_MAX_SESSION_AGE_MS
    ) {
      await clearMediaSession(transaction);
      return;
    }

    const referenced = new Set(
      session.overlays.map(({ resourceId }) => resourceId),
    );
    const storedAssetKeys = await transaction.getAllKeys(
      QUICKFILL_MEDIA_ASSET_STORE,
    );
    let referencedAssetInvalid = false;
    for (const storedKey of storedAssetKeys) {
      if (typeof storedKey !== "string") {
        await transaction.delete(QUICKFILL_MEDIA_ASSET_STORE, storedKey);
        continue;
      }
      const rawAsset = await transaction.get(
        QUICKFILL_MEDIA_ASSET_STORE,
        storedKey,
      );
      try {
        const asset = parseAssetRecordShape(rawAsset);
        if (asset.resourceId !== storedKey) {
          if (referenced.has(storedKey)) referencedAssetInvalid = true;
          else {
            await transaction.delete(
              QUICKFILL_MEDIA_ASSET_STORE,
              storedKey,
            );
          }
        } else if (!referenced.has(asset.resourceId)) {
          await transaction.delete(
            QUICKFILL_MEDIA_ASSET_STORE,
            storedKey,
          );
        }
      } catch {
        if (!referenced.has(storedKey)) {
          await transaction.delete(
            QUICKFILL_MEDIA_ASSET_STORE,
            storedKey,
          );
        } else {
          referencedAssetInvalid = true;
        }
      }
    }
    if (referencedAssetInvalid) {
      await transaction.clear(QUICKFILL_MEDIA_ASSET_STORE);
      await transaction.put(
        QUICKFILL_MEDIA_SESSION_STORE,
        emptySessionRecord(marker, session.writeSequence + 1),
      );
    }
  });
}
