import {
  MEDIA_MAX_CONTAINER_RECORDS,
  MEDIA_MAX_DECODED_PIXELS,
  MEDIA_MAX_ENCODED_SOURCE_BYTES,
  MEDIA_MAX_SOURCE_AXIS_PX,
} from "./media-limits";

export type RasterFormat = "jpeg" | "png" | "webp";

export type RasterMimeType = "image/jpeg" | "image/png" | "image/webp";

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type MediaInspectionErrorCode =
  | "empty-source"
  | "source-too-large"
  | "source-complexity-exceeded"
  | "unsupported-format"
  | "unsupported-encoding"
  | "malformed-source"
  | "animated-source"
  | "source-dimensions-exceeded";

export class MediaInspectionError extends Error {
  readonly code: MediaInspectionErrorCode;

  constructor(code: MediaInspectionErrorCode, message: string) {
    super(message);
    this.name = "MediaInspectionError";
    this.code = code;
  }
}

export interface RasterInspection {
  readonly format: RasterFormat;
  readonly mimeType: RasterMimeType;
  readonly width: number;
  readonly height: number;
  readonly orientedWidth: number;
  readonly orientedHeight: number;
  readonly decodedPixels: number;
  readonly orientation: ExifOrientation;
  readonly hasAlpha: boolean;
  readonly hasMetadata: boolean;
  readonly animated: false;
}

type ByteRange = Readonly<{
  start: number;
  end: number;
}>;

type JpegParseResult = Readonly<{
  inspection: RasterInspection;
  applicationRanges: readonly ByteRange[];
  decodeOmitRanges: readonly ByteRange[];
}>;

type PngChunk = Readonly<{
  type: string;
  start: number;
  dataStart: number;
  length: number;
  end: number;
}>;

type PngParseResult = Readonly<{
  inspection: RasterInspection;
  chunks: readonly PngChunk[];
}>;

type WebPChunk = Readonly<{
  type: string;
  start: number;
  dataStart: number;
  length: number;
  end: number;
}>;

type WebPParseResult = Readonly<{
  inspection: RasterInspection;
  chunks: readonly WebPChunk[];
  extended: boolean;
}>;

const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);

const JPEG_SUPPORTED_SOF = new Set([0xc0, 0xc1, 0xc2]);
const JPEG_ALL_SOF = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

const PNG_KNOWN_CRITICAL = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);
const PNG_APNG_CHUNKS = new Set(["acTL", "fcTL", "fdAT"]);
const PNG_SINGLE_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "IEND",
  "cHRM",
  "cICP",
  "gAMA",
  "iCCP",
  "mDCV",
  "cLLI",
  "sBIT",
  "sRGB",
  "bKGD",
  "hIST",
  "tRNS",
  "eXIf",
  "pHYs",
  "tIME",
]);
const PNG_BEFORE_PLTE_AND_IDAT = new Set([
  "cHRM",
  "cICP",
  "gAMA",
  "iCCP",
  "mDCV",
  "cLLI",
  "sBIT",
  "sRGB",
]);
const PNG_BEFORE_IDAT = new Set(["bKGD", "hIST", "tRNS", "eXIf", "pHYs", "sPLT"]);
const PNG_METADATA_FREE_OUTPUT_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "tRNS",
  "IEND",
]);
const PNG_DECODE_CHUNKS = new Set([
  ...PNG_METADATA_FREE_OUTPUT_CHUNKS,
  "cHRM",
  "cICP",
  "gAMA",
  "iCCP",
  "mDCV",
  "cLLI",
  "sBIT",
  "sRGB",
]);

const WEBP_RECONSTRUCTION_CHUNKS = new Set([
  "VP8X",
  "ICCP",
  "ALPH",
  "VP8 ",
  "VP8L",
]);

let pngCrcTable: Uint32Array | null = null;

function inspectionFailure(
  code: MediaInspectionErrorCode,
  message: string,
): never {
  throw new MediaInspectionError(code, message);
}

function malformed(message: string): never {
  return inspectionFailure("malformed-source", message);
}

function unsupported(message: string): never {
  return inspectionFailure("unsupported-encoding", message);
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x100 + bytes[offset + 1];
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 0x100;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  );
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += String.fromCharCode(bytes[offset + index]);
  }
  return result;
}

function bytesEqualAt(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  if (offset < 0 || offset + expected.length > bytes.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function asciiEqualsAt(bytes: Uint8Array, offset: number, expected: string): boolean {
  if (offset < 0 || offset + expected.length > bytes.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return true;
}

function validateRasterEnvelope(
  bytes: Uint8Array,
  enforceEncodedSourceLimit: boolean,
): void {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("Raster source must be a Uint8Array");
  }
  if (bytes.byteLength === 0) {
    inspectionFailure("empty-source", "Raster source is empty");
  }
  if (enforceEncodedSourceLimit && bytes.byteLength > MEDIA_MAX_ENCODED_SOURCE_BYTES) {
    inspectionFailure("source-too-large", "Raster source exceeds the encoded byte limit");
  }
}

function validateContainerRecordCount(count: number, format: RasterFormat): void {
  if (count > MEDIA_MAX_CONTAINER_RECORDS) {
    inspectionFailure(
      "source-complexity-exceeded",
      `${format.toUpperCase()} contains too many container records`,
    );
  }
}

function validateDimensions(width: number, height: number): number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    malformed("Raster dimensions are invalid");
  }
  const pixels = width * height;
  if (
    width > MEDIA_MAX_SOURCE_AXIS_PX ||
    height > MEDIA_MAX_SOURCE_AXIS_PX ||
    pixels > MEDIA_MAX_DECODED_PIXELS
  ) {
    inspectionFailure(
      "source-dimensions-exceeded",
      "Raster dimensions exceed the local decoding limits",
    );
  }
  return pixels;
}

