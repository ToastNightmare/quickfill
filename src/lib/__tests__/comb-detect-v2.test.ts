import {
  detectCombCellsV2,
  detectCombCellsV2FromImageData,
} from "../snap-detect";

function createPixels(
  width: number,
  height: number,
  background = 255,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = background;
    pixels[index + 1] = background;
    pixels[index + 2] = background;
    pixels[index + 3] = 255;
  }
  return pixels;
}

function drawVerticalLine(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y1: number,
  y2: number,
  gray = 24,
) {
  for (let y = y1; y <= y2; y++) {
    const index = (y * width + x) * 4;
    pixels[index] = gray;
    pixels[index + 1] = gray;
    pixels[index + 2] = gray;
  }
}

function drawLines(
  width: number,
  height: number,
  xPositions: number[],
  y1: number,
  y2: number,
  gray = 24,
) {
  const pixels = createPixels(width, height);
  for (const x of xPositions) {
    drawVerticalLine(pixels, width, x, y1, y2, gray);
  }
  return pixels;
}

describe("detectCombCellsV2FromImageData", () => {
  test("detects a comb row with internal dividers", () => {
    const pixels = drawLines(
      110,
      40,
      [10, 24, 38, 52, 66, 80, 94],
      12,
      25,
    );

    const result = detectCombCellsV2FromImageData(pixels, 110, 40, 1);

    expect(result?.cellCount).toBe(6);
    expect(result?.cellWidths).toEqual([14, 14, 14, 14, 14, 14]);
  });

  test("detects a comb row with dashed internal dividers", () => {
    const pixels = createPixels(110, 40);
    for (const x of [10, 24, 38, 52, 66, 80, 94]) {
      for (let y = 12; y <= 25; y++) {
        if ((y - 12) % 4 < 2) {
          drawVerticalLine(pixels, 110, x, y, y);
        }
      }
    }

    const result = detectCombCellsV2FromImageData(pixels, 110, 40, 1);

    expect(result?.cellCount).toBe(6);
  });

  test("drops narrow gaps between six separated squares", () => {
    const pixels = drawLines(
      122,
      40,
      [6, 20, 25, 39, 44, 58, 63, 77, 82, 96, 101, 115],
      12,
      25,
    );

    const result = detectCombCellsV2FromImageData(pixels, 122, 40, 1);

    expect(result?.cellCount).toBe(6);
    expect(result?.cellWidths).toEqual([14, 14, 14, 14, 14, 14]);
    expect(result?.cellBoundaries).toEqual([6, 25, 44, 63, 82, 101]);
  });

  test("ignores loose region height when choosing aligned box edges", () => {
    const pixels = drawLines(
      110,
      36,
      [10, 24, 38, 52, 66, 80, 94],
      12,
      23,
    );

    const result = detectCombCellsV2FromImageData(pixels, 110, 36, 1);

    expect(result?.cellCount).toBe(6);
    expect(result?.height).toBe(11);
  });

  test("detects roughly fourteen-point cells at scale 0.6", () => {
    const pixels = drawLines(
      60,
      18,
      [4, 12, 20, 28, 36, 44, 52],
      5,
      12,
    );

    const result = detectCombCellsV2FromImageData(pixels, 60, 18, 0.6);

    expect(result?.cellCount).toBe(6);
    expect(result?.cellWidth).toBe(8);
  });

  test("falls back to the medium threshold for light-gray borders", () => {
    const pixels = drawLines(
      110,
      40,
      [10, 24, 38, 52, 66, 80, 94],
      12,
      25,
      168,
    );

    const result = detectCombCellsV2FromImageData(pixels, 110, 40, 1);

    expect(result?.cellCount).toBe(6);
  });
});

describe("detectCombCellsV2", () => {
  test("retries once with a region expanded by thirty percent per side", () => {
    const canvasWidth = 150;
    const canvasHeight = 70;
    const pixels = drawLines(
      canvasWidth,
      canvasHeight,
      [36, 50, 64, 78, 92, 106, 120],
      20,
      34,
    );
    const reads: Array<[number, number, number, number]> = [];
    const context = {
      getImageData: (x: number, y: number, width: number, height: number) => {
        reads.push([x, y, width, height]);
        const cropped = createPixels(width, height);
        for (let cropY = 0; cropY < height; cropY++) {
          for (let cropX = 0; cropX < width; cropX++) {
            const sourceIndex =
              ((y + cropY) * canvasWidth + x + cropX) * 4;
            const targetIndex = (cropY * width + cropX) * 4;
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
      width: canvasWidth,
      height: canvasHeight,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;

    const result = detectCombCellsV2(canvas, 70, 20, 30, 15, 1);

    expect(result?.cellCount).toBe(3);
    expect(reads).toEqual([
      [70, 20, 30, 15],
      [61, 15, 48, 25],
    ]);
  });
});
