import {
  MediaInspectionError,
  inspectRasterBytes,
} from "@/lib/media-inspection";
import {
  MediaSanitizationError,
  RasterSanitizationCoordinator,
  exifOrientationTransform,
  sanitizeRasterImage,
  sanitizedRasterDimensions,
} from "@/lib/media-sanitize";
import {
  BROWSER_ALPHA_WEBP,
  BROWSER_OPAQUE_WEBP,
  ONE_PIXEL_JPEG,
  baselineJpegFixture,
  extendedWebpFixture,
  jpegWithExifOrientation,
  pngChunk,
  pngFixture,
  simpleVp8lFixture,
} from "@/lib/__tests__/fixtures/media-raster-fixtures";

type FakeCanvas = {
  width: number;
  height: number;
  getContext: jest.Mock;
  toBlob: jest.Mock;
};

type FakeBitmap = {
  width: number;
  height: number;
  close: jest.Mock;
};

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function fixtureBlob(
  bytes: Uint8Array,
  type: string,
  name?: string,
): Blob {
  const blob = name
    ? new File([ownedBuffer(bytes)], name, { type })
    : new Blob([ownedBuffer(bytes)], { type });
  Object.defineProperty(blob, "arrayBuffer", {
    configurable: true,
    value: jest.fn(async () => ownedBuffer(bytes)),
  });
  return blob;
}

function fakeBitmap(width: number, height: number): FakeBitmap {
  return { width, height, close: jest.fn() };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return new Uint8Array(buffer);
}

function expectSanitizationCode(
  error: unknown,
  code: MediaSanitizationError["code"],
): void {
  expect(error).toBeInstanceOf(MediaSanitizationError);
  expect((error as MediaSanitizationError).code).toBe(code);
}

