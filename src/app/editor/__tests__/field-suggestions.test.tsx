import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditorPage from "../page";
import {
  createDocumentRevision,
  createFieldSuggestionId,
  type FieldSuggestion,
} from "@/lib/field-suggestions";
import {
  FIELD_SUGGESTION_INTENT_KEY,
  isFieldSuggestionReviewEnabled,
  storeFieldSuggestionIntent,
} from "@/lib/field-suggestion-rollout";
import {
  mapLocalFieldSuggestions,
  type LocalFieldDetectionLifecycleEvent,
  type LocalFieldDetectionSnapshot,
  type LocalFieldDetectionSnapshotKey,
} from "@/lib/local-field-suggestion-provider";
import {
  loadPdfFromIndexedDB,
  savePdfToIndexedDB,
  saveFieldsToLocalStorage,
} from "@/lib/persistence";
import type { EditorField } from "@/lib/types";

const mockGetCompositePreviewURL = jest.fn().mockResolvedValue("data:image/png;base64,preview");
let mockSnapshotMode: "auto-ready" | "manual" = "auto-ready";
let mockViewerInstanceSequence = 0;
let mockSnapshotPublicationCount = 0;
let mockLatestSnapshotCallback: ((event: LocalFieldDetectionLifecycleEvent) => void) | undefined;
let mockLatestSnapshotKey: LocalFieldDetectionSnapshotKey | null = null;
let mockTotalPages = 1;
let mockLatestReviewCallbacks: {
  onTypeChange: (id: string, type: "text" | "checkbox") => void;
  onCommit: (suggestions: readonly FieldSuggestion[]) => void;
  onRetry: () => void;
  onCancel: () => void;
} | null = null;
let mockLatestUndo: (() => void) | null = null;
const mockReduceLocalFieldDetectionLifecycle = jest.fn();

