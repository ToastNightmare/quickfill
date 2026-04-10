"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, FileText } from "lucide-react";

interface UploadZoneProps {
  onFileLoad: (file: File, bytes: ArrayBuffer) => void;
}

export function UploadZone({ onFileLoad }: UploadZoneProps) {
  const [sizeError, setSizeError] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setSizeError(false);
      if (rejectedFiles.length > 0) {
        setSizeError(true);
        setTimeout(() => setSizeError(false), 4000);
        return;
      }
      const file = acceptedFiles[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          onFileLoad(file, reader.result);
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [onFileLoad]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    maxSize: 50 * 1024 * 1024, // 50MB
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
        <input {...getInputProps()} />
        {isDragActive ? (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
            <Upload className="h-8 w-8 text-accent" />
          </div>
        ) : (
          <img src="/logo-mark.png" alt="QuickFill" className="h-16 w-16 opacity-80" />
        )}
        <p className="mt-4 text-lg font-semibold text-text">
          {isDragActive ? "Drop your PDF here" : (
            <>
              <span className="hidden sm:inline">Drag &amp; drop your PDF here</span>
              <span className="sm:hidden">Tap to browse your PDF</span>
            </>
          )}
        </p>
        <p className="mt-1 text-sm text-text-muted hidden sm:block">or click to browse</p>
        <p className="mt-4 text-xs text-text-muted">PDF files only, up to 50MB</p>
        {sizeError && (
          <p className="mt-3 text-sm font-medium text-red-500">
            File too large. Please upload a PDF under 50MB.
          </p>
        )}
      </div>
    </div>
  );
}