function orientedDimensions(
  width: number,
  height: number,
  orientation: ExifOrientation,
): Readonly<{ width: number; height: number }> {
  return orientation >= 5
    ? Object.freeze({ width: height, height: width })
    : Object.freeze({ width, height });
}

function frozenInspection(
  format: RasterFormat,
  width: number,
  height: number,
  orientation: ExifOrientation,
  hasAlpha: boolean,
  hasMetadata: boolean,
): RasterInspection {
  const decodedPixels = validateDimensions(width, height);
  const oriented = orientedDimensions(width, height, orientation);
  const mimeType: RasterMimeType =
    format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : "image/webp";
  return Object.freeze({
    format,
    mimeType,
    width,
    height,
    orientedWidth: oriented.width,
    orientedHeight: oriented.height,
    decodedPixels,
    orientation,
    hasAlpha,
    hasMetadata,
    animated: false,
  });
}

function tiffTypeSize(type: number): number | null {
  switch (type) {
    case 1:
    case 2:
    case 6:
    case 7:
      return 1;
    case 3:
    case 8:
      return 2;
    case 4:
    case 9:
    case 11:
    case 13:
      return 4;
    case 5:
    case 10:
    case 12:
      return 8;
    default:
      return null;
  }
}

function readExifOrientation(
  bytes: Uint8Array,
  dataStart: number,
  dataLength: number,
  allowExifPrefix: boolean,
): ExifOrientation {
  let tiffStart = dataStart;
  let tiffLength = dataLength;
  if (asciiEqualsAt(bytes, tiffStart, "Exif\0\0")) {
    if (!allowExifPrefix) malformed("PNG eXIf contains a forbidden Exif prefix");
    tiffStart += 6;
    tiffLength -= 6;
  }
  if (tiffLength < 8) malformed("Exif TIFF header is truncated");

  const littleEndian = asciiEqualsAt(bytes, tiffStart, "II");
  const bigEndian = asciiEqualsAt(bytes, tiffStart, "MM");
  if (!littleEndian && !bigEndian) malformed("Exif byte order is invalid");

  const read16 = (relativeOffset: number): number => {
    if (relativeOffset < 0 || relativeOffset + 2 > tiffLength) {
      malformed("Exif 16-bit field is out of bounds");
    }
    const absoluteOffset = tiffStart + relativeOffset;
    return littleEndian
      ? readUint16LE(bytes, absoluteOffset)
      : readUint16BE(bytes, absoluteOffset);
  };
  const read32 = (relativeOffset: number): number => {
    if (relativeOffset < 0 || relativeOffset + 4 > tiffLength) {
      malformed("Exif 32-bit field is out of bounds");
    }
    const absoluteOffset = tiffStart + relativeOffset;
    return littleEndian
      ? readUint32LE(bytes, absoluteOffset)
      : readUint32BE(bytes, absoluteOffset);
  };

  if (read16(2) !== 42) malformed("Exif TIFF marker is invalid");
  const ifdOffset = read32(4);
  if (ifdOffset < 8 || ifdOffset + 2 > tiffLength) {
    malformed("Exif primary IFD offset is invalid");
  }

  const entryCount = read16(ifdOffset);
  const entriesStart = ifdOffset + 2;
  const entriesBytes = entryCount * 12;
  if (!Number.isSafeInteger(entriesBytes) || entriesStart + entriesBytes + 4 > tiffLength) {
    malformed("Exif primary IFD is truncated");
  }

  let orientation: ExifOrientation = 1;
  let sawOrientation = false;
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = entriesStart + index * 12;
    const tag = read16(entryOffset);
    const type = read16(entryOffset + 2);
    const count = read32(entryOffset + 4);
    const unitSize = tiffTypeSize(type);
    if (unitSize === null) malformed("Exif IFD contains an unsupported field type");
    const valueBytes = count * unitSize;
    if (!Number.isSafeInteger(valueBytes)) malformed("Exif field length is invalid");
    if (valueBytes > 4) {
      const valueOffset = read32(entryOffset + 8);
      if (valueOffset > tiffLength || valueBytes > tiffLength - valueOffset) {
        malformed("Exif field value is out of bounds");
      }
    }

    if (tag === 0x0112) {
      if (sawOrientation || type !== 3 || count !== 1) {
        malformed("Exif orientation field is malformed or duplicated");
      }
      const value = read16(entryOffset + 8);
      if (value < 1 || value > 8) malformed("Exif orientation value is invalid");
      orientation = value as ExifOrientation;
      sawOrientation = true;
    }
  }

  const nextIfdOffset = read32(entriesStart + entriesBytes);
  if (nextIfdOffset !== 0 && (nextIfdOffset < 8 || nextIfdOffset + 2 > tiffLength)) {
    malformed("Exif thumbnail IFD offset is invalid");
  }
  return orientation;
}

function validateJpegQuantizationTables(
  bytes: Uint8Array,
  start: number,
  end: number,
): void {
  let offset = start;
  let tableCount = 0;
  while (offset < end) {
    const info = bytes[offset];
    const precision = info >>> 4;
    const tableId = info & 0x0f;
    if (precision > 1 || tableId > 3) malformed("JPEG quantization table header is invalid");
    const tableBytes = precision === 0 ? 64 : 128;
    if (offset + 1 + tableBytes > end) malformed("JPEG quantization table is truncated");
    offset += 1 + tableBytes;
    tableCount += 1;
  }
  if (tableCount === 0 || offset !== end) malformed("JPEG quantization segment is empty");
}

function validateJpegHuffmanTables(
  bytes: Uint8Array,
  start: number,
  end: number,
): void {
  let offset = start;
  let tableCount = 0;
  while (offset < end) {
    if (offset + 17 > end) malformed("JPEG Huffman table is truncated");
    const info = bytes[offset];
    if ((info >>> 4) > 1 || (info & 0x0f) > 3) {
      malformed("JPEG Huffman table header is invalid");
    }
    let symbolCount = 0;
    for (let index = 1; index <= 16; index += 1) symbolCount += bytes[offset + index];
    if (symbolCount === 0 || symbolCount > 256 || offset + 17 + symbolCount > end) {
      malformed("JPEG Huffman symbols are invalid or truncated");
    }
    offset += 17 + symbolCount;
    tableCount += 1;
  }
  if (tableCount === 0 || offset !== end) malformed("JPEG Huffman segment is empty");
}

