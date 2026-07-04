"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Camera, ImagePlus, X, Trash2, RotateCcw } from "lucide-react";
import { cleanSignatureImage } from "@/lib/signature-image";
import { useSignaturePad } from "./SignaturePad";

interface SignatureModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  existingSignature?: string | null;
  /** Where the saved signature lives, drives the trust copy line */
  signatureSource?: "account" | "device" | null;
  /** If true, show "Use Signature" instead of "Save Signature" */
  useMode?: boolean;
  /** Called when user wants to use the existing saved signature */
  onUseExisting?: () => void;
}

type SignatureMode = "view" | "draw" | "photo";

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

async function processSignaturePhoto(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Image is too large");
  }

  return cleanSignatureImage(file);
}

export function SignatureModal({
  open,
  onClose,
  onSave,
  onDelete,
  existingSignature,
  signatureSource,
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

  useEffect(() => {
    if (open) {
      setMode(existingSignature ? "view" : "draw");
      setPhotoSignature(null);
      setPhotoError(null);
      setPhotoProcessing(false);
    }
  }, [open, existingSignature]);

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
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div
        className="relative z-10 w-full rounded-t-2xl bg-surface shadow-2xl animate-fade-in sm:w-auto sm:max-w-lg sm:rounded-2xl"
        style={{ isolation: "isolate" }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-text">
            {mode === "view" ? "Your Signature" : "Sign here"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          {mode === "view" && existingSignature ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex min-h-[120px] w-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-alt p-4">
                <img
                  src={existingSignature}
                  alt="Your saved signature"
                  className="max-h-[100px] max-w-full object-contain"
                  draggable={false}
                />
              </div>

              <p className="w-full text-center text-xs text-text-muted">
                {signatureSource === "account"
                  ? "Saved to your account. You can delete it anytime."
                  : signatureSource === "device"
                    ? "Saved on this device. You can delete it anytime."
                    : "Saved for reuse. You can delete it anytime."}
              </p>

              <div className="flex w-full flex-col gap-2 sm:flex-row">
                {useMode && onUseExisting && (
                  <button
                    onClick={onUseExisting}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                  >
                    Use Signature
                  </button>
                )}
                <button
                  onClick={() => {
                    setMode("draw");
                    clear();
                  }}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-medium text-text transition-colors hover:bg-surface-alt"
                >
                  <RotateCcw className="h-4 w-4" />
                  Replace
                </button>
                {onDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
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
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                    >
                      {photoProcessing ? "Processing..." : saveLabel}
                    </button>
                    <button
                      type="button"
                      onClick={photoSignature ? resetPhoto : () => cameraInputRef.current?.click()}
                      title={photoSignature ? "Retake" : "Camera"}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted transition-colors hover:bg-surface-alt"
                    >
                      {photoSignature ? <RotateCcw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                    </button>
                    {existingSignature && (
                      <button
                        onClick={() => setMode("view")}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted transition-colors hover:bg-surface-alt"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="relative w-full overflow-hidden rounded-xl border-2 border-border bg-white shadow-inner"
                    style={{ cursor: "crosshair" }}
                  >
                    {canvasElement}
                    {!hasContent && (
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
                        <p className="select-none text-sm text-text-muted/40">Draw your signature here</p>
                        <p className="select-none text-xs text-text-muted/30">Use your mouse or finger</p>
                      </div>
                    )}
                    <div className="pointer-events-none absolute bottom-8 left-6 right-6 h-px bg-border/60" />
                  </div>

                  <div className="flex w-full gap-2">
                    <button
                      onClick={handleSave}
                      disabled={!hasContent || saving}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                    >
                      {saveLabel}
                    </button>
                    <button
                      onClick={clear}
                      title="Clear and redraw"
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    {existingSignature && (
                      <button
                        onClick={() => setMode("view")}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted transition-colors hover:bg-surface-alt"
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

        <div className="flex justify-center pb-3 sm:hidden">
          <div className="h-1 w-8 rounded-full bg-border" />
        </div>
      </div>
    </div>
  );
}
