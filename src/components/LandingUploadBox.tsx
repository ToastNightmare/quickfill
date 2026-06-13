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

const MAX_SIZE = 15 * 1024 * 1024; // 15MB, matches editor limit

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

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        const bytes = await file.arrayBuffer();
        // Clear any previous editor session so the new file restores cleanly.
        await clearEditorState();
        await savePdfToIndexedDB(bytes);
        saveFileNameToLocalStorage(file.name);
        router.push("/editor");
      } catch {
        setError("That PDF could not be opened. Try a different file.");
        setLoading(false);
      }
    },
    [router]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setError(null);
      if (rejectedFiles.length > 0) {
        setError("Please upload a PDF under 15MB.");
        return;
      }
      const file = acceptedFiles[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    maxSize: MAX_SIZE,
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
        <input {...getInputProps()} aria-label="Upload a PDF" />
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
          {loading ? (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          ) : (
            <Upload className="h-7 w-7 text-accent" />
          )}
        </div>
        <p className="mt-4 text-lg font-semibold text-white">
          {loading
            ? "Opening your PDF..."
            : isDragActive
              ? "Drop your PDF here"
              : "Drag and drop your PDF here"}
        </p>
        {!loading && (
          <>
            <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25">
              <FileText className="h-4 w-4" /> Choose PDF
            </span>
            <p className="mt-3 text-xs text-gray-400">
              PDF files only, up to 15MB. No account needed to start.
            </p>
          </>
        )}
      </div>
      {error && (
        <p className="mt-3 text-center text-sm font-medium text-red-300">{error}</p>
      )}
    </div>
  );
}