function parseJpeg(bytes: Uint8Array): JpegParseResult {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    malformed("JPEG SOI marker is missing");
  }

  let offset = 2;
  let width = 0;
  let height = 0;
  let frameMarker = 0;
  let frameComponents = new Set<number>();
  const scannedComponents = new Set<number>();
  let sawScan = false;
  let sawExif = false;
  let orientation: ExifOrientation = 1;
  let hasMetadata = false;
  let markerCount = 0;
  const applicationRanges: ByteRange[] = [];
  const decodeOmitRanges: ByteRange[] = [];

  while (offset < bytes.length) {
    markerCount += 1;
    validateContainerRecordCount(markerCount, "jpeg");
    if (bytes[offset] !== 0xff) malformed("JPEG marker prefix is missing");
    const markerStart = offset;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) malformed("JPEG ends inside a marker prefix");
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0x00) malformed("JPEG contains a stuffed byte outside scan data");
    if (marker === 0xd9) {
      if (frameMarker === 0 || !sawScan) malformed("JPEG terminates before image data");
      if (offset !== bytes.length) malformed("JPEG contains trailing bytes after EOI");
      if ([...frameComponents].some((component) => !scannedComponents.has(component))) {
        malformed("JPEG scan data omits a frame component");
      }
      const inspection = frozenInspection(
        "jpeg",
        width,
        height,
        orientation,
        false,
        hasMetadata,
      );
      return Object.freeze({
        inspection,
        applicationRanges: Object.freeze(applicationRanges),
        decodeOmitRanges: Object.freeze(decodeOmitRanges),
      });
    }
    if (marker === 0xd8) malformed("JPEG contains a duplicate SOI marker");
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      malformed("JPEG standalone marker appears outside entropy data");
    }
    if (JPEG_ALL_SOF.has(marker) && !JPEG_SUPPORTED_SOF.has(marker)) {
      unsupported("JPEG frame encoding is unsupported");
    }
    if (
      marker === 0xc8 ||
      marker === 0xcc ||
      marker === 0xdc ||
      marker === 0xde ||
      marker === 0xdf ||
      (marker >= 0xf0 && marker <= 0xfd) ||
      marker < 0xc0
    ) {
      unsupported("JPEG marker encoding is unsupported");
    }
    if (offset + 2 > bytes.length) malformed("JPEG segment length is truncated");
    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2) malformed("JPEG segment length is invalid");
    const dataStart = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > bytes.length) malformed("JPEG segment exceeds the source length");

    if (JPEG_SUPPORTED_SOF.has(marker)) {
      if (frameMarker !== 0) malformed("JPEG contains multiple frame headers");
      if (segmentLength < 11) malformed("JPEG frame header is truncated");
      const precision = bytes[dataStart];
      height = readUint16BE(bytes, dataStart + 1);
      width = readUint16BE(bytes, dataStart + 3);
      const componentCount = bytes[dataStart + 5];
      if (precision !== 8 || (componentCount !== 1 && componentCount !== 3)) {
        unsupported("JPEG precision or component layout is unsupported");
      }
      if (segmentLength !== 8 + componentCount * 3) {
        malformed("JPEG frame component table length is invalid");
      }
      const components = new Set<number>();
      for (let index = 0; index < componentCount; index += 1) {
        const componentOffset = dataStart + 6 + index * 3;
        const id = bytes[componentOffset];
        const sampling = bytes[componentOffset + 1];
        const horizontal = sampling >>> 4;
        const vertical = sampling & 0x0f;
        const quantizationTable = bytes[componentOffset + 2];
        if (
          components.has(id) ||
          horizontal < 1 ||
          horizontal > 4 ||
          vertical < 1 ||
          vertical > 4 ||
          quantizationTable > 3
        ) {
          malformed("JPEG frame component table is invalid");
        }
        components.add(id);
      }
      validateDimensions(width, height);
      frameComponents = components;
      frameMarker = marker;
    } else if (marker === 0xdb) {
      validateJpegQuantizationTables(bytes, dataStart, segmentEnd);
    } else if (marker === 0xc4) {
      validateJpegHuffmanTables(bytes, dataStart, segmentEnd);
    } else if (marker === 0xdd) {
      if (segmentLength !== 4) malformed("JPEG restart interval segment is invalid");
    } else if (marker === 0xda) {
      if (frameMarker === 0) malformed("JPEG scan appears before the frame header");
      if (segmentLength < 8) malformed("JPEG scan header is truncated");
      const scanComponentCount = bytes[dataStart];
      if (
        scanComponentCount < 1 ||
        scanComponentCount > frameComponents.size ||
        segmentLength !== 6 + scanComponentCount * 2
      ) {
        malformed("JPEG scan component table length is invalid");
      }
      const scanIds = new Set<number>();
      for (let index = 0; index < scanComponentCount; index += 1) {
        const scanOffset = dataStart + 1 + index * 2;
        const id = bytes[scanOffset];
        const tableSelectors = bytes[scanOffset + 1];
        if (
          !frameComponents.has(id) ||
          scanIds.has(id) ||
          (tableSelectors >>> 4) > 3 ||
          (tableSelectors & 0x0f) > 3
        ) {
          malformed("JPEG scan component table is invalid");
        }
        scanIds.add(id);
        scannedComponents.add(id);
      }
      const spectralStart = bytes[dataStart + 1 + scanComponentCount * 2];
      const spectralEnd = bytes[dataStart + 2 + scanComponentCount * 2];
      const approximation = bytes[dataStart + 3 + scanComponentCount * 2];
      const successiveHigh = approximation >>> 4;
      const successiveLow = approximation & 0x0f;
      if (frameMarker === 0xc2) {
        if (
          spectralStart > spectralEnd ||
          spectralEnd > 63 ||
          (spectralStart === 0 && spectralEnd !== 0) ||
          (scanComponentCount > 1 && spectralStart !== 0) ||
          successiveHigh > 13 ||
          successiveLow > 13 ||
          (successiveHigh !== 0 && successiveHigh !== successiveLow + 1)
        ) {
          malformed("Progressive JPEG scan parameters are invalid");
        }
      } else if (
        spectralStart !== 0 ||
        spectralEnd !== 63 ||
        successiveHigh !== 0 ||
        successiveLow !== 0
      ) {
        malformed("Sequential JPEG scan parameters are invalid");
      }

      sawScan = true;
      offset = segmentEnd;
      let foundNextMarker = false;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const entropyMarkerStart = offset;
        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
        if (offset >= bytes.length) malformed("JPEG scan data is truncated");
        const entropyMarker = bytes[offset];
        if (entropyMarker === 0x00 || (entropyMarker >= 0xd0 && entropyMarker <= 0xd7)) {
          offset += 1;
          continue;
        }
        offset = entropyMarkerStart;
        foundNextMarker = true;
        break;
      }
      if (!foundNextMarker) malformed("JPEG is missing its EOI marker");
      continue;
    } else if (marker >= 0xe0 && marker <= 0xef) {
      hasMetadata = true;
      const range = Object.freeze({ start: markerStart, end: segmentEnd });
      applicationRanges.push(range);
      // ICC (APP2) and Adobe color-transform (APP14) data may affect pixel
      // interpretation. Keep them only in the ephemeral decode copy.
      if (marker !== 0xe2 && marker !== 0xee) decodeOmitRanges.push(range);
      if (marker === 0xe1 && asciiEqualsAt(bytes, dataStart, "Exif\0\0")) {
        if (sawExif) malformed("JPEG contains multiple Exif application segments");
        orientation = readExifOrientation(
          bytes,
          dataStart,
          segmentEnd - dataStart,
          true,
        );
        sawExif = true;
      }
    } else if (marker === 0xfe) {
      hasMetadata = true;
      const range = Object.freeze({ start: markerStart, end: segmentEnd });
      applicationRanges.push(range);
      decodeOmitRanges.push(range);
    } else if (marker !== 0xc4 && marker !== 0xdb && marker !== 0xdd) {
      unsupported("JPEG contains an unsupported structural segment");
    }

    offset = segmentEnd;
  }

  malformed("JPEG is missing its EOI marker");
}