describe("sanitized raster geometry", () => {
  it("never upscales compliant input", () => {
    expect(sanitizedRasterDimensions(1200, 800)).toEqual({
      width: 1200,
      height: 800,
      scale: 1,
    });
  });

  it("enforces both the maximum edge and sanitized pixel count", () => {
    const edgeBound = sanitizedRasterDimensions(8192, 1000);
    expect(edgeBound).toEqual({ width: 4096, height: 500, scale: 0.5 });

    const pixelBound = sanitizedRasterDimensions(4096, 4096);
    expect(Math.max(pixelBound.width, pixelBound.height)).toBeLessThanOrEqual(4096);
    expect(pixelBound.width * pixelBound.height).toBeLessThanOrEqual(8_000_000);
    expect(pixelBound.width).toBe(pixelBound.height);
  });

  it("defines every Exif orientation transform explicitly", () => {
    expect(exifOrientationTransform(1, 6, 4)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(exifOrientationTransform(2, 6, 4)).toEqual([-1, 0, 0, 1, 6, 0]);
    expect(exifOrientationTransform(3, 6, 4)).toEqual([-1, 0, 0, -1, 6, 4]);
    expect(exifOrientationTransform(4, 6, 4)).toEqual([1, 0, 0, -1, 0, 4]);
    expect(exifOrientationTransform(5, 6, 4)).toEqual([0, 1, 1, 0, 0, 0]);
    expect(exifOrientationTransform(6, 6, 4)).toEqual([0, 1, -1, 0, 4, 0]);
    expect(exifOrientationTransform(7, 6, 4)).toEqual([0, -1, -1, 0, 4, 6]);
    expect(exifOrientationTransform(8, 6, 4)).toEqual([0, -1, 1, 0, 0, 6]);
  });
});

describe("local raster sanitization", () => {
  let canvases: FakeCanvas[];
  let contexts: Array<Record<string, jest.Mock | string | boolean>>;
  let createImageBitmapMock: jest.Mock;
  let encodeOverride: ((canvas: FakeCanvas, type: string, callback: BlobCallback) => void) | null;

  beforeEach(() => {
    canvases = [];
    contexts = [];
    encodeOverride = null;
    createImageBitmapMock = jest.fn();
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: createImageBitmapMock,
    });

    jest.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName !== "canvas") throw new Error(`Unexpected element: ${tagName}`);
      const context: Record<string, jest.Mock | string | boolean> = {
        setTransform: jest.fn(),
        fillRect: jest.fn(),
        drawImage: jest.fn(),
        fillStyle: "",
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
      };
      const canvas: FakeCanvas = {
        width: 0,
        height: 0,
        getContext: jest.fn(() => context),
        toBlob: jest.fn((callback: BlobCallback, type: string) => {
          if (encodeOverride) {
            encodeOverride(canvas, type, callback);
            return;
          }
          const bytes = type === "image/png"
            ? pngFixture({
                width: canvas.width,
                height: canvas.height,
                beforeIdat: [
                  pngChunk("tEXt", Uint8Array.from(Buffer.from("Comment\0encoder metadata"))),
                ],
              })
            : baselineJpegFixture(canvas.width, canvas.height, {
                applicationMetadata: true,
                comment: true,
              });
          callback(fixtureBlob(bytes, type));
        }),
      };
      contexts.push(context);
      canvases.push(canvas);
      return canvas as unknown as HTMLElement;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "createImageBitmap");
  });

  it.each([
    ["JPEG", ONE_PIXEL_JPEG, "image/jpeg", 2, 1, "jpeg", "image/jpeg"],
    ["PNG with alpha", pngFixture(), "image/png", 1, 1, "png", "image/png"],
    ["static WebP", BROWSER_OPAQUE_WEBP, "image/webp", 2, 1, "jpeg", "image/jpeg"],
  ] as const)(
    "fully decodes and re-encodes %s without retaining source bytes",
    async (_label, sourceBytes, sourceType, width, height, outputFormat, outputType) => {
      const bitmap = fakeBitmap(width, height);
      createImageBitmapMock.mockResolvedValue(bitmap);

      const result = await sanitizeRasterImage(fixtureBlob(sourceBytes, sourceType));

      expect(result).toMatchObject({
        format: outputFormat,
        mimeType: outputType,
        width,
        height,
      });
      expect(result.bytes).not.toBe(sourceBytes);
      expect(result.blob.type).toBe(outputType);
      expect(inspectRasterBytes(result.bytes)).toMatchObject({
        format: outputFormat,
        hasMetadata: false,
        orientation: 1,
      });
      expect(bitmap.close).toHaveBeenCalledTimes(1);
      expect(contexts[0].drawImage).toHaveBeenCalledTimes(1);
      expect(canvases[0].toBlob).toHaveBeenCalledTimes(1);
      expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
    },
  );

  it("removes orientation metadata before decode and bakes the normalized orientation", async () => {
    const bitmap = fakeBitmap(2, 1);
    createImageBitmapMock.mockResolvedValue(bitmap);

    const result = await sanitizeRasterImage(
      fixtureBlob(jpegWithExifOrientation(6), "image/jpeg", "portrait.jpg"),
    );

    expect(result).toMatchObject({ width: 1, height: 2, format: "jpeg" });
    const decodeBlob = createImageBitmapMock.mock.calls[0][0] as Blob;
    const decodeBytes = await readBlobBytes(decodeBlob);
    expect(inspectRasterBytes(decodeBytes).orientation).toBe(1);
    expect(contexts[0].setTransform).toHaveBeenCalledWith(0, 1, -1, 0, 1, 0);
  });

  it("uses PNG whenever source transparency must be preserved", async () => {
    createImageBitmapMock.mockResolvedValue(fakeBitmap(2, 1));

    const result = await sanitizeRasterImage(
      fixtureBlob(BROWSER_ALPHA_WEBP, "image/webp", "alpha.webp"),
    );

    expect(result.format).toBe("png");
    expect(result.mimeType).toBe("image/png");
    expect(inspectRasterBytes(result.bytes).hasAlpha).toBe(true);
  });

  it("uses PNG for VP8L even when its non-authoritative alpha hint is clear", async () => {
    createImageBitmapMock.mockResolvedValue(fakeBitmap(2, 1));

    const result = await sanitizeRasterImage(
      fixtureBlob(simpleVp8lFixture(2, 1, false), "image/webp", "lossless.webp"),
    );

    expect(result.format).toBe("png");
    expect(result.mimeType).toBe("image/png");
    expect(canvases[0].getContext).toHaveBeenCalledWith("2d", { alpha: true });
  });

  it.each([
    ["MIME", fixtureBlob(ONE_PIXEL_JPEG, "image/png")],
    ["extension", fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg", "spoof.png")],
    ["unsupported extension", fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg", "photo.gif")],
  ])("rejects a spoofed declared %s before decoding", async (_label, source) => {
    const error = await sanitizeRasterImage(source).catch((caught) => caught);
    expectSanitizationCode(error, "source-type-mismatch");
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it("rejects corrupt and animated inputs before decoding", async () => {
    const corrupt = pngFixture().slice();
    corrupt[29] ^= 1;
    const corruptError = await sanitizeRasterImage(fixtureBlob(corrupt, "image/png")).catch(
      (caught) => caught,
    );
    expect(corruptError).toBeInstanceOf(MediaInspectionError);

    const animatedError = await sanitizeRasterImage(
      fixtureBlob(extendedWebpFixture({ animated: true }), "image/webp"),
    ).catch((caught) => caught);
    expect(animatedError).toBeInstanceOf(MediaInspectionError);
    expect((animatedError as MediaInspectionError).code).toBe("animated-source");
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it("fails closed when the encoder returns no bytes and releases all resources", async () => {
    const bitmap = fakeBitmap(2, 1);
    createImageBitmapMock.mockResolvedValue(bitmap);
    encodeOverride = (_canvas, _type, callback) => callback(null);

    const error = await sanitizeRasterImage(fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg")).catch(
      (caught) => caught,
    );

    expectSanitizationCode(error, "encode-failed");
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
  });

  it("rejects encoder format fallback instead of returning original or fallback bytes", async () => {
    createImageBitmapMock.mockResolvedValue(fakeBitmap(2, 1));
    encodeOverride = (canvas, _type, callback) => {
      callback(fixtureBlob(pngFixture({ width: canvas.width, height: canvas.height }), "image/png"));
    };

    const error = await sanitizeRasterImage(fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg")).catch(
      (caught) => caught,
    );
    expectSanitizationCode(error, "output-invalid");
  });

  it("cancels a pending decoder and closes a bitmap that resolves late", async () => {
    const decode = deferred<ImageBitmap>();
    const lateBitmap = fakeBitmap(2, 1);
    createImageBitmapMock.mockReturnValue(decode.promise);
    const controller = new AbortController();
    const result = sanitizeRasterImage(fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg"), {
      signal: controller.signal,
    }).catch((caught) => caught);
    await flushMicrotasks();

    controller.abort();
    const error = await result;
    expectSanitizationCode(error, "aborted");
    decode.resolve(lateBitmap as unknown as ImageBitmap);
    await flushMicrotasks();
    expect(lateBitmap.close).toHaveBeenCalledTimes(1);
    expect(canvases).toHaveLength(0);
  });

  it("cancels pending encoding and immediately releases the bitmap and canvas", async () => {
    const bitmap = fakeBitmap(2, 1);
    createImageBitmapMock.mockResolvedValue(bitmap);
    let lateCallback: BlobCallback | null = null;
    encodeOverride = (_canvas, _type, callback) => {
      lateCallback = callback;
    };
    const controller = new AbortController();
    const result = sanitizeRasterImage(fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg"), {
      signal: controller.signal,
    }).catch((caught) => caught);
    await flushMicrotasks();
    expect(lateCallback).not.toBeNull();

    controller.abort();
    expectSanitizationCode(await result, "aborted");
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });

    lateCallback!(fixtureBlob(baselineJpegFixture(2, 1), "image/jpeg"));
    await flushMicrotasks();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("enforces the 15-second deadline and clears its timer", async () => {
    jest.useFakeTimers();
    const decode = deferred<ImageBitmap>();
    createImageBitmapMock.mockReturnValue(decode.promise);
    const result = sanitizeRasterImage(fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg")).catch(
      (caught) => caught,
    );
    await flushMicrotasks();

    jest.advanceTimersByTime(15_000);
    const error = await result;
    expectSanitizationCode(error, "timed-out");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("unlinks the deadline timer after successful processing", async () => {
    jest.useFakeTimers();
    createImageBitmapMock.mockResolvedValue(fakeBitmap(2, 1));

    await sanitizeRasterImage(fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg"));

    expect(jest.getTimerCount()).toBe(0);
  });

  it("never performs network work", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    createImageBitmapMock.mockResolvedValue(fakeBitmap(2, 1));
    try {
      await sanitizeRasterImage(fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg"));
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch;
      else Reflect.deleteProperty(globalThis, "fetch");
    }
  });

  it("rejects stale generations and closes their late resources", async () => {
    const firstDecode = deferred<ImageBitmap>();
    const firstBitmap = fakeBitmap(2, 1);
    const secondBitmap = fakeBitmap(2, 1);
    createImageBitmapMock
      .mockReturnValueOnce(firstDecode.promise)
      .mockResolvedValueOnce(secondBitmap);
    const coordinator = new RasterSanitizationCoordinator();
    const source = fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg");
    const first = coordinator.sanitize(source).catch((caught) => caught);
    await flushMicrotasks();
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);

    const second = coordinator.sanitize(source);
    const firstError = await first;
    expectSanitizationCode(firstError, "stale-generation");
    await expect(second).resolves.toMatchObject({ format: "jpeg" });

    firstDecode.resolve(firstBitmap as unknown as ImageBitmap);
    await flushMicrotasks();
    expect(firstBitmap.close).toHaveBeenCalledTimes(1);
    expect(secondBitmap.close).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it("cancels and permanently disposes a coordinator", async () => {
    const decode = deferred<ImageBitmap>();
    createImageBitmapMock.mockReturnValue(decode.promise);
    const coordinator = new RasterSanitizationCoordinator();
    const pending = coordinator
      .sanitize(fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg"))
      .catch((caught) => caught);
    await flushMicrotasks();

    coordinator.dispose();
    expectSanitizationCode(await pending, "aborted");
    const disposedError = await coordinator
      .sanitize(fixtureBlob(ONE_PIXEL_JPEG, "image/jpeg"))
      .catch((caught) => caught);
    expectSanitizationCode(disposedError, "coordinator-disposed");
  });
});
