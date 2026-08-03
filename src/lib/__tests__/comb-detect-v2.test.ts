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
          const sourceIndex =
            ((y + cropY) * width + x + cropX) * 4;
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
  test("retries once with minimum-size expansion floors", () => {
    const canvasWidth = 150;
    const canvasHeight = 70;
    const pixels = drawLines(
      canvasWidth,
      canvasHeight,
      [36, 50, 64, 78, 92, 106, 120],
      20,
      34,
    );
    const { canvas, reads } = createCanvas(
      canvasWidth,
      canvasHeight,
      pixels,
    );

    const result = detectCombCellsV2(canvas, 70, 20, 30, 15, 1);

    expect(result?.cellCount).toBe(3);
    expect(reads).toEqual([
      [70, 20, 30, 15],
      [55, 10, 60, 35],
    ]);
  });

  test("detects all six cells when mid-row taps are nearly level", () => {
    const pixels = drawLines(
      140,
      70,
      [20, 34, 48, 62, 76, 90, 104],
      25,
      40,
    );
    const { canvas } = createCanvas(140, 70, pixels);

    const result = detectCombCellsV2(canvas, 27, 31, 70, 4, 1);

    expect(result?.cellCount).toBe(6);
  });

  test("detects all six cells from a region strictly inside the row", () => {
    const pixels = drawLines(
      140,
      70,
      [20, 34, 48, 62, 76, 90, 104],
      25,
      40,
    );
    const { canvas } = createCanvas(140, 70, pixels);

    const result = detectCombCellsV2(canvas, 22, 27, 80, 12, 1);

    expect(result?.cellCount).toBe(6);
  });

  test("trims a neighbouring field edge from an expanded result", () => {
    const pixels = drawLines(
      160,
      70,
      [20, 34, 48, 62, 76, 90, 104, 116],
      25,
      40,
    );
    const { canvas } = createCanvas(160, 70, pixels);

    const result = detectCombCellsV2(canvas, 27, 31, 70, 4, 1);

    expect(result?.cellCount).toBe(6);
    expect(result?.cellBoundaries).toEqual([20, 34, 48, 62, 76, 90]);
  });

  test("clamps the expanded region at the canvas edge", () => {
    const pixels = drawLines(
      100,
      45,
      [0, 14, 28, 42, 56, 70, 84],
      5,
      20,
    );
    const { canvas, reads } = createCanvas(100, 45, pixels);

    const result = detectCombCellsV2(canvas, 7, 10, 70, 4, 1);

    expect(result?.cellCount).toBe(6);
    expect(reads[1]?.[0]).toBe(0);
  });

  test("keeps a covering first-pass result without retrying", () => {
    const cellBoundaries = [20, 48, 76, 104, 132, 160, 188];
    const pixels = drawLines(
      220,
      90,
      cellBoundaries,
      25,
      49,
    );
    const { canvas, reads } = createCanvas(220, 90, pixels);
    const firstCellCenter = 34;
    const lastCellCenter = 174;

    const result = detectCombCellsV2(
      canvas,
      firstCellCenter - 20,
      25,
      lastCellCenter - firstCellCenter + 40,
      25,
      1,
    );

    expect(result?.cellCount).toBe(6);
    expect(reads).toEqual([[14, 25, 180, 25]]);
  });
});