function getPngCrcTable(): Uint32Array {
  if (pngCrcTable) return pngCrcTable;
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  pngCrcTable = table;
  return table;
}

export function pngChunkCrc(
  bytes: Uint8Array,
  start: number = 0,
  end: number = bytes.length,
): number {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end > bytes.length
  ) {
    throw new RangeError("PNG CRC range is invalid");
  }
  const table = getPngCrcTable();
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findNullByte(bytes: Uint8Array, start: number, end: number): number {
  for (let index = start; index < end; index += 1) {
    if (bytes[index] === 0) return index;
  }
  return -1;
}

function validatePngKeyword(bytes: Uint8Array, start: number, end: number): number {
  const separator = findNullByte(bytes, start, end);
  const length = separator - start;
  if (separator < 0 || length < 1 || length > 79) {
    malformed("PNG text keyword is invalid");
  }
  return separator;
}

function validatePngAncillaryChunk(
  bytes: Uint8Array,
  chunk: PngChunk,
  colorType: number,
  bitDepth: number,
  paletteEntries: number,
): void {
  const { type, dataStart, length } = chunk;
  const dataEnd = dataStart + length;
  switch (type) {
    case "cHRM":
      if (length !== 32) malformed("PNG cHRM length is invalid");
      break;
    case "cICP":
      if (length !== 4 || bytes[dataStart + 2] !== 0 || bytes[dataStart + 3] > 1) {
        malformed("PNG cICP fields are invalid");
      }
      break;
    case "gAMA":
      if (length !== 4 || readUint32BE(bytes, dataStart) === 0) {
        malformed("PNG gAMA value is invalid");
      }
      break;
    case "iCCP": {
      const separator = validatePngKeyword(bytes, dataStart, dataEnd);
      if (separator + 2 >= dataEnd || bytes[separator + 1] !== 0) {
        malformed("PNG iCCP profile is invalid");
      }
      break;
    }
    case "mDCV":
      if (length !== 24) malformed("PNG mDCV length is invalid");
      break;
    case "cLLI":
      if (length !== 8) malformed("PNG cLLI length is invalid");
      break;
    case "sBIT": {
      const expectedLength = colorType === 0 ? 1 : colorType === 2 || colorType === 3 ? 3 : colorType === 4 ? 2 : 4;
      if (length !== expectedLength) malformed("PNG sBIT length is invalid");
      const maximum = colorType === 3 ? 8 : bitDepth;
      for (let offset = dataStart; offset < dataEnd; offset += 1) {
        if (bytes[offset] < 1 || bytes[offset] > maximum) malformed("PNG sBIT value is invalid");
      }
      break;
    }
    case "sRGB":
      if (length !== 1 || bytes[dataStart] > 3) malformed("PNG sRGB value is invalid");
      break;
    case "bKGD": {
      const expectedLength = colorType === 3 ? 1 : colorType === 0 || colorType === 4 ? 2 : 6;
      if (length !== expectedLength) malformed("PNG bKGD length is invalid");
      if (colorType === 3 && bytes[dataStart] >= paletteEntries) {
        malformed("PNG bKGD palette index is invalid");
      }
      break;
    }
    case "hIST":
      if (paletteEntries === 0 || length !== paletteEntries * 2) {
        malformed("PNG hIST length is invalid");
      }
      break;
    case "tRNS":
      if (
        (colorType === 0 && length !== 2) ||
        (colorType === 2 && length !== 6) ||
        (colorType === 3 && (paletteEntries === 0 || length < 1 || length > paletteEntries)) ||
        colorType === 4 ||
        colorType === 6
      ) {
        malformed("PNG tRNS chunk is invalid for its color type");
      }
      break;
    case "pHYs":
      if (length !== 9 || bytes[dataStart + 8] > 1) malformed("PNG pHYs fields are invalid");
      break;
    case "sPLT": {
      const separator = validatePngKeyword(bytes, dataStart, dataEnd);
      if (separator + 2 > dataEnd) malformed("PNG sPLT header is truncated");
      const sampleDepth = bytes[separator + 1];
      const entryBytes = sampleDepth === 8 ? 6 : sampleDepth === 16 ? 10 : 0;
      const payloadBytes = dataEnd - (separator + 2);
      if (entryBytes === 0 || payloadBytes === 0 || payloadBytes % entryBytes !== 0) {
        malformed("PNG sPLT entries are invalid");
      }
      break;
    }
    case "tIME":
      if (
        length !== 7 ||
        bytes[dataStart + 2] < 1 ||
        bytes[dataStart + 2] > 12 ||
        bytes[dataStart + 3] < 1 ||
        bytes[dataStart + 3] > 31 ||
        bytes[dataStart + 4] > 23 ||
        bytes[dataStart + 5] > 59 ||
        bytes[dataStart + 6] > 60
      ) {
        malformed("PNG tIME fields are invalid");
      }
      break;
    case "tEXt":
      validatePngKeyword(bytes, dataStart, dataEnd);
      break;
    case "zTXt": {
      const separator = validatePngKeyword(bytes, dataStart, dataEnd);
      if (separator + 2 >= dataEnd || bytes[separator + 1] !== 0) {
        malformed("PNG zTXt payload is invalid");
      }
      break;
    }
    case "iTXt": {
      let cursor = validatePngKeyword(bytes, dataStart, dataEnd) + 1;
      if (cursor + 2 > dataEnd || bytes[cursor] > 1 || bytes[cursor + 1] !== 0) {
        malformed("PNG iTXt compression fields are invalid");
      }
      cursor += 2;
      const languageEnd = findNullByte(bytes, cursor, dataEnd);
      if (languageEnd < 0) malformed("PNG iTXt language tag is truncated");
      cursor = languageEnd + 1;
      const translatedEnd = findNullByte(bytes, cursor, dataEnd);
      if (translatedEnd < 0) malformed("PNG iTXt translated keyword is truncated");
      break;
    }
    default:
      break;
  }
}

