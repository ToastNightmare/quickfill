const MAX_SOURCE_SIDE = 1800;
const MAX_SIGNATURE_DATA_URL_CHARS = 180_000;

type Rgb = { r: number; g: number; b: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function luminance(r: number, g: number, b: number) {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function colorDistance(a: Rgb, b: Rgb) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function loadImageFromSource(source: File | string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source);
    const image = new Image();

    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image"));
    };
    image.src = objectUrl ?? (source as string);
  });
}

function shrinkPngDataUrl(canvas: HTMLCanvasElement) {
  let current = canvas;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dataUrl = current.toDataURL("image/png");
    if (dataUrl.length <= MAX_SIGNATURE_DATA_URL_CHARS) return dataUrl;

    const next = document.createElement("canvas");
    next.width = Math.max(1, Math.round(current.width * 0.78));
    next.height = Math.max(1, Math.round(current.height * 0.78));
    const nextCtx = next.getContext("2d")!;
    nextCtx.imageSmoothingEnabled = true;
    nextCtx.imageSmoothingQuality = "high";
    nextCtx.drawImage(current, 0, 0, next.width, next.height);
    current = next;
  }

  return current.toDataURL("image/png");
}

function estimatePaperColor(data: Uint8ClampedArray, width: number, height: number): Rgb {
  const border = Math.max(3, Math.round(Math.min(width, height) * 0.06));
  const step = Math.max(2, Math.floor(Math.max(width, height) / 520));
  const samples: Rgb[] = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const nearEdge = x < border || y < border || x >= width - border || y >= height - border;
      if (!nearEdge) continue;

      const index = (y * width + x) * 4;
      if (data[index + 3] <= 20) continue;
      samples.push({ r: data[index], g: data[index + 1], b: data[index + 2] });
    }
  }

  if (samples.length === 0) return { r: 245, g: 245, b: 245 };

  samples.sort((a, b) => luminance(a.r, a.g, a.b) - luminance(b.r, b.g, b.b));
  const brightest = samples.slice(Math.floor(samples.length * 0.55));
  const median = brightest[Math.floor(brightest.length / 2)] ?? samples[Math.floor(samples.length / 2)];
  return median;
}

function getInkStrength(
  data: Uint8ClampedArray,
  index: number,
  paper: Rgb,
  paperLuma: number,
) {
  const alpha = data[index + 3] / 255;
  if (alpha <= 0.08) return 0;

  const pixel = { r: data[index], g: data[index + 1], b: data[index + 2] };
  const luma = luminance(pixel.r, pixel.g, pixel.b);
  const darkness = paperLuma - luma;
  const distance = colorDistance(pixel, paper);

  const darknessStrength = (darkness - 24) / 90;
  const distanceStrength = (distance - 34) / 118;
  const absoluteDarkStrength = (172 - luma) / 120;

  return clamp(Math.max(darknessStrength, distanceStrength, absoluteDarkStrength) * alpha, 0, 1);
}

function findSignatureBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  paper: Rgb,
) {
  const paperLuma = luminance(paper.r, paper.g, paper.b);
  const mask = new Uint8Array(width * height);
  const strengths = new Float32Array(width * height);
  let rawMinX = width;
  let rawMinY = height;
  let rawMaxX = -1;
  let rawMaxY = -1;
  let inkPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const dataIndex = pixelIndex * 4;
      const strength = getInkStrength(data, dataIndex, paper, paperLuma);
      strengths[pixelIndex] = strength;
      if (strength <= 0.2) continue;

      mask[pixelIndex] = 1;
      inkPixels += 1;
      rawMinX = Math.min(rawMinX, x);
      rawMinY = Math.min(rawMinY, y);
      rawMaxX = Math.max(rawMaxX, x);
      rawMaxY = Math.max(rawMaxY, y);
    }
  }

  if (inkPixels < 12 || rawMaxX <= rawMinX || rawMaxY <= rawMinY) {
    throw new Error("Could not find signature");
  }

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const minComponentArea = Math.max(8, Math.min(220, Math.round(inkPixels * 0.004)));
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let keptArea = 0;

  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || visited[i]) continue;

    let area = 0;
    let cMinX = width;
    let cMinY = height;
    let cMaxX = -1;
    let cMaxY = -1;
    visited[i] = 1;
    stack.push(i);

    while (stack.length > 0) {
      const current = stack.pop()!;
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      cMinX = Math.min(cMinX, x);
      cMinY = Math.min(cMinY, y);
      cMaxX = Math.max(cMaxX, x);
      cMaxY = Math.max(cMaxY, y);

      const left = x > 0 ? current - 1 : -1;
      const right = x < width - 1 ? current + 1 : -1;
      const up = y > 0 ? current - width : -1;
      const down = y < height - 1 ? current + width : -1;
      const neighbors = [left, right, up, down];
      for (const next of neighbors) {
        if (next >= 0 && mask[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }

    const componentWidth = cMaxX - cMinX + 1;
    const componentHeight = cMaxY - cMinY + 1;
    const isLineLike = componentWidth >= 5 || componentHeight >= 5;
    if (area >= minComponentArea || (area >= 5 && isLineLike)) {
      keptArea += area;
      minX = Math.min(minX, cMinX);
      minY = Math.min(minY, cMinY);
      maxX = Math.max(maxX, cMaxX);
      maxY = Math.max(maxY, cMaxY);
    }
  }

  if (keptArea < 8 || maxX <= minX || maxY <= minY) {
    minX = rawMinX;
    minY = rawMinY;
    maxX = rawMaxX;
    maxY = rawMaxY;
  }

  return { minX, minY, maxX, maxY, strengths, paperLuma };
}

export async function cleanSignatureImage(source: File | string) {
  const image = await loadImageFromSource(source);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight) {
    throw new Error("Could not read image");
  }

  const sourceScale = Math.min(1, MAX_SOURCE_SIDE / Math.max(imageWidth, imageHeight));
  const width = Math.max(1, Math.round(imageWidth * sourceScale));
  const height = Math.max(1, Math.round(imageHeight * sourceScale));

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true })!;
  sourceCtx.drawImage(image, 0, 0, width, height);

  const imageData = sourceCtx.getImageData(0, 0, width, height);
  const paper = estimatePaperColor(imageData.data, width, height);
  let { minX, minY, maxX, maxY, strengths, paperLuma } = findSignatureBounds(
    imageData.data,
    width,
    height,
    paper,
  );

  const inkWidth = maxX - minX + 1;
  const inkHeight = maxY - minY + 1;
  const padX = Math.max(8, Math.round(inkWidth * 0.06));
  const padY = Math.max(8, Math.round(inkHeight * 0.16));
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(width - 1, maxX + padX);
  maxY = Math.min(height - 1, maxY + padY);

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = cropWidth;
  alphaCanvas.height = cropHeight;
  const alphaCtx = alphaCanvas.getContext("2d")!;
  const output = alphaCtx.createImageData(cropWidth, cropHeight);

  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const sourceX = minX + x;
      const sourceY = minY + y;
      const sourceIndex = sourceY * width + sourceX;
      const dataIndex = sourceIndex * 4;
      const targetIndex = (y * cropWidth + x) * 4;
      const luma = luminance(
        imageData.data[dataIndex],
        imageData.data[dataIndex + 1],
        imageData.data[dataIndex + 2],
      );
      const strength = strengths[sourceIndex] || getInkStrength(imageData.data, dataIndex, paper, paperLuma);
      const alpha = Math.round(Math.pow(clamp(strength, 0, 1), 0.72) * 255);

      output.data[targetIndex] = luma < 105 ? imageData.data[dataIndex] : 13;
      output.data[targetIndex + 1] = luma < 105 ? imageData.data[dataIndex + 1] : 13;
      output.data[targetIndex + 2] = luma < 105 ? imageData.data[dataIndex + 2] : 26;
      output.data[targetIndex + 3] = alpha;
    }
  }

  alphaCtx.putImageData(output, 0, 0);

  const targetScale = Math.min(1, 900 / cropWidth, 320 / cropHeight);
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = Math.max(1, Math.round(cropWidth * targetScale));
  finalCanvas.height = Math.max(1, Math.round(cropHeight * targetScale));
  const finalCtx = finalCanvas.getContext("2d")!;
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = "high";
  finalCtx.drawImage(alphaCanvas, 0, 0, finalCanvas.width, finalCanvas.height);

  return shrinkPngDataUrl(finalCanvas);
}
