"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, FileText } from "lucide-react";
import {
  savePdfToIndexedDB,
  saveFileNameToLocalStorage,
  clearEditorState,
} from "@/lib/persistence";
import { normalizeDocumentUpload } from "@/lib/document-intake";
import { isCleanablePhoto } from "@/lib/image-cleanup";
import { PhotoCleanupModal } from "@/components/PhotoCleanupModal";
import { DOCUMENT_DROPZONE_ACCEPT, PDF_UPLOAD_MAX_BYTES, PDF_UPLOAD_MAX_LABEL } from "@/lib/upload-limits";

/**
 * Real above-the-fold upload box for the /pdf-form-filler landing page.
 *
 * It connects to the existing upload/editor flow without duplicating any logic:
 * the dropped PDF is written to IndexedDB using the same persistence helpers the
 * editor uses, then we route to /editor, which auto-restores the file on mount.
 * No fake upload box, no new backend, no new analytics events.
 */
export function LandingUploadBox() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        const upload = await normalizeDocumentUpload(file);
        // Clear any previous editor session so the new file restores cleanly.
        await clearEditorState();
        await savePdfToIndexedDB(upload.pdfBytes);
        saveFileNameToLocalStorage(upload.fileName);
        router.push("/editor");
      } catch (error) {
        setError(error instanceof Error ? error.message : "That file could not be opened. Try a different file.");
        setLoading(false);
      }
    },
    [router]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setError(null);
      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        setError(
          rejection?.errors.some((item) => item.code === "file-too-large")
            ? `Please upload a file under ${PDF_UPLOAD_MAX_LABEL}.`
            : "Please upload a PDF, JPG, or PNG."
        );
        return;
      }
      const file = acceptedFiles[0];
      if (!file) return;
      if (isCleanablePhoto(file)) {
        // Photos go through the cleanup modal; PDFs load directly.
        setPendingPhoto(file);
        return;
      }
      void handleFile(file);
    },
    [handleFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: DOCUMENT_DROPZONE_ACCEPT,
    multiple: false,
    maxSize: PDF_UPLOAD_MAX_BYTES,
  });

  return (
    <div className="mx-auto mt-10 w-full max-w-xl">
      <div
        {...getRootProps()}
        className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white/5 p-8 text-center transition-colors sm:p-10 ${
          isDragActive
            ? "border-accent bg-accent/10"
            : "border-white/25 hover:border-accent/70 hover:bg-white/10"
        }`}
      >
        <input {...getInputProps()} aria-label="Upload a PDF, JPG, or PNG" />
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
          {loading ? (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          ) : (
            <Upload className="h-7 w-7 text-accent" />
          )}
        </div>
        <p className="mt-4 text-lg font-semibold text-white">
          {loading
            ? "Opening your file..."
            : isDragActive
              ? "Drop your file here"
              : "Drag and drop your file here"}
        </p>
        {!loading && (
          <>
            <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25">
              <FileText className="h-4 w-4" /> Choose file
            </span>
            <p className="mt-3 text-xs text-gray-400">
              Upload a PDF, JPG, or PNG. Up to {PDF_UPLOAD_MAX_LABEL}. No account needed to start.
            </p>
          </>
        )}
      </div>
      {error && (
        <p className="mt-3 text-center text-sm font-medium text-red-300">{error}</p>
      )}
      {pendingPhoto && (
        <PhotoCleanupModal
          file={pendingPhoto}
          onConfirm={(cleanedFile) => {
            setPendingPhoto(null);
            void handleFile(cleanedFile);
          }}
          onCancel={() => setPendingPhoto(null)}
        />
      )}
    </div>
  );
}
