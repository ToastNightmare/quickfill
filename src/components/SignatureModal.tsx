"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Camera, ImagePlus, X, Trash2, RotateCcw } from "lucide-react";
import { useSignaturePad } from "./SignaturePad";

interface SignatureModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  onDelete?: () => void;
  existingSignature?: string | null;
  /** If true, show "Use Signature" instead of "Save Signature" */
  useMode?: boolean;
  /** Called when user wants to use the existing saved signature */
  onUseExisting?: () => void;
}

type SignatureMode = "view" | "draw" | "photo";

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_SOURCE_SIDE = 1800;
const MAX_SIGNATURE_DATA_URL_CHARS = 180_000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function luminance(r: number, g: number, b: number) {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    image.src = url;
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

async function processSignaturePhoto(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Image is too large");
  }

  const image = await loadImage(file);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight) {
    throw new Error("Could not read image");
  }

  const sourceScale = Math.min(1, MAX_SOURCE_SIDE / Math.max(imageWidth, imageHeight));
  const width = Math.max(1, Math.round(imageWidth * sourceScale));
  const height = Math.max(1, Math.round(imageHeight * sourceScale));

  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext("2d", { willReadFrequently: true })!;
  sourceCtx.drawImage(image, 0, 0, width, height);

  const imageData = sourceCtx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const samples: number[] = [];
  const sampleStep = Math.max(4, Math.floor(Math.max(width, height) / 420));

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const index = (y * width + x) * 4;
      if (data[index + 3] > 20) {
        samples.push(luminance(data[index], data[index + 1], data[index + 2]));
      }
    }
  }

  if (samples.length === 0) {
    throw new Error("Could not find signature");
  }

  samples.sort((a, b) => a - b);
  const light = samples[Math.floor(samples.length * 0.9)] ?? 245;
  const dark = samples[Math.floor(samples.length * 0.1)] ?? 40;
  const threshold = clamp(light - Math.max(45, (light - dark) * 0.35), 45, 205);

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let inkPixels = 0;

  const inkStrengthAt = (index: number) => {
    const alpha = data[index + 3] / 255;
    if (alpha <= 0.08) return 0;
    const luma = luminance(data[index], data[index + 1], data[index + 2]);
    const contrast = light - luma;
    const strength = Math.max((threshold + 18 - luma) / 70, (contrast - 42) / 90);
    return clamp(strength * alpha, 0, 1);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (inkStrengthAt(index) > 0.22) {
        inkPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (inkPixels < 12 || maxX <= minX || maxY <= minY) {
    throw new Error("Could not find signature");
  }

  const padX = Math.max(12, Math.round((maxX - minX) * 0.08));
  const padY = Math.max(12, Math.round((maxY - minY) * 0.22));
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
      const sourceIndex = ((minY + y) * width + minX + x) * 4;
      const targetIndex = (y * cropWidth + x) * 4;
      const alpha = Math.round(clamp(inkStrengthAt(sourceIndex), 0, 1) * 255);
      output.data[targetIndex] = 13;
      output.data[targetIndex + 1] = 13;
      output.data[targetIndex + 2] = 26;
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

export function SignatureModal({
  open,
  onClose,
  onSave,
  onDelete,
  existingSignature,
  useMode,
  onUseExisting,
}: SignatureModalProps) {
  const [mode, setMode] = useState<SignatureMode>(existingSignature ? "view" : "draw");
  const [saving, setSaving] = useState(false);
  const [padWidth, setPadWidth] = useState(400);
  const [photoSignature, setPhotoSignature] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Responsive pad width
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const w = Math.min(window.innerWidth - 64, 480);
      setPadWidth(Math.max(280, w));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  const { canvasElement, clear, toDataURL, hasContent } = useSignaturePad({
    width: padWidth,
    height: 180,
  });

  // Reset mode when modal opens
  useEffect(() => {
    if (open) {
      setMode(existingSignature ? "view" : "draw");
      setPhotoSignature(null);
      setPhotoError(null);
      setPhotoProcessing(false);
    }
  }, [open, existingSignature]);

  // Clear pad whenever draw mode becomes active (open fresh or Re-sign)
  useEffect(() => {
    if (mode === "draw") {
      setTimeout(() => clear(), 30);
    }
  }, [mode, clear]);

  const handleSave = useCallback(async () => {
    const dataUrl = toDataURL();
    if (!dataUrl) return;

    setSaving(true);
    try {
      await onSave(dataUrl);
    } finally {
      setSaving(false);
    }
  }, [toDataURL, onSave]);

  const handlePhotoFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setPhotoProcessing(true);
    setPhotoError(null);
    try {
      const dataUrl = await processSignaturePhoto(file);
      setPhotoSignature(dataUrl);
    } catch (error) {
      setPhotoSignature(null);
      setPhotoError(error instanceof Error ? error.message : "Could not use image");
    } finally {
      setPhotoProcessing(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const handlePhotoSave = useCallback(async () => {
    if (!photoSignature) return;

    setSaving(true);
    try {
      await onSave(photoSignature);
    } finally {
      setSaving(false);
    }
  }, [photoSignature, onSave]);

  const resetPhoto = useCallback(() => {
    setPhotoSignature(null);
    setPhotoError(null);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
    } finally {
      setSaving(false);
    }
  }, [onDelete]);

  if (!open) return null;

  const saveLabel = saving ? "Saving..." : useMode ? "Save & Use" : "Save Signature";

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal panel - bottom sheet on mobile, centered on desktop */}
      <div
        className="relative z-10 w-full sm:w-auto sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-surface shadow-2xl animate-fade-in"
        style={{ isolation: "isolate" }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-text">
            {mode === "view" ? "Your Signature" : "Sign here"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {mode === "view" && existingSignature ? (
            <div className="flex flex-col items-center gap-4">
              {/* Signature preview */}
              <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-alt p-4 w-full min-h-[120px]">
                <img
                  src={existingSignature}
                  alt="Your saved signature"
                  className="max-h-[100px] max-w-full object-contain"
                  draggable={false}
                />
              </div>

              {/* Actions */}
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                {useMode && onUseExisting && (
                  <button
                    onClick={onUseExisting}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
                  >
                    Use Signature
                  </button>
                )}
                <button
                  onClick={() => {
                    setMode("draw");
                    clear();
                  }}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-medium text-text hover:bg-surface-alt transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                  Replace
                </button>
                {onDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="grid w-full grid-cols-2 rounded-xl bg-surface-alt p-1">
                <button
                  type="button"
                  onClick={() => setMode("draw")}
                  className={`flex h-10 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                    mode === "draw" ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
                  }`}
                >
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => setMode("photo")}
                  className={`flex h-10 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                    mode === "photo" ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
                  }`}
                >
                  Photo
                </button>
              </div>

              {mode === "photo" ? (
                <>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => handlePhotoFile(event.target.files?.[0])}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => handlePhotoFile(event.target.files?.[0])}
                  />

                  <div className="flex min-h-[180px] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-border bg-white shadow-inner">
                    {photoSignature ? (
                      <img
                        src={photoSignature}
                        alt="Signature preview"
                        className="max-h-[150px] max-w-full object-contain px-4 py-6"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex w-full flex-col items-center gap-3 px-4 py-8">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                          <Camera className="h-6 w-6" />
                        </div>
                        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            disabled={photoProcessing}
                            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                          >
                            <Camera className="h-4 w-4" />
                            Camera
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={photoProcessing}
                            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-alt disabled:opacity-50"
                          >
                            <ImagePlus className="h-4 w-4" />
                            Choose Image
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {photoError && (
                    <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {photoError}
                    </p>
                  )}

                  <div className="flex w-full gap-2">
                    <button
                      onClick={handlePhotoSave}
                      disabled={!photoSignature || saving || photoProcessing}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-40"
                    >
                      {photoProcessing ? "Processing..." : saveLabel}
                    </button>
                    <button
                      type="button"
                      onClick={photoSignature ? resetPhoto : () => cameraInputRef.current?.click()}
                      title={photoSignature ? "Retake" : "Camera"}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted hover:bg-surface-alt transition-colors"
                    >
                      {photoSignature ? <RotateCcw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                    </button>
                    {existingSignature && (
                      <button
                        onClick={() => setMode("view")}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted hover:bg-surface-alt transition-colors"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Drawing area */}
                  <div
                    className="relative w-full overflow-hidden rounded-xl border-2 border-border bg-white shadow-inner"
                    style={{ cursor: "crosshair" }}
                  >
                    {canvasElement}
                    {!hasContent && (
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
                        <p className="text-sm text-text-muted/40 select-none">Draw your signature here</p>
                        <p className="text-xs text-text-muted/30 select-none">Use your mouse or finger</p>
                      </div>
                    )}
                    {/* Bottom line like a real signature line */}
                    <div className="absolute bottom-8 left-6 right-6 h-px bg-border/60 pointer-events-none" />
                  </div>

                  {/* Actions */}
                  <div className="flex w-full gap-2">
                    <button
                      onClick={handleSave}
                      disabled={!hasContent || saving}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-40"
                    >
                      {saveLabel}
                    </button>
                    <button
                      onClick={clear}
                      title="Clear and redraw"
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    {existingSignature && (
                      <button
                        onClick={() => setMode("view")}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted hover:bg-surface-alt transition-colors"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Mobile drag handle hint */}
        <div className="flex justify-center pb-3 sm:hidden">
          <div className="h-1 w-8 rounded-full bg-border" />
        </div>
      </div>
    </div>
  );
}
