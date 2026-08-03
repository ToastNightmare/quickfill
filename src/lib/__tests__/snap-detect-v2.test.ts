import {
  detectSnapBoxV2,
  detectSnapBoxV2FromImageData,
} from "../snap-detect";

function createPixels(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 255;
    pixels[index + 1] = 255;
    pixels[index + 2] = 255;
    pixels[index + 3] = 255;
  }
  return pixels;
}

function drawPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  gray: number,
) {
  const index = (y * width + x) * 4;
  pixels[index] = gray;
  pixels[index + 1] = gray;
  pixels[index + 2] = gray;
}

function drawBox(
  pixels: Uint8ClampedArray,
  width: number,
  left: number,
  top: number,
  boxWidth: number,
  boxHeight: number,
  options: { gray?: number; dashed?: boolean } = {},
) {
  const gray = options.gray ?? 24;
  const right = left + boxWidth;
  const bottom = top + boxHeight;
  for (let x = left; x <= right; x++) {
    if (!options.dashed || (x - left) % 4 < 2) {
      drawPixel(pixels, width, x, top, gray);
      drawPixel(pixels, width, x, bottom, gray);
    }
  }
  for (let y = top; y <= bottom; y++) {
    if (!options.dashed || (y - top) % 4 < 2) {
      drawPixel(pixels, width, left, y, gray);
      drawPixel(pixels, width, right, y, gray);
    }
  }
}

function createCanvas(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
) {
  const reads: Array<[number, number, number, number]> = [];
  const context = {
    getImageData: (
      x: number,
      y: number,
      cropWidth: number,
      cropHeight: number,
    ) => {
      reads.push([x, y, cropWidth, cropHeight]);
      const cropped = createPixels(cropWidth, cropHeight);
      for (let cropY = 0; cropY < cropHeight; cropY++) {
        for (let cropX = 0; cropX < cropWidth; cropX++) {
          const sourceIndex = ((y + cropY) * width + x + cropX) * 4;
          const targetIndex = (cropY * cropWidth + cropX) * 4;
          cropped[targetIndex] = pixels[sourceIndex];
          cropped[targetIndex + 1] = pixels[sourceIndex + 1];
          cropped[targetIndex + 2] = pixels[sourceIndex + 2];
          cropped[targetIndex + 3] = pixels[sourceIndex + 3];
        }
      }
      return { data: cropped };
    },
  };
  const canvas = {
    width,
    height,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;

  return { canvas, reads };
}

describe("detectSnapBoxV2FromImageData", () => {
  test("detects a solid box around the point with the correct rectangle", () => {
    const pixels = createPixels(100, 60);
    drawBox(pixels, 100, 20, 15, 50, 18);

    expect(
      detectSnapBoxV2FromImageData(pixels, 100, 60, 45, 24, 1),
    ).toEqual({ x: 20, y: 15, width: 50, height: 18 });
  });

  test("detects faint gray borders on the medium-threshold line path", () => {
    const pixels = createPixels(110, 60);
    // The 8:1 aspect ratio makes flood-fill reject this fixture, so a match
    // proves the medium-threshold line fallback found the rectangle.
    drawBox(pixels, 110, 10, 20, 80, 10, { gray: 165 });

    expect(
      detectSnapBoxV2FromImageData(pixels, 110, 60, 50, 25, 1),
    ).toEqual({ x: 10, y: 20, width: 80, height: 10 });
  });

  test("detects dashed borders on the scale-aware line path", () => {
    const pixels = createPixels(110, 60);
    // As above, flood-fill cannot satisfy the aspect-ratio guard.
    drawBox(pixels, 110, 10, 20, 80, 10, { dashed: true });

    expect(
      detectSnapBoxV2FromImageData(pixels, 110, 60, 50, 25, 1),
    ).toEqual({ x: 10, y: 20, width: 80, height: 10 });
  });

  test("detects a roughly fourteen-point box at scale 0.6", () => {
    const pixels = createPixels(32, 28);
    drawBox(pixels, 32, 10, 8, 8, 8);

    expect(
      detectSnapBoxV2FromImageData(pixels, 32, 28, 14, 12, 0.6),
    ).toEqual({ x: 10, y: 8, width: 8, height: 8 });
  });

  test("returns null for empty image data", () => {
    const pixels = createPixels(100, 60);

    expect(
      detectSnapBoxV2FromImageData(pixels, 100, 60, 45, 24, 1),
    ).toBeNull();
  });
});

describe("detectSnapBoxV2", () => {
  test("retries once with a 50% expansion clamped at canvas edges", () => {
    const pixels = createPixels(100, 80);
    const { canvas, reads } = createCanvas(100, 80, pixels);

    expect(detectSnapBoxV2(canvas, 5, 5, 0.2)).toBeNull();
    expect(reads).toEqual([
      [0, 0, 60, 60],
      [0, 0, 90, 80],
    ]);
  });
});
