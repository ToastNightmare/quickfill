/**
 * @jest-environment node
 */

import {
  MEDIA_MAX_CONTAINER_RECORDS,
  MEDIA_MAX_DECODED_PIXELS,
  MEDIA_MAX_ENCODED_SOURCE_BYTES,
  MEDIA_MAX_SANITIZED_EDGE_PX,
  MEDIA_MAX_SANITIZED_PIXELS,
  MEDIA_MAX_SOURCE_AXIS_PX,
  MEDIA_PROCESSING_DEADLINE_MS,
} from "@/lib/media-limits";
import {
  MediaInspectionError,
  inspectRasterBytes,
  inspectSanitizedRasterBytes,
  rasterBytesForLocalDecode,
  stripSanitizedRasterMetadata,
} from "@/lib/media-inspection";
import {
  BROWSER_ALPHA_WEBP,
  BROWSER_OPAQUE_WEBP,
  ONE_PIXEL_JPEG,
  extendedWebpFixture,
  jpegWithApplicationSegmentCount,
  jpegWithExifOrientation,
  pngChunk,
  pngFixture,
  pngWithExifOrientation,
  replaceBytes,
  simpleWebpFixture,
  simpleVp8lFixture,
  truncate,
} from "@/lib/__tests__/fixtures/media-raster-fixtures";

function expectInspectionCode(
  operation: () => unknown,
  code: MediaInspectionError["code"],
): void {
  try {
    operation();
    throw new Error("Expected media inspection to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(MediaInspectionError);
    expect((error as MediaInspectionError).code).toBe(code);
  }
}

function findMarker(bytes: Uint8Array, marker: number): number {
  for (let index = 0; index + 1 < bytes.length; index += 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === marker) return index;
  }
  return -1;
}

describe("Add Media raster limits", () => {
  it("pins every approved hard limit", () => {
    expect(MEDIA_MAX_ENCODED_SOURCE_BYTES).toBe(12 * 1024 * 1024);
    expect(MEDIA_MAX_SOURCE_AXIS_PX).toBe(8_192);
    expect(MEDIA_MAX_DECODED_PIXELS).toBe(16_000_000);
    expect(MEDIA_MAX_CONTAINER_RECORDS).toBe(4_096);
    expect(MEDIA_MAX_SANITIZED_EDGE_PX).toBe(4_096);
    expect(MEDIA_MAX_SANITIZED_PIXELS).toBe(8_000_000);
    expect(MEDIA_PROCESSING_DEADLINE_MS).toBe(15_000);
  });
});

describe("strict JPEG inspection", () => {
  it("accepts a complete supported JPEG and reports its dimensions", () => {
    expect(inspectRasterBytes(ONE_PIXEL_JPEG)).toEqual({
      format: "jpeg",
      mimeType: "image/jpeg",
      width: 2,
      height: 1,
      orientedWidth: 2,
      orientedHeight: 1,
      decodedPixels: 2,
      orientation: 1,
      hasAlpha: false,
      hasMetadata: true,
      animated: false,
    });
  });

  it("parses Exif orientation and swaps the oriented dimensions when required", () => {
    const inspection = inspectRasterBytes(jpegWithExifOrientation(6));
    expect(inspection.orientation).toBe(6);
    expect(inspection.orientedWidth).toBe(1);
    expect(inspection.orientedHeight).toBe(2);
    expect(inspection.hasMetadata).toBe(true);
  });

  it.each([
    ["missing EOI", () => truncate(ONE_PIXEL_JPEG, 2)],
    ["trailing payload", () => Uint8Array.from([...ONE_PIXEL_JPEG, 0])],
    ["oversized segment", () => replaceBytes(ONE_PIXEL_JPEG, 4, [0xff, 0xff])],
  ])("rejects %s", (_label, fixture) => {
    expectInspectionCode(() => inspectRasterBytes(fixture()), "malformed-source");
  });

  it("rejects unsupported JPEG frame encodings", () => {
    const sof = findMarker(ONE_PIXEL_JPEG, 0xc0);
    expect(sof).toBeGreaterThan(0);
    const unsupported = replaceBytes(ONE_PIXEL_JPEG, sof + 1, [0xc3]);
    expectInspectionCode(() => inspectRasterBytes(unsupported), "unsupported-encoding");
  });
});