jest.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock("next/link", () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

jest.mock("lucide-react", () => new Proxy({}, {
  get: () => {
    const MockIcon = () => <span data-testid="icon" />;
    return MockIcon;
  },
}));

jest.mock("@/components/UploadZone", () => ({
  UploadZone: ({ onFileLoad }: {
    onFileLoad: (
      upload: {
        pdfBytes: ArrayBuffer;
        fileName: string;
        sourceType: "pdf" | "image";
        skipAcroFormDetection: boolean;
      },
      options?: { requestFieldSuggestions: true; documentRevision: string },
    ) => void | Promise<void>;
  }) => {
    const normalBytes = Uint8Array.from([7, 7, 7]).buffer;
    const fillableBytes = Uint8Array.from([8, 8, 8]).buffer;
    return (
      <div>
        <button
          type="button"
          onClick={() => onFileLoad({
            pdfBytes: normalBytes,
            fileName: "replacement.pdf",
            sourceType: "pdf",
            skipAcroFormDetection: false,
          })}
        >
          Mock normal upload
        </button>
        <button
          type="button"
          onClick={async () => {
            const { createDocumentRevision: revisionFor } = jest.requireActual("@/lib/field-suggestions") as typeof import("@/lib/field-suggestions");
            await onFileLoad(
              {
                pdfBytes: fillableBytes,
                fileName: "fillable-photo.pdf",
                sourceType: "image",
                skipAcroFormDetection: true,
              },
              {
                requestFieldSuggestions: true,
                documentRevision: await revisionFor(fillableBytes),
              },
            );
          }}
        >
          Mock fillable upload
        </button>
        <button
          type="button"
          onClick={() => onFileLoad(
            {
              pdfBytes: fillableBytes,
              fileName: "stale-photo.pdf",
              sourceType: "image",
              skipAcroFormDetection: true,
            },
            {
              requestFieldSuggestions: true,
              documentRevision: `qf-document-v1-${"f".repeat(64)}`,
            },
          )}
        >
          Mock stale fillable upload
        </button>
      </div>
    );
  },
}));

jest.mock("@/components/MobileFiller", () => ({
  MobileFiller: () => null,
}));

jest.mock("@/components/FieldSuggestionReview", () => {
  const actual = jest.requireActual("@/components/FieldSuggestionReview") as typeof import("@/components/FieldSuggestionReview");
  return {
    ...actual,
    FieldSuggestionReview: (props: React.ComponentProps<typeof actual.FieldSuggestionReview>) => {
      mockLatestReviewCallbacks = {
        onTypeChange: props.onTypeChange,
        onCommit: props.onCommit,
        onRetry: props.onRetry,
        onCancel: props.onCancel,
      };
      return <actual.FieldSuggestionReview {...props} />;
    },
  };
});

jest.mock("@/components/Toolbar", () => ({
  Toolbar: ({
    onUndo,
    canUndo,
    onStartOver,
  }: {
    onUndo: () => void;
    canUndo: boolean;
    onStartOver: () => void;
  }) => (
    <div>
      {(() => {
        mockLatestUndo = onUndo;
        return <button type="button" onClick={onUndo} disabled={!canUndo}>Mock undo</button>;
      })()}
      <button type="button" onClick={onStartOver}>Mock start over</button>
    </div>
  ),
}));

jest.mock("@/components/PdfViewer", () => {
  const React = jest.requireActual("react") as typeof import("react");
  return {
    PdfViewer: React.forwardRef(function MockPdfViewer(
      props: {
        pdfBytes: ArrayBuffer;
        currentPage: number;
        zoom: number;
        fields: EditorField[];
        onTotalPagesChange: (count: number) => void;
        onPageChange?: (page: number) => void;
        fieldSuggestionDocumentRevision?: number;
        onFieldSuggestionSnapshotEvent?: (event: LocalFieldDetectionLifecycleEvent) => void;
      },
      ref: React.Ref<unknown>,
    ) {
      const {
        fields,
        onTotalPagesChange,
        fieldSuggestionDocumentRevision,
        onFieldSuggestionSnapshotEvent,
      } = props;
      const viewerInstanceId = React.useRef(0);
      if (viewerInstanceId.current === 0) viewerInstanceId.current = ++mockViewerInstanceSequence;
      const renderGeneration = React.useRef(0);
      const activeKey = React.useRef<LocalFieldDetectionSnapshotKey | null>(null);
      const [refitGeneration, setRefitGeneration] = React.useState(0);

      React.useEffect(() => onTotalPagesChange(mockTotalPages), [onTotalPagesChange]);
      React.useEffect(() => {
        mockLatestSnapshotCallback = onFieldSuggestionSnapshotEvent;
        if (!onFieldSuggestionSnapshotEvent || !fieldSuggestionDocumentRevision) return;
        renderGeneration.current += 1;
        const key: LocalFieldDetectionSnapshotKey = {
          documentRevision: fieldSuggestionDocumentRevision,
          viewerInstanceId: viewerInstanceId.current,
          renderGeneration: renderGeneration.current,
          pageIndex: props.currentPage,
          rotation: 0,
          viewportTransform: [2, 0, 0, -2, 0, 1600],
          canvasWidth: 800,
          canvasHeight: 1000,
          viewportWidth: 600,
          viewportHeight: 800,
          renderedViewportWidth: 800,
          renderedViewportHeight: 1000,
        };
        activeKey.current = key;
        mockLatestSnapshotKey = key;
        onFieldSuggestionSnapshotEvent({ status: "started", key, scanDurationMs: null });
        if (mockSnapshotMode === "auto-ready") {
          const snapshot: LocalFieldDetectionSnapshot = Object.freeze({
            key: Object.freeze(key),
            scanDurationMs: 5,
            boxes: Object.freeze([
              Object.freeze({ x: 160, y: 240, width: 360, height: 48 }),
              Object.freeze({ x: 600, y: 240, width: 36, height: 36 }),
            ]),
          });
          mockSnapshotPublicationCount += 1;
          onFieldSuggestionSnapshotEvent({
            status: "ready",
            key,
            scanDurationMs: 5,
            snapshotPreparationDurationMs: 0,
            snapshot,
          });
        }
        return () => {
          if (activeKey.current !== key) return;
          activeKey.current = null;
          onFieldSuggestionSnapshotEvent({ status: "cancelled", key, scanDurationMs: 5 });
        };
      }, [
        fieldSuggestionDocumentRevision,
        onFieldSuggestionSnapshotEvent,
        props.currentPage,
        props.pdfBytes,
        props.zoom,
        refitGeneration,
      ]);

      React.useImperativeHandle(ref, () => ({
        getCanvasDataURL: () => "data:image/png;base64,base",
        getCanvasDimensions: () => ({ width: 800, height: 1000 }),
        getCanvas: () => null,
        getViewportDims: () => ({ width: 600, height: 800 }),
        editField: jest.fn(),
        getCompositePreviewURL: mockGetCompositePreviewURL,
        refit: () => {
          const key = activeKey.current;
          if (key) onFieldSuggestionSnapshotEvent?.({ status: "cancelled", key, scanDurationMs: 5 });
          activeKey.current = null;
          setRefitGeneration((current) => current + 1);
        },
      }));
      return (
        <div>
          <div
            data-testid="pdf-viewer"
            data-fields={JSON.stringify(fields)}
            data-field-count={fields.length}
          />
          <button type="button" onClick={() => props.onPageChange?.(1)}>Mock viewer page change</button>
        </div>
      );
    }),
  };
});

jest.mock("@/components/ContextPanel", () => ({ ContextPanel: () => null }));
jest.mock("@/components/SignatureModal", () => ({ SignatureModal: () => null }));
jest.mock("@/components/WelcomeModal", () => ({ WelcomeModal: () => null }));
jest.mock("@/components/TourModal", () => ({ TourModal: () => null }));
jest.mock("@/components/SupportForm", () => ({ SupportForm: () => null }));
jest.mock("@/components/DownloadPreviewGate", () => ({ DownloadPreviewGate: () => null }));
jest.mock("@/components/PhotoCleanupModal", () => ({ PhotoCleanupModal: () => null }));

jest.mock("@/lib/persistence", () => ({
  savePdfToIndexedDB: jest.fn().mockResolvedValue(undefined),
  loadPdfFromIndexedDB: jest.fn().mockResolvedValue(null),
  saveFieldsToLocalStorage: jest.fn(),
  loadFieldsFromLocalStorage: jest.fn(() => []),
  savePageToLocalStorage: jest.fn(),
  loadPageFromLocalStorage: jest.fn(() => 0),
  saveFileNameToLocalStorage: jest.fn(),
  loadFileNameFromLocalStorage: jest.fn(() => "photo.pdf"),
  clearEditorState: jest.fn().mockResolvedValue(undefined),
  saveZoomToLocalStorage: jest.fn(),
  loadZoomFromLocalStorage: jest.fn(() => 100),
  cleanupOldIndexedDBSessions: jest.fn(),
}));

jest.mock("@/lib/pdf-utils", () => ({
  detectAcroFormFields: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/lib/meta-pixel", () => ({ trackMetaEvent: jest.fn() }));
jest.mock("@/lib/editor-profile-autofill", () => ({
  runEditorProfileAutofill: jest.fn(),
  trackEditorAutofillShadowReport: jest.fn(),
}));
jest.mock("@/lib/templates-config", () => ({
  getTemplateBySlug: jest.fn(),
  isTemplateFillable: jest.fn(),
}));
jest.mock("@/lib/pdfjs-client", () => ({
  loadPdfjsClient: jest.fn().mockResolvedValue({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({ getViewport: () => ({ width: 600, height: 800 }) }),
      }),
    }),
  }),
}));

