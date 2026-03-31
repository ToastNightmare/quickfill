"use client";

import { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { UploadZone } from "@/components/UploadZone";
import { Toolbar } from "@/components/Toolbar";
import { PdfViewer } from "@/components/PdfViewer";
import { useHistory } from "@/lib/use-history";
import { detectAcroFormFields, fillPdf } from "@/lib/pdf-utils";
import type { EditorField, ToolType } from "@/lib/types";

export default function EditorPage() {
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasAcroForm, setHasAcroForm] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pageScales] = useState(() => new Map<number, number>());
  const { fields, set: setFields, undo, redo, reset, canUndo, canRedo } = useHistory();

  const handleFileLoad = useCallback(
    async (file: File, bytes: ArrayBuffer) => {
      setPdfBytes(bytes);
      setFileName(file.name);
      setCurrentPage(0);
      setSelectedFieldId(null);
      setActiveTool(null);

      // Detect AcroForm fields
      try {
        const acroFields = await detectAcroFormFields(bytes);
        if (acroFields.length > 0) {
          setHasAcroForm(true);
          const editorFields: EditorField[] = acroFields.map((af) => {
            if (af.type === "checkbox") {
              return {
                id: af.name,
                type: "checkbox" as const,
                x: af.x,
                y: af.y,
                width: af.width,
                height: af.height,
                page: af.page,
                checked: false,
              };
            }
            return {
              id: af.name,
              type: "text" as const,
              x: af.x,
              y: af.y,
              width: af.width,
              height: af.height,
              page: af.page,
              value: af.value,
              fontSize: 12,
            };
          });
          reset(editorFields);
        } else {
          setHasAcroForm(false);
          reset([]);
        }
      } catch {
        setHasAcroForm(false);
        reset([]);
      }
    },
    [reset]
  );

  const handleFieldAdd = useCallback(
    (field: EditorField) => {
      setFields((prev) => [...prev, field]);
    },
    [setFields]
  );

  const handleFieldUpdate = useCallback(
    (id: string, updates: Partial<EditorField>) => {
      setFields((prev) =>
        prev.map((f) => (f.id === id ? ({ ...f, ...updates } as EditorField) : f))
      );
    },
    [setFields]
  );

  const handleFieldDelete = useCallback(
    (id: string) => {
      setFields((prev) => prev.filter((f) => f.id !== id));
      if (selectedFieldId === id) setSelectedFieldId(null);
    },
    [setFields, selectedFieldId]
  );

  const handleClear = useCallback(() => {
    setFields([]);
    setSelectedFieldId(null);
  }, [setFields]);

  const handleDownload = useCallback(async () => {
    if (!pdfBytes) return;
    setIsDownloading(true);
    try {
      const result = await fillPdf(pdfBytes, fields, pageScales, hasAcroForm);
      const blob = new Blob([result.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.pdf$/i, "") + "-filled.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }, [pdfBytes, fields, pageScales, hasAcroForm, fileName]);

  const handlePageScaleSet = useCallback(
    (page: number, scale: number) => {
      pageScales.set(page, scale);
    },
    [pageScales]
  );

  if (!pdfBytes) {
    return <UploadZone onFileLoad={handleFileLoad} />;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
      <Toolbar
        activeTool={activeTool}
        onToolSelect={setActiveTool}
        onUndo={undo}
        onRedo={redo}
        onClear={handleClear}
        onDownload={handleDownload}
        canUndo={canUndo}
        canRedo={canRedo}
        isDownloading={isDownloading}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar with file name and page nav */}
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
          <p className="truncate text-sm font-medium text-text-muted">{fileName}</p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-alt transition-colors disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm tabular-nums text-text-muted">
                Page {currentPage + 1} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-alt transition-colors disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          {hasAcroForm && (
            <span className="rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
              AcroForm detected
            </span>
          )}
        </div>

        <PdfViewer
          pdfBytes={pdfBytes}
          currentPage={currentPage}
          fields={fields}
          activeTool={activeTool}
          selectedFieldId={selectedFieldId}
          onFieldAdd={handleFieldAdd}
          onFieldUpdate={handleFieldUpdate}
          onFieldSelect={setSelectedFieldId}
          onFieldDelete={handleFieldDelete}
          onPageScaleSet={handlePageScaleSet}
          totalPages={totalPages}
          onTotalPagesChange={setTotalPages}
        />
      </div>
    </div>
  );
}