describe("strict PNG inspection", () => {
  it("validates the exact signature, CRCs, core order, and alpha", () => {
    const inspection = inspectRasterBytes(pngFixture());
    expect(inspection).toMatchObject({
      format: "png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      hasAlpha: true,
      hasMetadata: false,
      animated: false,
    });
  });

  it("parses PNG eXIf orientation", () => {
    const inspection = inspectRasterBytes(pngWithExifOrientation(8));
    expect(inspection.orientation).toBe(8);
    expect(inspection.hasMetadata).toBe(true);
  });

  it("rejects a near-signature spoof", () => {
    const spoof = replaceBytes(pngFixture(), 0, [0x89, 0x50, 0x4e, 0x48]);
    expectInspectionCode(() => inspectRasterBytes(spoof), "unsupported-format");
  });

  it("rejects any invalid chunk CRC", () => {
    const corrupt = pngFixture().slice();
    corrupt[29] ^= 0x01;
    expectInspectionCode(() => inspectRasterBytes(corrupt), "malformed-source");
  });

  it("rejects non-consecutive IDAT chunks", () => {
    const fixture = pngFixture({
      afterIdat: [
        pngChunk("tEXt", Uint8Array.from(Buffer.from("note\0value"))),
        pngChunk("IDAT", Uint8Array.of(1)),
      ],
    });
    expectInspectionCode(() => inspectRasterBytes(fixture), "malformed-source");
  });

  it.each(["acTL", "fcTL", "fdAT"])("rejects the APNG %s chunk", (type) => {
    const fixture = pngFixture({ beforeIdat: [pngChunk(type, new Uint8Array(8))] });
    expectInspectionCode(() => inspectRasterBytes(fixture), "animated-source");
  });

  it("rejects trailing bytes after IEND", () => {
    const fixture = Uint8Array.from([...pngFixture(), 0]);
    expectInspectionCode(() => inspectRasterBytes(fixture), "malformed-source");
  });
});

describe("strict static WebP inspection", () => {
  it.each([
    ["opaque", BROWSER_OPAQUE_WEBP, false],
    ["alpha", BROWSER_ALPHA_WEBP, true],
  ] as const)("accepts a browser-encoded %s WebP", (_label, bytes, hasAlpha) => {
    expect(inspectRasterBytes(bytes)).toMatchObject({
      format: "webp",
      width: 2,
      height: 1,
      hasAlpha,
      hasMetadata: true,
    });
  });

  it("accepts a simple VP8 key frame", () => {
    expect(inspectRasterBytes(simpleWebpFixture(12, 9))).toMatchObject({
      format: "webp",
      mimeType: "image/webp",
      width: 12,
      height: 9,
      hasAlpha: false,
      hasMetadata: false,
    });
  });

  it("conservatively preserves alpha capability when a VP8L alpha hint is clear", () => {
    expect(inspectRasterBytes(simpleVp8lFixture(12, 9, false))).toMatchObject({
      format: "webp",
      width: 12,
      height: 9,
      hasAlpha: true,
    });
    expect(
      inspectRasterBytes(
        extendedWebpFixture({ width: 12, height: 9, lossless: true, alpha: false }),
      ),
    ).toMatchObject({ hasAlpha: true });
  });

  it("accepts application chunks before image data and removes them from decode bytes", () => {
    const source = extendedWebpFixture({ unknownChunksBeforeImage: 1 });
    expect(inspectRasterBytes(source)).toMatchObject({
      format: "webp",
      hasMetadata: true,
    });
    expect(inspectRasterBytes(rasterBytesForLocalDecode(source))).toMatchObject({
      format: "webp",
      hasMetadata: false,
    });
  });

  it("accepts a static extended image while reporting alpha and Exif", () => {
    const inspection = inspectRasterBytes(
      extendedWebpFixture({ width: 2, height: 3, alpha: true, orientation: 6, xmp: true }),
    );
    expect(inspection).toMatchObject({
      width: 2,
      height: 3,
      orientedWidth: 3,
      orientedHeight: 2,
      orientation: 6,
      hasAlpha: true,
      hasMetadata: true,
    });
  });

  it("rejects an incorrect RIFF length and trailing payload", () => {
    const fixture = simpleWebpFixture();
    expectInspectionCode(
      () => inspectRasterBytes(replaceBytes(fixture, 4, [0, 0, 0, 0])),
      "malformed-source",
    );
    expectInspectionCode(
      () => inspectRasterBytes(Uint8Array.from([...fixture, 0, 0])),
      "malformed-source",
    );
  });

  it("rejects animation from either the VP8X flag or animation chunks", () => {
    const animated = extendedWebpFixture({ animated: true });
    expectInspectionCode(
      () => inspectRasterBytes(animated),
      "animated-source",
    );
    // Clear the VP8X animation flag while leaving the ANIM chunk intact.
    expectInspectionCode(
      () => inspectRasterBytes(replaceBytes(animated, 20, [0])),
      "animated-source",
    );
  });

  it("rejects nonzero RIFF padding and inconsistent feature flags", () => {
    const padded = simpleWebpFixture().slice();
    padded[padded.length - 1] = 1;
    expectInspectionCode(() => inspectRasterBytes(padded), "malformed-source");

    const alpha = extendedWebpFixture({ alpha: true });
    expectInspectionCode(
      () => inspectRasterBytes(replaceBytes(alpha, 20, [0])),
      "malformed-source",
    );
  });

  it("rejects ICC data after ALPH reconstruction data", () => {
    expectInspectionCode(
      () => inspectRasterBytes(
        extendedWebpFixture({ alpha: true, icc: true, iccAfterAlpha: true }),
      ),
      "malformed-source",
    );
  });

  it.each([0x20, 0x30])("rejects the reserved ALPH preprocessing value %#", (header) => {
    expectInspectionCode(
      () => inspectRasterBytes(extendedWebpFixture({ alpha: true, alphaHeader: header })),
      "malformed-source",
    );
  });
});