jest.mock("@/lib/field-suggestion-rollout", () => {
  const actual = jest.requireActual("@/lib/field-suggestion-rollout");
  return {
    ...actual,
    isFieldSuggestionReviewEnabled: jest.fn(() => true),
  };
});

jest.mock("@/lib/local-field-suggestion-provider", () => {
  const actual = jest.requireActual("@/lib/local-field-suggestion-provider") as typeof import("@/lib/local-field-suggestion-provider");
  return {
    ...actual,
    reduceLocalFieldDetectionLifecycle: (
      ...args: Parameters<typeof actual.reduceLocalFieldDetectionLifecycle>
    ) => {
      mockReduceLocalFieldDetectionLifecycle(...args);
      return actual.reduceLocalFieldDetectionLifecycle(...args);
    },
    mapLocalFieldSuggestions: jest.fn(),
  };
});

const mockedLoadPdf = loadPdfFromIndexedDB as jest.MockedFunction<typeof loadPdfFromIndexedDB>;
const mockedSavePdf = savePdfToIndexedDB as jest.MockedFunction<typeof savePdfToIndexedDB>;
const mockedSaveFields = saveFieldsToLocalStorage as jest.MockedFunction<typeof saveFieldsToLocalStorage>;
const mockedRolloutEnabled = isFieldSuggestionReviewEnabled as jest.MockedFunction<typeof isFieldSuggestionReviewEnabled>;
const mockedMapLocal = mapLocalFieldSuggestions as jest.MockedFunction<typeof mapLocalFieldSuggestions>;