function parsePng(bytes: Uint8Array): PngParseResult {
  if (!bytesEqualAt(bytes, 0, PNG_SIGNATURE)) malformed("PNG signature is invalid");
  let offset = PNG_SIGNATURE.length;
  const chunks: PngChunk[] = [];
  const seen = new Set<string>();
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let paletteEntries = 0;
  let sawIdat = false;
  let idatEnded = false;
  let idatBytes = 0;
  let orientation: ExifOrientation = 1;
  let hasMetadata = false;
  let hasTransparencyChunk = false;
  let chunkCount = 0;

  while (offset < bytes.length) {
    chunkCount += 1;
    validateContainerRecordCount(chunkCount, "png");
    if (offset + 12 > bytes.length) malformed("PNG chunk header is truncated");
    const chunkStart = offset;
    const length = readUint32BE(bytes, offset);
    if (length > 0x7fffffff) malformed("PNG chunk length exceeds the format limit");
    const typeStart = offset + 4;
    for (let index = 0; index < 4; index += 1) {
      const value = bytes[typeStart + index];
      const isLetter = (value >= 65 && value <= 90) || (value >= 97 && value <= 122);
      if (!isLetter) malformed("PNG chunk type contains a non-letter byte");
    }
    if ((bytes[typeStart + 2] & 0x20) !== 0) malformed("PNG chunk reserved bit is invalid");
    const type = asciiAt(bytes, typeStart, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.length) malformed("PNG chunk is truncated");
    const expectedCrc = readUint32BE(bytes, dataEnd);
    const actualCrc = pngChunkCrc(bytes, typeStart, dataEnd);
    if (expectedCrc !== actualCrc) malformed("PNG chunk CRC is invalid");

    const chunk = Object.freeze({
      type,
      start: chunkStart,
      dataStart,
      length,
      end: chunkEnd,
    });
    chunks.push(chunk);

    if (chunks.length === 1 && type !== "IHDR") malformed("PNG IHDR is not the first chunk");
    if (PNG_APNG_CHUNKS.has(type)) {
      inspectionFailure("animated-source", "Animated PNG input is not supported");
    }
    if (PNG_SINGLE_CHUNKS.has(type)) {
      if (seen.has(type)) malformed(`PNG ${type} chunk is duplicated`);
      seen.add(type);
    }
    const ancillary = (bytes[typeStart] & 0x20) !== 0;
    if (!ancillary && !PNG_KNOWN_CRITICAL.has(type)) {
      unsupported("PNG contains an unknown critical chunk");
    }

    if (type === "IHDR") {
      if (length !== 13) malformed("PNG IHDR length is invalid");
      width = readUint32BE(bytes, dataStart);
      height = readUint32BE(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      const allowedBitDepths: Readonly<Record<number, readonly number[]>> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (!allowedBitDepths[colorType]?.includes(bitDepth)) {
        unsupported("PNG color type or bit depth is unsupported");
      }
      if (
        bytes[dataStart + 10] !== 0 ||
        bytes[dataStart + 11] !== 0 ||
        bytes[dataStart + 12] > 1
      ) {
        unsupported("PNG compression, filter, or interlace method is unsupported");
      }
      validateDimensions(width, height);
    } else if (!seen.has("IHDR")) {
      malformed("PNG chunk appears before IHDR");
    } else if (type === "PLTE") {
      if (sawIdat || length === 0 || length % 3 !== 0 || length > 768) {
        malformed("PNG PLTE length or order is invalid");
      }
      if (colorType === 0 || colorType === 4) malformed("PNG PLTE is forbidden for grayscale data");
      paletteEntries = length / 3;
      if (colorType === 3 && paletteEntries > 2 ** bitDepth) {
        malformed("PNG palette has too many entries for its bit depth");
      }
    } else if (type === "IDAT") {
      if (idatEnded) malformed("PNG IDAT chunks are not consecutive");
      if (colorType === 3 && paletteEntries === 0) malformed("Indexed PNG is missing PLTE");
      sawIdat = true;
      idatBytes += length;
    } else {
      if (sawIdat) idatEnded = true;
      if (type === "IEND") {
        if (length !== 0 || !sawIdat || idatBytes === 0) {
          malformed("PNG IEND or IDAT structure is invalid");
        }
        if (chunkEnd !== bytes.length) malformed("PNG contains bytes after IEND");
      } else {
        if (PNG_BEFORE_PLTE_AND_IDAT.has(type) && (paletteEntries > 0 || sawIdat)) {
          malformed(`PNG ${type} chunk order is invalid`);
        }
        if (PNG_BEFORE_IDAT.has(type) && sawIdat) {
          malformed(`PNG ${type} chunk appears after IDAT`);
        }
        if ((type === "bKGD" || type === "hIST" || type === "tRNS") && colorType === 3 && paletteEntries === 0) {
          malformed(`PNG ${type} chunk appears before PLTE`);
        }
        validatePngAncillaryChunk(bytes, chunk, colorType, bitDepth, paletteEntries);
        if (type === "eXIf") {
          orientation = readExifOrientation(bytes, dataStart, length, false);
        }
        if (type === "tRNS") hasTransparencyChunk = true;
        if (ancillary && type !== "tRNS") hasMetadata = true;
      }
    }

    offset = chunkEnd;
    if (type === "IEND") break;
  }

  if (!seen.has("IHDR") || !seen.has("IEND")) malformed("PNG is missing IHDR or IEND");
  if (seen.has("iCCP") && seen.has("sRGB")) malformed("PNG contains conflicting iCCP and sRGB chunks");
  if (seen.has("mDCV") && !seen.has("cICP")) malformed("PNG mDCV is missing its required cICP chunk");
  if (colorType === 3 && paletteEntries === 0) malformed("Indexed PNG is missing PLTE");

  const hasAlpha = colorType === 4 || colorType === 6 || hasTransparencyChunk;
  return Object.freeze({
    inspection: frozenInspection(
      "png",
      width,
      height,
      orientation,
      hasAlpha,
      hasMetadata,
    ),
    chunks: Object.freeze(chunks),
  });
}

function parseVp8Dimensions(
  bytes: Uint8Array,
  chunk: WebPChunk,
): Readonly<{ width: number; height: number; hasAlpha: false }> {
  if (chunk.length < 10) malformed("WebP VP8 frame header is truncated");
  const start = chunk.dataStart;
  const frameTag = bytes[start] + bytes[start + 1] * 0x100 + bytes[start + 2] * 0x10000;
  const keyFrame = (frameTag & 1) === 0;
  const version = (frameTag >>> 1) & 0x07;
  const showFrame = ((frameTag >>> 4) & 1) === 1;
  const firstPartitionLength = frameTag >>> 5;
  if (
    !keyFrame ||
    version > 3 ||
    !showFrame ||
    firstPartitionLength === 0 ||
    firstPartitionLength > chunk.length - 10 ||
    !bytesEqualAt(bytes, start + 3, [0x9d, 0x01, 0x2a])
  ) {
    malformed("WebP VP8 frame header is invalid");
  }
  const width = readUint16LE(bytes, start + 6) & 0x3fff;
  const height = readUint16LE(bytes, start + 8) & 0x3fff;
  validateDimensions(width, height);
  return Object.freeze({ width, height, hasAlpha: false });
}

function parseVp8lDimensions(
  bytes: Uint8Array,
  chunk: WebPChunk,
): Readonly<{ width: number; height: number; hasAlpha: true }> {
  if (chunk.length < 5 || bytes[chunk.dataStart] !== 0x2f) {
    malformed("WebP VP8L frame header is invalid or truncated");
  }
  const start = chunk.dataStart;
  const width = 1 + bytes[start + 1] + ((bytes[start + 2] & 0x3f) << 8);
  const height =
    1 +
    (bytes[start + 2] >>> 6) +
    (bytes[start + 3] << 2) +
    ((bytes[start + 4] & 0x0f) << 10);
  if ((bytes[start + 4] & 0xe0) !== 0) malformed("WebP VP8L version bits are invalid");
  validateDimensions(width, height);
  // VP8L's alpha_is_used bit is only an encoder hint and cannot safely prove
  // opacity. Preserve an alpha-capable output for every lossless bitstream.
  return Object.freeze({ width, height, hasAlpha: true });
}

function parseWebPChunks(bytes: Uint8Array): readonly WebPChunk[] {
  if (
    bytes.length < 20 ||
    !asciiEqualsAt(bytes, 0, "RIFF") ||
    !asciiEqualsAt(bytes, 8, "WEBP")
  ) {
    malformed("WebP RIFF or WEBP marker is invalid");
  }
  const riffSize = readUint32LE(bytes, 4);
  if ((riffSize & 1) !== 0 || riffSize + 8 !== bytes.length) {
    malformed("WebP RIFF length does not match the source");
  }

  const chunks: WebPChunk[] = [];
  let offset = 12;
  let chunkCount = 0;
  while (offset < bytes.length) {
    chunkCount += 1;
    validateContainerRecordCount(chunkCount, "webp");
    if (offset + 8 > bytes.length) malformed("WebP chunk header is truncated");
    for (let index = 0; index < 4; index += 1) {
      const value = bytes[offset + index];
      if (value < 0x20 || value > 0x7e) malformed("WebP chunk FourCC is invalid");
    }
    const type = asciiAt(bytes, offset, 4);
    const length = readUint32LE(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const paddedEnd = dataEnd + (length & 1);
    if (dataEnd < dataStart || paddedEnd > bytes.length) malformed("WebP chunk is truncated");
    if ((length & 1) !== 0 && bytes[dataEnd] !== 0) malformed("WebP chunk padding is nonzero");
    chunks.push(Object.freeze({ type, start: offset, dataStart, length, end: paddedEnd }));
    offset = paddedEnd;
  }
  if (offset !== bytes.length || chunks.length === 0) malformed("WebP chunk structure is incomplete");
  return Object.freeze(chunks);
}

function parseWebP(bytes: Uint8Array): WebPParseResult {
  const chunks = parseWebPChunks(bytes);
  const first = chunks[0];
  if (first.type === "VP8 " || first.type === "VP8L") {
    if (chunks.length !== 1) malformed("Simple WebP contains unexpected extra chunks");
    const frame = first.type === "VP8 "
      ? parseVp8Dimensions(bytes, first)
      : parseVp8lDimensions(bytes, first);
    return Object.freeze({
      inspection: frozenInspection(
        "webp",
        frame.width,
        frame.height,
        1,
        frame.hasAlpha,
        false,
      ),
      chunks,
      extended: false,
    });
  }
  if (first.type !== "VP8X") unsupported("WebP does not begin with VP8, VP8L, or VP8X");
  if (first.length !== 10) malformed("WebP VP8X length is invalid");

  const flags = bytes[first.dataStart];
  if ((flags & 0xc1) !== 0 || !bytesEqualAt(bytes, first.dataStart + 1, [0, 0, 0])) {
    malformed("WebP VP8X reserved bits are nonzero");
  }
  if ((flags & 0x02) !== 0) {
    inspectionFailure("animated-source", "Animated WebP input is not supported");
  }
  const canvasWidth = 1 +
    bytes[first.dataStart + 4] +
    bytes[first.dataStart + 5] * 0x100 +
    bytes[first.dataStart + 6] * 0x10000;
  const canvasHeight = 1 +
    bytes[first.dataStart + 7] +
    bytes[first.dataStart + 8] * 0x100 +
    bytes[first.dataStart + 9] * 0x10000;
  validateDimensions(canvasWidth, canvasHeight);

  let sawIcc = false;
  let sawAlphaChunk = false;
  let sawBitstream = false;
  let sawExif = false;
  let sawXmp = false;
  let orientation: ExifOrientation = 1;
  let frame: Readonly<{ width: number; height: number; hasAlpha: boolean }> | null = null;
  let hasMetadata = false;
  let bitstreamType = "";
  let alphaCompression = -1;

  for (let index = 1; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (chunk.type === "ANIM" || chunk.type === "ANMF") {
      inspectionFailure("animated-source", "Animated WebP input is not supported");
    }
    switch (chunk.type) {
      case "VP8X":
        malformed("WebP contains multiple VP8X chunks");
        break;
      case "ICCP":
        if (sawIcc || sawAlphaChunk || sawBitstream || chunk.length === 0) {
          malformed("WebP ICCP count, order, or length is invalid");
        }
        sawIcc = true;
        hasMetadata = true;
        break;
      case "ALPH":
        if (sawAlphaChunk || sawBitstream || chunk.length < 2) {
          malformed("WebP ALPH count, order, or length is invalid");
        }
        if (
          (bytes[chunk.dataStart] & 0xc0) !== 0 ||
          ((bytes[chunk.dataStart] >>> 4) & 0x03) > 1 ||
          (bytes[chunk.dataStart] & 0x03) > 1
        ) {
          malformed("WebP ALPH header is invalid");
        }
        sawAlphaChunk = true;
        alphaCompression = bytes[chunk.dataStart] & 0x03;
        break;
      case "VP8 ":
      case "VP8L":
        if (sawBitstream) malformed("WebP contains multiple image bitstreams");
        if (chunk.type === "VP8L" && sawAlphaChunk) {
          malformed("WebP VP8L must not be paired with ALPH");
        }
        frame = chunk.type === "VP8 "
          ? parseVp8Dimensions(bytes, chunk)
          : parseVp8lDimensions(bytes, chunk);
        bitstreamType = chunk.type;
        sawBitstream = true;
        break;
      case "EXIF":
        if (sawExif || chunk.length === 0) malformed("WebP EXIF count or length is invalid");
        orientation = readExifOrientation(bytes, chunk.dataStart, chunk.length, true);
        sawExif = true;
        hasMetadata = true;
        break;
      case "XMP ":
        if (sawXmp || chunk.length === 0) malformed("WebP XMP count or length is invalid");
        sawXmp = true;
        hasMetadata = true;
        break;
      default:
        hasMetadata = true;
        break;
    }
  }

  if (!frame || !sawBitstream) malformed("WebP extended image is missing its bitstream");
  if (frame.width !== canvasWidth || frame.height !== canvasHeight) {
    malformed("WebP VP8X canvas does not match its static image dimensions");
  }
  if (sawAlphaChunk && bitstreamType !== "VP8 ") malformed("WebP ALPH is not paired with VP8");
  if (sawAlphaChunk && alphaCompression === 0 && chunks.find((chunk) => chunk.type === "ALPH")!.length !== 1 + canvasWidth * canvasHeight) {
    malformed("WebP uncompressed ALPH length does not match the canvas");
  }

  const hasAlpha = sawAlphaChunk || frame.hasAlpha;
  if (((flags & 0x20) !== 0) !== sawIcc) malformed("WebP ICC feature flag is inconsistent");
  // VP8L's alpha hint is not authoritative, so lossless inputs are always
  // preserved through PNG and may legitimately omit the VP8X alpha flag.
  if (bitstreamType === "VP8 " && ((flags & 0x10) !== 0) !== hasAlpha) {
    malformed("WebP alpha feature flag is inconsistent");
  }
  if (((flags & 0x08) !== 0) !== sawExif) malformed("WebP Exif feature flag is inconsistent");
  if (((flags & 0x04) !== 0) !== sawXmp) malformed("WebP XMP feature flag is inconsistent");

  return Object.freeze({
    inspection: frozenInspection(
      "webp",
      canvasWidth,
      canvasHeight,
      orientation,
      hasAlpha,
      hasMetadata,
    ),
    chunks,
    extended: true,
  });
}

function detectFormat(bytes: Uint8Array): RasterFormat {
  if (bytesEqualAt(bytes, 0, PNG_SIGNATURE)) return "png";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes.length >= 12 && asciiEqualsAt(bytes, 0, "RIFF") && asciiEqualsAt(bytes, 8, "WEBP")) {
    return "webp";
  }
  inspectionFailure("unsupported-format", "Raster signature is not JPEG, PNG, or WebP");
}

function parseRaster(
  bytes: Uint8Array,
  enforceEncodedSourceLimit: boolean = true,
): JpegParseResult | PngParseResult | WebPParseResult {
  validateRasterEnvelope(bytes, enforceEncodedSourceLimit);
  const format = detectFormat(bytes);
  return format === "jpeg" ? parseJpeg(bytes) : format === "png" ? parsePng(bytes) : parseWebP(bytes);
}

export function inspectRasterBytes(bytes: Uint8Array): RasterInspection {
  return parseRaster(bytes).inspection;
}

/** Inspect bytes produced by the bounded local encoder without applying the source-byte cap. */
export function inspectSanitizedRasterBytes(bytes: Uint8Array): RasterInspection {
  return parseRaster(bytes, false).inspection;
}

function copyExcludingRanges(bytes: Uint8Array, ranges: readonly ByteRange[]): Uint8Array {
  if (ranges.length === 0) return bytes.slice();
  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  let previousEnd = 0;
  let outputLength = bytes.length;
  for (const range of sorted) {
    if (range.start < previousEnd || range.start < 0 || range.end < range.start || range.end > bytes.length) {
      throw new RangeError("Raster byte range is invalid or overlapping");
    }
    outputLength -= range.end - range.start;
    previousEnd = range.end;
  }
  const output = new Uint8Array(outputLength);
  let sourceOffset = 0;
  let outputOffset = 0;
  for (const range of sorted) {
    output.set(bytes.subarray(sourceOffset, range.start), outputOffset);
    outputOffset += range.start - sourceOffset;
    sourceOffset = range.end;
  }
  output.set(bytes.subarray(sourceOffset), outputOffset);
  return output;
}

function rebuildPng(
  bytes: Uint8Array,
  chunks: readonly PngChunk[],
  retainedTypes: ReadonlySet<string>,
): Uint8Array {
  const retained = chunks.filter((chunk) => retainedTypes.has(chunk.type));
  const outputLength = PNG_SIGNATURE.length + retained.reduce((total, chunk) => total + chunk.end - chunk.start, 0);
  const output = new Uint8Array(outputLength);
  output.set(PNG_SIGNATURE, 0);
  let offset = PNG_SIGNATURE.length;
  for (const chunk of retained) {
    output.set(bytes.subarray(chunk.start, chunk.end), offset);
    offset += chunk.end - chunk.start;
  }
  return output;
}

function rebuildWebPForDecode(
  bytes: Uint8Array,
  parsed: WebPParseResult,
): Uint8Array {
  if (!parsed.extended) return bytes.slice();
  const retained = parsed.chunks.filter((chunk) => WEBP_RECONSTRUCTION_CHUNKS.has(chunk.type));
  const outputLength = 12 + retained.reduce((total, chunk) => total + chunk.end - chunk.start, 0);
  const output = new Uint8Array(outputLength);
  output.set(bytes.subarray(0, 12), 0);
  let offset = 12;
  for (const chunk of retained) {
    output.set(bytes.subarray(chunk.start, chunk.end), offset);
    if (chunk.type === "VP8X") {
      output[offset + 8] &= ~0x0c;
    }
    offset += chunk.end - chunk.start;
  }
  writeUint32LE(output, 4, output.length - 8);
  return output;
}

/**
 * Build a decode-only copy with orientation/application metadata removed.
 * Pixel and color-profile payloads remain available to the local decoder.
 */
export function rasterBytesForLocalDecode(bytes: Uint8Array): Uint8Array {
  const parsed = parseRaster(bytes);
  if (parsed.inspection.format === "jpeg") {
    return copyExcludingRanges(bytes, (parsed as JpegParseResult).decodeOmitRanges);
  }
  if (parsed.inspection.format === "png") {
    return rebuildPng(bytes, (parsed as PngParseResult).chunks, PNG_DECODE_CHUNKS);
  }
  return rebuildWebPForDecode(bytes, parsed as WebPParseResult);
}

/** Remove all non-pixel metadata from newly encoded JPEG or PNG bytes. */
export function stripSanitizedRasterMetadata(bytes: Uint8Array): Uint8Array {
  const parsed = parseRaster(bytes, false);
  if (parsed.inspection.format === "jpeg") {
    return copyExcludingRanges(bytes, (parsed as JpegParseResult).applicationRanges);
  }
  if (parsed.inspection.format === "png") {
    return rebuildPng(
      bytes,
      (parsed as PngParseResult).chunks,
      PNG_METADATA_FREE_OUTPUT_CHUNKS,
    );
  }
  unsupported("Sanitized output must be JPEG or PNG");
}
