"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText } from "lucide-react";

interface UploadZoneProps {
  onFileLoad: (file: File, bytes: ArrayBuffer) => void;
}

export function UploadZone({ onFileLoad }: UploadZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
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
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
          {isDragActive ? (
            <FileText className="h-8 w-8 text-accent" />
          ) : (
            <Upload className="h-8 w-8 text-accent" />
          )}
        </div>
        <p className="mt-4 text-lg font-semibold text-text">
          {isDragActive ? "Drop your PDF here" : "Drag & drop your PDF here"}
        </p>
        <p className="mt-1 text-sm text-text-muted">or click to browse</p>
        <p className="mt-4 text-xs text-text-muted">PDF files only, up to 50MB</p>
      </div>
    </div>
  );
}