function suggestedFields(documentRevision: string): FieldSuggestion[] {
  const textBounds = { x: 80, y: 120, width: 180, height: 24 };
  const checkboxBounds = { x: 300, y: 120, width: 18, height: 18 };
  return [
    {
      schemaVersion: 1,
      id: createFieldSuggestionId({ documentRevision, pageIndex: 0, boundingBox: textBounds }),
      documentRevision,
      type: "text",
      pageIndex: 0,
      boundingBox: textBounds,
      coordinateSpace: { unit: "pdf-point", origin: "top-left", pageWidth: 600, pageHeight: 800 },
      confidence: 0.58,
      metadata: { category: "visual-box" },
    },
    {
      schemaVersion: 1,
      id: createFieldSuggestionId({ documentRevision, pageIndex: 0, boundingBox: checkboxBounds }),
      documentRevision,
      type: "checkbox",
      pageIndex: 0,
      boundingBox: checkboxBounds,
      coordinateSpace: { unit: "pdf-point", origin: "top-left", pageWidth: 600, pageHeight: 800 },
      confidence: 0.72,
      metadata: { category: "visual-box" },
    },
  ];
}

function publishLatestSnapshot(
  overrides: Partial<LocalFieldDetectionSnapshotKey> = {},
  status: "ready" | "failed" | "cancelled" = "ready",
  snapshotPreparationDurationMs = 0,
) {
  if (!mockLatestSnapshotCallback || !mockLatestSnapshotKey) throw new Error("No active snapshot publisher");
  const key = { ...mockLatestSnapshotKey, ...overrides };
  if (status === "failed") {
    mockLatestSnapshotCallback({ status, key, scanDurationMs: null, reason: "render-failed" });
    return;
  }
  if (status === "cancelled") {
    mockLatestSnapshotCallback({ status, key, scanDurationMs: null });
    return;
  }
  const snapshot: LocalFieldDetectionSnapshot = Object.freeze({
    key: Object.freeze(key),
    scanDurationMs: 5,
    boxes: Object.freeze([
      Object.freeze({ x: 160, y: 240, width: 360, height: 48 }),
      Object.freeze({ x: 600, y: 240, width: 36, height: 36 }),
    ]),
  });
  mockSnapshotPublicationCount += 1;
  mockLatestSnapshotCallback({
    status,
    key,
    scanDurationMs: 5,
    snapshotPreparationDurationMs,
    snapshot,
  });
}

