"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { LockKeyhole, ShieldCheck, Upload } from "lucide-react";
import { normalizeDocumentUpload, type NormalizedDocumentUpload } from "@/lib/document-intake";
import { isCleanablePhoto } from "@/lib/image-cleanup";
import { PhotoCleanupModal } from "@/components/PhotoCleanupModal";
import { createDocumentRevision } from "@/lib/field-suggestions";
import { isFieldSuggestionReviewEnabled } from "@/lib/field-suggestion-rollout";
import {
  DOCUMENT_DROPZONE_ACCEPT,
  DOCUMENT_UPLOAD_LABEL,
  PDF_UPLOAD_MAX_BYTES,
  PDF_UPLOAD_MAX_LABEL,
} from "@/lib/upload-limits";

export interface UploadZoneLoadOptions {
  requestFieldSuggestions: true;
  documentRevision: string;
}

interface UploadZoneProps {
  onFileLoad: (
    upload: NormalizedDocumentUpload,
    options?: UploadZoneLoadOptions,
  ) => void | Promise<void>;
}

export function UploadZone({ onFileLoad }: UploadZoneProps) {
  const makeFillableEnabled = isFieldSuggestionReviewEnabled();
  const [error, setError] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  const loadFile = useCallback(
    async (file: File, options?: { makeFillable?: boolean }) => {
      try {
        const upload = await normalizeDocumentUpload(file);
        if (options?.makeFillable && makeFillableEnabled && upload.sourceType === "image") {
          await onFileLoad(upload, {
            requestFieldSuggestions: true,
            documentRevision: await createDocumentRevision(upload.pdfBytes),
          });
        } else {
          await onFileLoad(upload);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : `Please upload a ${DOCUMENT_UPLOAD_LABEL}.`;
        setError(message);
        setTimeout(() => setError(null), 5000);
      }
    },
    [makeFillableEnabled, onFileLoad]
  );

  const handleAcceptedFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (isCleanablePhoto(file)) {
        // Photos go through the cleanup modal; PDFs load directly.
        setPendingPhoto(file);
        return;
      }
      await loadFile(file);
    },
    [loadFile]
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setError(null);
      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        const message = rejection?.errors.some((item) => item.code === "file-too-large")
          ? `This file is too large. Please use a file under ${PDF_UPLOAD_MAX_LABEL}.`
          : `Please upload a ${DOCUMENT_UPLOAD_LABEL}.`;
        setError(message);
        setTimeout(() => setError(null), 4000);
        return;
      }
      const file = acceptedFiles[0];
      await handleAcceptedFile(file);
    },
    [handleAcceptedFile]
  );

  const handlePhotoConfirm = useCallback(
    async (cleanedFile: File) => {
      setPendingPhoto(null);
      await loadFile(cleanedFile);
    },
    [loadFile]
  );

  const handlePhotoMakeFillable = useCallback(
    async (cleanedFile: File) => {
      setPendingPhoto(null);
      await loadFile(cleanedFile, { makeFillable: true });
    },
    [loadFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: DOCUMENT_DROPZONE_ACCEPT,
    multiple: false,
    maxSize: PDF_UPLOAD_MAX_BYTES,
  });

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div
        {...getRootProps()}
        className={`flex w-full max-w-xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-colors ${
          isDragActive
            ? "border-accent bg-accent/5"
            : "border-border hover:border-accent/50 hover:bg-surface-alt"
        }`}
      >
        <input
          {...getInputProps({
            "data-testid": "document-upload-input",
            "aria-label": "Upload a PDF, JPG, or PNG",
          })}
        />
        {isDragActive ? (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
            <Upload className="h-8 w-8 text-accent" />
          </div>
        ) : (
          <img src="/logo-mark.png" alt="QuickFill" className="h-16 w-16 opacity-80" />
        )}
        <p className="mt-4 text-lg font-semibold text-text">
          {isDragActive ? "Drop your file here" : (
            <>
              <span className="hidden sm:inline">Drag &amp; drop your file here</span>
              <span className="sm:hidden">Tap to browse your file</span>
            </>
          )}
        </p>
        <p className="mt-1 text-sm text-text-muted hidden sm:block">or click to browse</p>
        <p className="mt-4 text-xs text-text-muted">Upload a PDF, JPG, or PNG. Up to {PDF_UPLOAD_MAX_LABEL}.</p>
        <p className="mt-2 text-xs text-text-muted">No account needed. Works with PDFs and common images.</p>
        <div className="mt-5 grid w-full max-w-md gap-2 text-left sm:grid-cols-2">
          <div className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              <p className="text-xs font-semibold text-text">File not stored</p>
              <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
                Your file is used to generate your download, then discarded. It is never saved.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              <p className="text-xs font-semibold text-text">Not read, not shared</p>
              <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
                We don&apos;t access the contents of your document.
              </p>
            </div>
          </div>
        </div>
        {error && (
          <p className="mt-3 text-sm font-medium text-red-500">
            {error}
          </p>
        )}
      </div>
      {pendingPhoto && (
        <PhotoCleanupModal
          file={pendingPhoto}
          makeFillableEnabled={makeFillableEnabled}
          onConfirm={handlePhotoConfirm}
          onMakeFillable={makeFillableEnabled ? handlePhotoMakeFillable : undefined}
          onCancel={() => setPendingPhoto(null)}
        />
      )}
    </div>
  );
}
