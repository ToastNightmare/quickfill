export const ONE_PIXEL_JPEG = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABwn/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdAAYqm//Z",
    "base64",
  ),
);

export const BROWSER_OPAQUE_WEBP = Uint8Array.from(
  Buffer.from(
    "UklGRiICAABXRUJQVlA4WAoAAAAgAAAAAQAAAAAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggNAAAADACAJ0BKgIAAQAAwBIloAJ0ugH4AfgABGgAAP76IZf/d5qw03f1rf/1o5+uif60c/9ZWAA=",
    "base64",
  ),
);

export const BROWSER_ALPHA_WEBP = Uint8Array.from(
  Buffer.from(
    "UklGRi4CAABXRUJQVlA4WAoAAAAwAAAAAQAAAAAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIAwAAAACAgABWUDggNAAAADACAJ0BKgIAAQAAwBIloAJ0ugH4AfgABGgAAP76IZf/d5qw03f1rf/1o5+uif60c/9ZWAA=",
    "base64",
  ),
);

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function uint16Be(value: number): Uint8Array {
  return Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
}

function uint16Le(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function uint24Le(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff);
}

function uint32Be(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function uint32Le(value: number): Uint8Array {
  return Uint8Array.of(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function fixturePngCrc(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function pngChunk(type: string, data: Uint8Array = new Uint8Array()): Uint8Array {
  const typeBytes = ascii(type);
  const crcInput = concatBytes(typeBytes, data);
  return concatBytes(uint32Be(data.length), crcInput, uint32Be(fixturePngCrc(crcInput)));
}

export function exifTiff(orientation: number = 1): Uint8Array {
  return concatBytes(
    ascii("II"),
    Uint8Array.of(0x2a, 0x00),
    uint32Le(8),
    uint16Le(1),
    Uint8Array.of(0x12, 0x01),
    uint16Le(3),
    uint32Le(1),
    uint16Le(orientation),
    Uint8Array.of(0, 0),
    uint32Le(0),
  );
}

export function jpegWithExifOrientation(orientation: number): Uint8Array {
  const payload = concatBytes(ascii("Exif\0\0"), exifTiff(orientation));
  const app1 = concatBytes(Uint8Array.of(0xff, 0xe1), uint16Be(payload.length + 2), payload);
  return concatBytes(ONE_PIXEL_JPEG.subarray(0, 2), app1, ONE_PIXEL_JPEG.subarray(2));
}

export interface BaselineJpegFixtureOptions {
  readonly applicationMetadata?: boolean;
  readonly comment?: boolean;
}

/** Structurally complete grayscale baseline JPEG for encoder-boundary mocks. */
export function baselineJpegFixture(
  width: number,
  height: number,
  options: BaselineJpegFixtureOptions = {},
): Uint8Array {
  const segments: Uint8Array[] = [Uint8Array.of(0xff, 0xd8)];
  if (options.applicationMetadata) {
    const jfif = concatBytes(ascii("JFIF\0"), Uint8Array.of(1, 1, 0, 0, 1, 0, 1, 0, 0));
    segments.push(concatBytes(Uint8Array.of(0xff, 0xe0), uint16Be(jfif.length + 2), jfif));
  }
  if (options.comment) {
    const comment = ascii("private encoder comment");
    segments.push(concatBytes(Uint8Array.of(0xff, 0xfe), uint16Be(comment.length + 2), comment));
  }
  const quantization = concatBytes(Uint8Array.of(0), new Uint8Array(64).fill(1));
  segments.push(
    concatBytes(Uint8Array.of(0xff, 0xdb), uint16Be(quantization.length + 2), quantization),
  );
  const frame = concatBytes(
    Uint8Array.of(8),
    uint16Be(height),
    uint16Be(width),
    Uint8Array.of(1, 1, 0x11, 0),
  );
  segments.push(concatBytes(Uint8Array.of(0xff, 0xc0), uint16Be(frame.length + 2), frame));
  const huffman = concatBytes(
    Uint8Array.of(0),
    Uint8Array.of(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    Uint8Array.of(0),
  );
  segments.push(concatBytes(Uint8Array.of(0xff, 0xc4), uint16Be(huffman.length + 2), huffman));
  const scan = Uint8Array.of(1, 1, 0, 0, 63, 0);
  segments.push(
    concatBytes(Uint8Array.of(0xff, 0xda), uint16Be(scan.length + 2), scan),
    Uint8Array.of(0),
    Uint8Array.of(0xff, 0xd9),
  );
  return concatBytes(...segments);
}

export function jpegWithApplicationSegmentCount(count: number): Uint8Array {
  const baseline = baselineJpegFixture(1, 1);
  const emptyApplicationSegment = Uint8Array.of(0xff, 0xe0, 0, 2);
  return concatBytes(
    baseline.subarray(0, 2),
    ...Array.from({ length: count }, () => emptyApplicationSegment),
    baseline.subarray(2),
  );
}

export interface PngFixtureOptions {
  readonly width?: number;
  readonly height?: number;
  readonly colorType?: 0 | 2 | 3 | 4 | 6;
  readonly bitDepth?: 1 | 2 | 4 | 8 | 16;
  readonly idatData?: Uint8Array;
  readonly beforeIdat?: readonly Uint8Array[];
  readonly afterIdat?: readonly Uint8Array[];
}

export function pngFixture(options: PngFixtureOptions = {}): Uint8Array {
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  const colorType = options.colorType ?? 6;
  const bitDepth = options.bitDepth ?? 8;
  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const ihdr = pngChunk(
    "IHDR",
    concatBytes(
      uint32Be(width),
      uint32Be(height),
      Uint8Array.of(bitDepth, colorType, 0, 0, 0),
    ),
  );
  // Inspection fixtures intentionally keep image data tiny; sanitizer tests
  // replace the browser decoder and exercise every resource boundary.
  const idat = pngChunk(
    "IDAT",
    options.idatData ?? Uint8Array.of(0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01),
  );
  return concatBytes(
    signature,
    ihdr,
    ...(options.beforeIdat ?? []),
    idat,
    ...(options.afterIdat ?? []),
    pngChunk("IEND"),
  );
}

export function pngWithExifOrientation(orientation: number): Uint8Array {
  return pngFixture({ beforeIdat: [pngChunk("eXIf", exifTiff(orientation))] });
}

export function riffChunk(type: string, data: Uint8Array): Uint8Array {
  return concatBytes(
    ascii(type),
    uint32Le(data.length),
    data,
    data.length % 2 === 1 ? Uint8Array.of(0) : new Uint8Array(),
  );
}

function vp8Payload(width: number, height: number): Uint8Array {
  return concatBytes(
    // Key frame, version 0, show_frame 1, first partition length 1.
    Uint8Array.of(0x30, 0x00, 0x00, 0x9d, 0x01, 0x2a),
    uint16Le(width),
    uint16Le(height),
    Uint8Array.of(0),
  );
}

function vp8lPayload(width: number, height: number, alphaHint: boolean): Uint8Array {
  const headerBits =
    (width - 1) |
    ((height - 1) << 14) |
    (alphaHint ? 1 << 28 : 0);
  return concatBytes(Uint8Array.of(0x2f), uint32Le(headerBits));
}

function webpContainer(chunks: readonly Uint8Array[]): Uint8Array {
  const body = concatBytes(ascii("WEBP"), ...chunks);
  return concatBytes(ascii("RIFF"), uint32Le(body.length), body);
}

export function simpleWebpFixture(width: number = 1, height: number = 1): Uint8Array {
  return webpContainer([riffChunk("VP8 ", vp8Payload(width, height))]);
}

export function simpleVp8lFixture(
  width: number = 1,
  height: number = 1,
  alphaHint: boolean = false,
): Uint8Array {
  return webpContainer([riffChunk("VP8L", vp8lPayload(width, height, alphaHint))]);
}

export interface ExtendedWebpFixtureOptions {
  readonly width?: number;
  readonly height?: number;
  readonly alpha?: boolean;
  readonly alphaHeader?: number;
  readonly icc?: boolean;
  readonly iccAfterAlpha?: boolean;
  readonly lossless?: boolean;
  readonly losslessAlphaHint?: boolean;
  readonly animated?: boolean;
  readonly orientation?: number;
  readonly xmp?: boolean;
  readonly unknownChunk?: boolean;
  readonly unknownChunksBeforeImage?: number;
}

export function extendedWebpFixture(options: ExtendedWebpFixtureOptions = {}): Uint8Array {
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  const hasExif = options.orientation !== undefined;
  const hasXmp = options.xmp ?? false;
  const hasAlpha = options.alpha ?? false;
  const hasIcc = options.icc ?? false;
  const lossless = options.lossless ?? false;
  const animated = options.animated ?? false;
  const flags =
    (hasIcc ? 0x20 : 0) |
    (hasAlpha ? 0x10 : 0) |
    (hasExif ? 0x08 : 0) |
    (hasXmp ? 0x04 : 0) |
    (animated ? 0x02 : 0);
  const vp8x = riffChunk(
    "VP8X",
    concatBytes(
      Uint8Array.of(flags, 0, 0, 0),
      uint24Le(width - 1),
      uint24Le(height - 1),
    ),
  );
  const chunks: Uint8Array[] = [vp8x];
  if (animated) chunks.push(riffChunk("ANIM", Uint8Array.of(0, 0, 0, 0, 0, 0)));
  for (let index = 0; index < (options.unknownChunksBeforeImage ?? 0); index += 1) {
    chunks.push(riffChunk("QFIL", new Uint8Array()));
  }
  if (hasIcc && !options.iccAfterAlpha) {
    chunks.push(riffChunk("ICCP", ascii("test profile")));
  }
  if (hasAlpha && !lossless) {
    chunks.push(
      riffChunk(
        "ALPH",
        concatBytes(
          Uint8Array.of(options.alphaHeader ?? 0),
          new Uint8Array(width * height),
        ),
      ),
    );
  }
  if (hasIcc && options.iccAfterAlpha) {
    chunks.push(riffChunk("ICCP", ascii("test profile")));
  }
  chunks.push(
    lossless
      ? riffChunk("VP8L", vp8lPayload(width, height, options.losslessAlphaHint ?? false))
      : riffChunk("VP8 ", vp8Payload(width, height)),
  );
  if (hasExif) {
    chunks.push(
      riffChunk(
        "EXIF",
        concatBytes(ascii("Exif\0\0"), exifTiff(options.orientation)),
      ),
    );
  }
  if (hasXmp) chunks.push(riffChunk("XMP ", ascii("<x:xmpmeta />")));
  if (options.unknownChunk) chunks.push(riffChunk("QFIL", ascii("application metadata")));
  return webpContainer(chunks);
}

export function replaceBytes(
  source: Uint8Array,
  offset: number,
  values: readonly number[],
): Uint8Array {
  const copy = source.slice();
  copy.set(values, offset);
  return copy;
}

export function truncate(source: Uint8Array, bytesToRemove: number = 1): Uint8Array {
  return source.slice(0, Math.max(0, source.length - bytesToRemove));
}