function expectReleasedAndBlockedSnapshot() {
  if (!mockLatestSnapshotCallback || !mockLatestSnapshotKey) throw new Error("No active snapshot publisher");
  const callback = mockLatestSnapshotCallback;
  const completedKey = mockLatestSnapshotKey;

  mockReduceLocalFieldDetectionLifecycle.mockClear();
  act(() => publishLatestSnapshot());
  expect(mockReduceLocalFieldDetectionLifecycle).not.toHaveBeenCalled();

  const nextKey = {
    ...completedKey,
    renderGeneration: completedKey.renderGeneration + 1,
  };
  act(() => callback({ status: "started", key: nextKey, scanDurationMs: null }));
  expect(mockReduceLocalFieldDetectionLifecycle).toHaveBeenLastCalledWith(
    null,
    expect.objectContaining({ status: "started", key: nextKey }),
    completedKey.documentRevision,
  );
}

function editorFields(): EditorField[] {
  const value = screen.getByTestId("pdf-viewer").getAttribute("data-fields") ?? "[]";
  return JSON.parse(value) as EditorField[];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function renderPhotoSession(options: {
  photoSession?: boolean;
  intentRevision?: string;
  pageIndex?: number;
  mapper?: (revision: string) => FieldSuggestion[];
} = {}) {
  const bytes = Uint8Array.from([1, 2, 3, 4]).buffer;
  const documentRevision = await createDocumentRevision(bytes);
  mockedLoadPdf.mockResolvedValue(bytes);
  if (options.photoSession !== false) sessionStorage.setItem("qf-photo-capture-source", "1");

  const intentRevision = options.intentRevision ?? documentRevision;
  if (options.pageIndex === undefined || options.pageIndex === 0) {
    storeFieldSuggestionIntent(intentRevision);
  } else {
    sessionStorage.setItem(FIELD_SUGGESTION_INTENT_KEY, JSON.stringify({
      version: 1,
      documentRevision: intentRevision,
      pageIndex: options.pageIndex,
    }));
  }
  mockedMapLocal.mockImplementation((request) => ({
    status: "ready",
    suggestions: (options.mapper ?? suggestedFields)(documentRevision),
    mappingDurationMs: 1,
    incrementalDurationMs: request.incrementalDurationMs + 1,
  }));
  render(<EditorPage />);
  return { bytes, documentRevision };
}

describe("editor local field suggestion review", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("qf_welcome_dismissed", "1");
    localStorage.setItem("quickfill_welcomed", "1");
    localStorage.setItem("quickfill_tour_done", "1");
    mockedLoadPdf.mockResolvedValue(null);
    mockedSavePdf.mockResolvedValue(undefined);
    mockedRolloutEnabled.mockReturnValue(true);
    mockedMapLocal.mockReset();
    mockedMapLocal.mockImplementation((request) => ({
      status: "ready",
      suggestions: suggestedFields(request.documentRevision),
      mappingDurationMs: 1,
      incrementalDurationMs: request.incrementalDurationMs + 1,
    }));
    mockSnapshotMode = "auto-ready";
    mockViewerInstanceSequence = 0;
    mockSnapshotPublicationCount = 0;
    mockLatestSnapshotCallback = undefined;
    mockLatestSnapshotKey = null;
    mockTotalPages = 1;
    mockLatestReviewCallbacks = null;
    mockLatestUndo = null;
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it("keeps the existing photo entry and add-page prompt unchanged when disabled", async () => {
    mockedRolloutEnabled.mockReturnValue(false);
    const bytes = Uint8Array.from([1, 2, 3]).buffer;
    mockedLoadPdf.mockResolvedValue(bytes);
    sessionStorage.setItem("qf-photo-capture-source", "1");
    storeFieldSuggestionIntent(await createDocumentRevision(bytes));

    render(<EditorPage />);

    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
    expect(mockedMapLocal).not.toHaveBeenCalled();
    expect(mockLatestSnapshotCallback).toBeUndefined();
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
  });

  it("activates the shared local-review path only in the enabled mode", async () => {
    await renderPhotoSession();

    expect(await screen.findByRole("heading", { name: "Review fillable field suggestions" })).toBeInTheDocument();
    expect(mockLatestSnapshotCallback).toEqual(expect.any(Function));
    expect(mockedMapLocal).toHaveBeenCalledTimes(1);
    const request = mockedMapLocal.mock.calls[0][0];
    expect(request.incrementalDurationMs).toBeGreaterThanOrEqual(0);
    expect(request.incrementalDurationMs).toBeLessThanOrEqual(10);
  });

  it("keeps suggestions out of fields, persistence, preview, export, and the API before acceptance", async () => {
    await renderPhotoSession();

    expect(await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 })).toBeInTheDocument();
    expect(editorFields()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Add another page" })).not.toBeInTheDocument();
    await waitFor(() => expect(mockedSaveFields).toHaveBeenCalled());
    expect(mockedSaveFields.mock.calls.every(([saved]) => saved.length === 0)).toBe(true);
    expect(mockGetCompositePreviewURL).not.toHaveBeenCalled();

    const requestUrls = (global.fetch as jest.Mock).mock.calls.map(([input]) => String(input));
    expect(requestUrls.some((url) => url.includes("/api/detect-fields"))).toBe(false);
    expect(requestUrls.some((url) => url.includes("/api/fill-pdf"))).toBe(false);
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
  });

  it("accepts all as one history checkpoint and one Undo removes the batch", async () => {
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));

    await waitFor(() => expect(editorFields()).toHaveLength(2));
    const accepted = editorFields();
    expect(accepted.find((field) => field.type === "text")).toMatchObject({ value: "", page: 0 });
    expect(accepted.find((field) => field.type === "checkbox")).toMatchObject({ checked: false, page: 0 });
    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    const undoButtons = screen.getAllByRole("button", { name: "Mock undo" });
    expect(undoButtons[0]).toBeEnabled();
    fireEvent.click(undoButtons[0]);

    await waitFor(() => expect(editorFields()).toEqual([]));
    expect(screen.getAllByRole("button", { name: "Mock undo" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
  });

  it("supports individual accept, reject, and text-to-checkbox changes transactionally", async () => {
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });

    fireEvent.change(screen.getAllByRole("combobox", { name: "Field type" })[0], { target: { value: "checkbox" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept field 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject field 2" }));
    expect(editorFields()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Add accepted fields (1)" }));

    await waitFor(() => expect(editorFields()).toHaveLength(1));
    expect(editorFields()[0]).toMatchObject({ type: "checkbox", checked: false, page: 0 });
  });

  it("cancels without accepting fields and then shows the add-page prompt", async () => {
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Accept field 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue in editor" }));

    expect(editorFields()).toEqual([]);
    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
  });

  it("retries by replacing the same stable IDs instead of duplicating them", async () => {
    const { documentRevision } = await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });
    const ids = suggestedFields(documentRevision).map((suggestion) => suggestion.id);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(mockedMapLocal).toHaveBeenCalledTimes(2));
    expect(mockSnapshotPublicationCount).toBe(1);
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });
    for (const id of ids) expect(screen.getAllByTestId(`field-suggestion-${id}`)).toHaveLength(1);
    expect(editorFields()).toEqual([]);
  });

  it("supports a waiter registered before the shared snapshot becomes ready", async () => {
    mockSnapshotMode = "manual";
    await renderPhotoSession();
    expect(await screen.findByRole("heading", { name: "Finding fillable areas" })).toBeInTheDocument();
    expect(mockedMapLocal).not.toHaveBeenCalled();
    await waitFor(() => expect(mockLatestSnapshotKey).not.toBeNull());

    act(() => publishLatestSnapshot());

    expect(await screen.findByRole("heading", { name: "Review fillable field suggestions" })).toBeInTheDocument();
    expect(mockedMapLocal).toHaveBeenCalledTimes(1);
  });

  it("fails closed before mapping when snapshot preparation plus callback handling exceeds 10 ms", async () => {
    mockSnapshotMode = "manual";
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Finding fillable areas" });
    await waitFor(() => expect(mockLatestSnapshotKey).not.toBeNull());

    act(() => publishLatestSnapshot({}, "ready", 10.001));

    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
    expect(mockedMapLocal).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
  });

  it("fails closed when final suggestion copying and state publication exceed the cumulative budget", async () => {
    mockSnapshotMode = "manual";
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Finding fillable areas" });
    await waitFor(() => expect(mockLatestSnapshotKey).not.toBeNull());
    mockedMapLocal.mockImplementation((request) => ({
      status: "ready",
      suggestions: suggestedFields(request.documentRevision),
      mappingDurationMs: 1,
      incrementalDurationMs: 10.001,
    }));

    act(() => publishLatestSnapshot());

    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
    expect(editorFields()).toEqual([]);
    expect(mockedMapLocal).toHaveBeenCalledTimes(1);
    expectReleasedAndBlockedSnapshot();
    expect(mockedMapLocal).toHaveBeenCalledTimes(1);
  });

  it("releases and blocks a waiting key at the five-second timeout and rejects its late ready event", async () => {
    jest.useFakeTimers();
    mockSnapshotMode = "manual";
    await renderPhotoSession();
    expect(await screen.findByRole("heading", { name: "Finding fillable areas" })).toBeInTheDocument();
    await waitFor(() => expect(mockLatestSnapshotKey).not.toBeNull());

    act(() => jest.advanceTimersByTime(5_000));

    expect(screen.getByRole("button", { name: "Add another page" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Finding fillable areas" })).not.toBeInTheDocument();
    expect(mockedMapLocal).not.toHaveBeenCalled();
    expectReleasedAndBlockedSnapshot();
    expect(mockedMapLocal).not.toHaveBeenCalled();
  });

  it("ignores a late ready result after invalidation while waiting", async () => {
    mockSnapshotMode = "manual";
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Finding fillable areas" });
    await waitFor(() => expect(mockLatestSnapshotKey).not.toBeNull());

    fireEvent.click(screen.getAllByRole("button", { name: "Mock start over" })[0]);
    act(() => publishLatestSnapshot());

    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("pdf-viewer")).not.toBeInTheDocument();
    expect(mockedMapLocal).not.toHaveBeenCalled();
  });

  it("settles a failed shared snapshot into the normal editor without an error state", async () => {
    mockSnapshotMode = "manual";
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Finding fillable areas" });
    await waitFor(() => expect(mockLatestSnapshotKey).not.toBeNull());

    act(() => publishLatestSnapshot({}, "failed"));

    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Couldn’t suggest fields" })).not.toBeInTheDocument();
    expect(editorFields()).toEqual([]);
  });

  it("coalesces rapid retries onto one immutable snapshot without another publication", async () => {
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" });
    const callbacks = mockLatestReviewCallbacks;
    if (!callbacks) throw new Error("Expected review callbacks");

    act(() => {
      callbacks.onRetry();
      callbacks.onRetry();
    });

    await screen.findByRole("heading", { name: "Review fillable field suggestions" });
    expect(mockedMapLocal).toHaveBeenCalledTimes(2);
    expect(mockSnapshotPublicationCount).toBe(1);
  });

  it.each(["zoom", "refit", "page", "replacement"] as const)(
    "makes captured review actions harmless after %s invalidation",
    async (invalidation) => {
      if (invalidation === "page") mockTotalPages = 2;
      const { documentRevision } = await renderPhotoSession();
      await screen.findByRole("heading", { name: "Review fillable field suggestions" });
      const callbacks = mockLatestReviewCallbacks;
      const staleUndo = mockLatestUndo;
      if (!callbacks) throw new Error("Expected review callbacks");

      if (invalidation === "zoom") fireEvent.click(screen.getByTitle("Zoom In"));
      if (invalidation === "refit") fireEvent.click(screen.getByRole("button", { name: "Fit document to screen width" }));
      if (invalidation === "page") fireEvent.click(screen.getByRole("button", { name: "Mock viewer page change" }));
      if (invalidation === "replacement") {
        fireEvent.click(screen.getAllByRole("button", { name: "Mock start over" })[0]);
        fireEvent.click(await screen.findByRole("button", { name: "Mock normal upload" }));
      }
      await waitFor(() => {
        expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
      });

      act(() => {
        callbacks.onTypeChange(suggestedFields(documentRevision)[0].id, "checkbox");
        callbacks.onRetry();
        callbacks.onCommit(suggestedFields(documentRevision));
        staleUndo?.();
      });

      await waitFor(() => expect(editorFields()).toEqual([]));
    },
  );

  it("keeps already accepted current-document fields when a later render identity is invalidated", async () => {
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" });
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    await waitFor(() => expect(editorFields()).toHaveLength(2));

    fireEvent.click(screen.getByTitle("Zoom In"));

    await waitFor(() => expect(editorFields()).toHaveLength(2));
  });

  it("falls back to the normal editor with zero fields and no error when snapshot mapping fails", async () => {
    await renderPhotoSession({ mapper: () => { throw new Error("local mapping failed"); } });

    expect(await screen.findByRole("button", { name: "Add another page" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Couldn’t suggest fields" })).not.toBeInTheDocument();
    expect(editorFields()).toEqual([]);
    expect(mockedMapLocal).toHaveBeenCalledTimes(1);
    expectReleasedAndBlockedSnapshot();
    expect(mockedMapLocal).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale-document intent", async () => {
    const staleRevision = `qf-document-v1-${"b".repeat(64)}`;
    await renderPhotoSession({ intentRevision: staleRevision });
    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
    expect(mockedMapLocal).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
  });

  it("rejects a non-first-page intent", async () => {
    await renderPhotoSession({ pageIndex: 1 });
    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
    expect(mockedMapLocal).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
  });

  it("rejects an intent that did not come from a photo session", async () => {
    await renderPhotoSession({ photoSession: false });
    await screen.findByTestId("pdf-viewer");
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add another page" })).not.toBeInTheDocument();
    expect(mockedMapLocal).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
  });

  it("clears review state on Start Over and a normal replacement stays normal", async () => {
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });

    fireEvent.click(screen.getAllByRole("button", { name: "Mock start over" })[0]);
    expect(await screen.findByRole("button", { name: "Mock normal upload" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mock normal upload" }));
    await screen.findByTestId("pdf-viewer");
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
  });

  it("lets the newest same-sized document load win when replacements overlap", async () => {
    const firstSave = deferred<void>();
    mockedSavePdf
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(undefined);
    render(<EditorPage />);
    const upload = await screen.findByRole("button", { name: "Mock fillable upload" });

    fireEvent.click(upload);
    await waitFor(() => expect(mockedSavePdf).toHaveBeenCalledTimes(1));
    fireEvent.click(upload);
    await waitFor(() => expect(mockedSavePdf).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: "Review fillable field suggestions" })).toBeInTheDocument();
    expect(mockedMapLocal).toHaveBeenCalledTimes(1);

    await act(async () => firstSave.resolve());

    expect(screen.getByRole("heading", { name: "Review fillable field suggestions" })).toBeInTheDocument();
    expect(mockedMapLocal).toHaveBeenCalledTimes(1);
    expect(mockSnapshotPublicationCount).toBe(1);
    expect(editorFields()).toEqual([]);
  });

  it("accepts a direct cleaned-photo request only when its revision matches", async () => {
    render(<EditorPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Mock fillable upload" }));
    expect(await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue in editor" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Mock start over" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Mock stale fillable upload" }));
    await screen.findByTestId("pdf-viewer");
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
  });
});