describe("global source bounds", () => {
  it("rejects the encoded-byte limit before parsing attacker-controlled structure", () => {
    const oversized = new Uint8Array(MEDIA_MAX_ENCODED_SOURCE_BYTES + 1);
    expectInspectionCode(() => inspectRasterBytes(oversized), "source-too-large");
  });

  it.each([
    ["width", 8_193, 1],
    ["height", 1, 8_193],
    ["pixel count", 5_000, 4_000],
  ])("rejects the source %s limit", (_label, width, height) => {
    expectInspectionCode(
      () => inspectRasterBytes(pngFixture({ width, height })),
      "source-dimensions-exceeded",
    );
  });

  it.each([
    [
      "JPEG segments",
      () => jpegWithApplicationSegmentCount(MEDIA_MAX_CONTAINER_RECORDS),
    ],
    [
      "PNG chunks",
      () => {
        const applicationChunk = pngChunk("aaAa");
        return pngFixture({
          beforeIdat: Array.from(
            { length: MEDIA_MAX_CONTAINER_RECORDS },
            () => applicationChunk,
          ),
        });
      },
    ],
    [
      "WebP chunks",
      () => extendedWebpFixture({
        unknownChunksBeforeImage: MEDIA_MAX_CONTAINER_RECORDS,
      }),
    ],
  ] as const)("rejects excessive %s before unbounded bookkeeping", (_label, fixture) => {
    expectInspectionCode(
      () => inspectRasterBytes(fixture()),
      "source-complexity-exceeded",
    );
  });
});

describe("decode preparation and sanitized metadata stripping", () => {
  it("removes JPEG orientation, comments, thumbnails, and application segments", () => {
    const decodeBytes = rasterBytesForLocalDecode(jpegWithExifOrientation(6));
    const decodeInspection = inspectRasterBytes(decodeBytes);
    expect(decodeInspection.orientation).toBe(1);

    const stripped = stripSanitizedRasterMetadata(jpegWithExifOrientation(6));
    const inspection = inspectRasterBytes(stripped);
    expect(inspection).toMatchObject({
      format: "jpeg",
      orientation: 1,
      hasMetadata: false,
    });
    expect(stripped).not.toEqual(jpegWithExifOrientation(6));
  });

  it("removes PNG Exif, ICC/application/text metadata while preserving alpha semantics", () => {
    const source = pngFixture({
      beforeIdat: [
        pngChunk("eXIf", exifTiffForTest(6)),
        pngChunk("tEXt", Uint8Array.from(Buffer.from("Comment\0private"))),
      ],
    });
    const stripped = stripSanitizedRasterMetadata(source);
    expect(inspectRasterBytes(stripped)).toMatchObject({
      format: "png",
      orientation: 1,
      hasAlpha: true,
      hasMetadata: false,
    });
  });

  it("allows bounded sanitized PNG output to exceed the encoded source-byte cap", () => {
    const encodedOutput = pngFixture({
      idatData: new Uint8Array(MEDIA_MAX_ENCODED_SOURCE_BYTES),
    });
    expectInspectionCode(
      () => inspectRasterBytes(encodedOutput),
      "source-too-large",
    );

    const stripped = stripSanitizedRasterMetadata(encodedOutput);
    expect(stripped.byteLength).toBeGreaterThan(MEDIA_MAX_ENCODED_SOURCE_BYTES);
    expect(inspectSanitizedRasterBytes(stripped)).toMatchObject({
      format: "png",
      width: 1,
      height: 1,
      hasMetadata: false,
    });
  });

  it("removes WebP Exif, XMP, and unknown application chunks from decode bytes", () => {
    const source = extendedWebpFixture({ orientation: 6, xmp: true, unknownChunk: true });
    const prepared = rasterBytesForLocalDecode(source);
    expect(inspectRasterBytes(prepared)).toMatchObject({
      format: "webp",
      orientation: 1,
      hasMetadata: false,
    });
  });

  it("never permits WebP as sanitized output", () => {
    expectInspectionCode(
      () => stripSanitizedRasterMetadata(simpleWebpFixture()),
      "unsupported-encoding",
    );
  });
});

function exifTiffForTest(orientation: number): Uint8Array {
  // Reuse the public orientation fixture while extracting its PNG eXIf payload.
  const fixture = pngWithExifOrientation(orientation);
  const chunkLength =
    fixture[8] * 0x1000000 +
    fixture[9] * 0x10000 +
    fixture[10] * 0x100 +
    fixture[11];
  const exifChunkStart = 8 + 12 + chunkLength;
  const exifLength =
    fixture[exifChunkStart] * 0x1000000 +
    fixture[exifChunkStart + 1] * 0x10000 +
    fixture[exifChunkStart + 2] * 0x100 +
    fixture[exifChunkStart + 3];
  return fixture.slice(exifChunkStart + 8, exifChunkStart + 8 + exifLength);
}
