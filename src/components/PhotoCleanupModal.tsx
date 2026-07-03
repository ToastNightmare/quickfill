"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import {
  cleanupPhotoFile,
  FULL_FRAME_CROP,
  isFullFrameCrop,
  normalizeQuarterTurns,
  renderCleanupPreview,
  type CropRect,
} from "@/lib/image-cleanup";
import { CropOverlay } from "@/components/CropOverlay";

interface PhotoCleanupModalProps {
  /** The original photo the user picked. */
  file: File;
  /** Called with the cleaned JPEG file when the user confirms. */
  onConfirm: (cleanedFile: File) => void;
  /** Called when the user cancels; the upload should be aborted. */
  onCancel: () => void;
}

export function PhotoCleanupModal({ file, onConfirm, onCancel }: PhotoCleanupModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotateQuarterTurns, setRotateQuarterTurns] = useState(0);
  const [documentMode, setDocumentMode] = useState(true);
  const [cropRect, setCropRect] = useState<CropRect>(FULL_FRAME_CROP);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderCleanupPreview(file, { rotateQuarterTurns, documentMode, cropRect }, canvas)
      .then(() => {
        if (!cancelled) setPreviewFailed(false);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file, rotateQuarterTurns, documentMode, cropRect]);

  // Rotating changes the frame the crop is relative to; reset to full frame
  // rather than transforming coordinates. Users rotate first, crop second.
  const handleRotateLeft = useCallback(() => {
    setRotateQuarterTurns((turns) => normalizeQuarterTurns(turns - 1));
    setCropRect(FULL_FRAME_CROP);
  }, []);

  const handleRotateRight = useCallback(() => {
    setRotateQuarterTurns((turns) => normalizeQuarterTurns(turns + 1));
    setCropRect(FULL_FRAME_CROP);
  }, []);

  const handleResetCrop = useCallback(() => {
    setCropRect(FULL_FRAME_CROP);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const cleaned = await cleanupPhotoFile(file, { rotateQuarterTurns, documentMode, cropRect });
      onConfirm(cleaned);
    } catch {
      // Fall back to the original photo rather than blocking the upload.
      onConfirm(file);
    } finally {
      setIsProcessing(false);
    }
  }, [file, rotateQuarterTurns, documentMode, cropRect, isProcessing, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        <h2 className="text-lg font-bold">Clean up photo</h2>
        <p className="mt-1 text-sm text-text-muted">
          Rotate, crop, or improve the photo before adding it as a document page.
        </p>

        <div className="mt-4 flex max-h-[45vh] items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-alt p-2">
          {previewFailed ? (
            <p className="px-4 py-10 text-center text-sm text-text-muted">
              Preview unavailable. Your photo will still be cleaned up when you continue.
            </p>
          ) : (
            <div className="relative inline-flex">
              <canvas
                ref={canvasRef}
                data-testid="photo-cleanup-preview"
                className="max-h-[42vh] max-w-full object-contain"
              />
              <CropOverlay crop={cropRect} onChange={setCropRect} />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRotateLeft}
              title="Rotate left"
              aria-label="Rotate left"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRotateRight}
              title="Rotate right"
              aria-label="Rotate right"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <RotateCw className="h-4 w-4" />
            </button>
            {!isFullFrameCrop(cropRect) && (
              <button
                type="button"
                onClick={handleResetCrop}
                className="text-sm font-medium text-accent transition-colors hover:underline"
              >
                Reset crop
              </button>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={documentMode}
              onChange={(event) => setDocumentMode(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Document mode
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing}
            className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isProcessing ? "Preparing..." : "Use photo"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold transition-colors hover:bg-surface-alt"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
