import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import EditorPage from "../page";
import { trackEvent } from "@/lib/analytics";
import type { EditorField } from "@/lib/types";

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
  UploadZone: ({ onFileLoad }: { onFileLoad: (upload: { pdfBytes: ArrayBuffer; fileName: string }) => void }) => (
    <button
      type="button"
      onClick={() => onFileLoad({ pdfBytes: new ArrayBuffer(8), fileName: "test.pdf" })}
    >
      Mock upload
    </button>
  ),
}));

jest.mock("@/components/MobileFiller", () => ({
  MobileFiller: () => null,
}));

jest.mock("@/components/Toolbar", () => ({
  Toolbar: () => null,
}));

// Page viewport dimensions reported by the mocked PdfViewer.
// Tests mutate this to exercise clamping / missing-dimension paths.
let mockViewportDims: { width: number; height: number } | null = { width: 600, height: 800 };

jest.mock("@/components/PdfViewer", () => {
  const React = jest.requireActual("react");
  return {
    PdfViewer: React.forwardRef(function MockPdfViewer(
      props: {
        fields: EditorField[];
        selectedFieldId: string | null;
        onFieldAdd: (field: EditorField) => EditorField;
        onFieldDuplicate?: (id: string) => void;
      },
      ref: React.Ref<unknown>
    ) {
      React.useImperativeHandle(ref, () => ({
        getCanvasDataURL: () => "data:image/png;base64,base",
        getCanvasDimensions: () => ({ width: 100, height: 100 }),
        getCanvas: () => null,
        getViewportDims: () => mockViewportDims,
        editField: jest.fn(),
        getCompositePreviewURL: jest.fn().mockResolvedValue("data:image/png;base64,composite"),
      }));
      return (
        <div data-testid="pdf-viewer">
          <div data-testid="selected-field-id">{props.selectedFieldId ?? "none"}</div>
          <div data-testid="fields-json">{JSON.stringify(props.fields)}</div>
          <input aria-label="Mock text input" />
          <button
            type="button"
            onClick={() =>
              props.onFieldAdd({
                id: "text-1",
                type: "text",
                x: 10,
                y: 10,
                width: 120,
                height: 24,
                page: 0,
                value: "hello",
                fontSize: 14,
              })
            }
          >
            Mock place text
          </button>
          <button
            type="button"
            onClick={() =>
              props.onFieldAdd({
                id: "text-edge",
                type: "text",
                x: 500,
                y: 770,
                width: 120,
                height: 24,
                page: 0,
                value: "edge",
                fontSize: 14,
              })
            }
          >
            Mock place edge text
          </button>
          <button
            type="button"
            onClick={() =>
              props.onFieldAdd({
                id: "text-wide",
                type: "text",
                x: 10,
                y: 10,
                width: 700,
                height: 900,
                page: 0,
                value: "wide",
                fontSize: 14,
              })
            }
          >
            Mock place oversized text
          </button>
          <button
            type="button"
            onClick={() =>
              props.onFieldAdd({
                id: "check-1",
                type: "checkbox",
                x: 30,
                y: 30,
                width: 20,
                height: 20,
                page: 0,
                checked: true,
                stamp: "tick",
              })
            }
          >
            Mock place checkbox
          </button>
          <button
            type="button"
            onClick={() =>
              props.onFieldAdd({
                id: "sig-1",
                type: "signature",
                x: 40,
                y: 40,
                width: 160,
                height: 48,
                page: 0,
                value: "",
                fontSize: 14,
                signatureDataUrl: "data:image/png;base64,signature",
              })
            }
          >
            Mock place signature
          </button>
          {/* Simulates the right-click context menu Duplicate item, which now
              routes through the unified onFieldDuplicate prop. */}
          <button
            type="button"
            onClick={() => props.onFieldDuplicate?.("text-1")}
          >
            Mock context duplicate text
          </button>
          <button
            type="button"
            onClick={() => props.onFieldDuplicate?.("check-1")}
          >
            Mock context duplicate checkbox
          </button>
          <button
            type="button"
            onClick={() => props.onFieldDuplicate?.("sig-1")}
          >
            Mock context duplicate signature
          </button>
        </div>
      );
    }),
  };
});

jest.mock("@/components/ContextPanel", () => ({
  ContextPanel: () => null,
}));

jest.mock("@/components/SignatureModal", () => ({
  SignatureModal: () => null,
}));

jest.mock("@/components/WelcomeModal", () => ({
  WelcomeModal: () => null,
}));

jest.mock("@/components/TourModal", () => ({
  TourModal: () => null,
}));

jest.mock("@/components/SupportForm", () => ({
  SupportForm: () => null,
}));

jest.mock("@/components/DownloadPreviewGate", () => ({
  DownloadPreviewGate: () => null,
}));

jest.mock("@/components/PhotoCleanupModal", () => ({
  PhotoCleanupModal: () => null,
}));

jest.mock("@/lib/persistence", () => ({
  savePdfToIndexedDB: jest.fn().mockResolvedValue(undefined),
  loadPdfFromIndexedDB: jest.fn().mockResolvedValue(null),
  saveFieldsToLocalStorage: jest.fn(),
  loadFieldsFromLocalStorage: jest.fn(() => []),
  savePageToLocalStorage: jest.fn(),
  loadPageFromLocalStorage: jest.fn(() => 0),
  saveFileNameToLocalStorage: jest.fn(),
  loadFileNameFromLocalStorage: jest.fn(() => "test.pdf"),
  clearEditorState: jest.fn().mockResolvedValue(undefined),
  saveZoomToLocalStorage: jest.fn(),
  loadZoomFromLocalStorage: jest.fn(() => 100),
  cleanupOldIndexedDBSessions: jest.fn(),
}));

jest.mock("@/lib/pdf-utils", () => ({
  detectAcroFormFields: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/analytics", () => ({
  trackEvent: jest.fn(),
}));

jest.mock("@/lib/meta-pixel", () => ({
  trackMetaEvent: jest.fn(),
}));

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
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
        }),
      }),
    }),
  }),
}));

async function loadEditorWithPdf() {
  render(<EditorPage />);
  fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
  await screen.findByTestId("pdf-viewer");
}

function getFields(): EditorField[] {
  return JSON.parse(screen.getByTestId("fields-json").textContent ?? "[]");
}

function selectedFieldId(): string {
  return screen.getByTestId("selected-field-id").textContent ?? "";
}

function placeText() {
  fireEvent.click(screen.getByRole("button", { name: "Mock place text" }));
}

function pressCtrlD(target: Element | Window = window, useMeta = false) {
  fireEvent.keyDown(target, useMeta ? { key: "d", metaKey: true } : { key: "d", ctrlKey: true });
}

describe("Duplicate field hardening", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockViewportDims = { width: 600, height: 800 };
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("duplicates the selected field with Ctrl+D, preserving type/value/fontSize/page with a fresh id", async () => {
    await loadEditorWithPdf();
    placeText(); // text fields auto-select on add

    pressCtrlD();

    const fields = getFields();
    expect(fields).toHaveLength(2);
    const [original, copy] = fields;
    expect(copy.id).not.toBe(original.id);
    expect(copy.type).toBe("text");
    expect((copy as { value: string }).value).toBe("hello");
    expect((copy as { fontSize: number }).fontSize).toBe(14);
    expect(copy.page).toBe(0);
  });

  it("duplicates with Cmd+D (metaKey)", async () => {
    await loadEditorWithPdf();
    placeText();

    pressCtrlD(window, true);

    expect(getFields()).toHaveLength(2);
  });

  it("offsets the copy by +12/+12 in the normal case", async () => {
    await loadEditorWithPdf();
    placeText();

    pressCtrlD();

    const [, copy] = getFields();
    expect(copy.x).toBe(22);
    expect(copy.y).toBe(22);
  });

  it("selects the copy after duplicating", async () => {
    await loadEditorWithPdf();
    placeText();

    pressCtrlD();

    const [, copy] = getFields();
    expect(selectedFieldId()).toBe(copy.id);
  });

  it("does not mutate the original field", async () => {
    await loadEditorWithPdf();
    placeText();

    pressCtrlD();

    const [original] = getFields();
    expect(original.id).toBe("text-1");
    expect(original.x).toBe(10);
    expect(original.y).toBe(10);
    expect((original as { value: string }).value).toBe("hello");
  });

  it("clamps the copy inside page bounds near the right/bottom edge", async () => {
    await loadEditorWithPdf();
    fireEvent.click(screen.getByRole("button", { name: "Mock place edge text" }));

    pressCtrlD();

    const [, copy] = getFields();
    // Page 600x800, field 120x24 at (500, 770): clamped to (480, 776)
    expect(copy.x).toBe(600 - 120);
    expect(copy.y).toBe(800 - 24);
  });

  it("pins the copy to the top/left edge when the field is larger than the page", async () => {
    await loadEditorWithPdf();
    fireEvent.click(screen.getByRole("button", { name: "Mock place oversized text" }));

    pressCtrlD();

    const [, copy] = getFields();
    expect(copy.x).toBe(0);
    expect(copy.y).toBe(0);
  });

  it("falls back to the plain +12/+12 offset when page dimensions are unavailable", async () => {
    await loadEditorWithPdf();
    mockViewportDims = null;
    fireEvent.click(screen.getByRole("button", { name: "Mock place edge text" }));

    pressCtrlD();

    const [, copy] = getFields();
    expect(copy.x).toBe(512);
    expect(copy.y).toBe(782);
  });

  it("preserves checkbox checked state when duplicating", async () => {
    await loadEditorWithPdf();
    fireEvent.click(screen.getByRole("button", { name: "Mock place checkbox" }));

    fireEvent.click(screen.getByRole("button", { name: "Mock context duplicate checkbox" }));

    const fields = getFields();
    expect(fields).toHaveLength(2);
    const copy = fields[1] as { checked: boolean; stamp?: string };
    expect(copy.checked).toBe(true);
    expect(copy.stamp).toBe("tick");
  });

  it("preserves signatureDataUrl when duplicating", async () => {
    await loadEditorWithPdf();
    fireEvent.click(screen.getByRole("button", { name: "Mock place signature" }));

    fireEvent.click(screen.getByRole("button", { name: "Mock context duplicate signature" }));

    const fields = getFields();
    expect(fields).toHaveLength(2);
    expect((fields[1] as { signatureDataUrl?: string }).signatureDataUrl).toBe(
      "data:image/png;base64,signature"
    );
  });

  it("does not duplicate while typing inside an input", async () => {
    await loadEditorWithPdf();
    placeText();

    pressCtrlD(screen.getByLabelText("Mock text input"));

    expect(getFields()).toHaveLength(1);
  });

  it("removes the duplicate on undo", async () => {
    await loadEditorWithPdf();
    placeText();

    pressCtrlD();
    expect(getFields()).toHaveLength(2);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(getFields()).toHaveLength(1);
    expect(getFields()[0].id).toBe("text-1");
  });

  it("fires the analytics event with source: duplicate", async () => {
    await loadEditorWithPdf();
    placeText();
    (trackEvent as jest.Mock).mockClear();

    pressCtrlD();

    expect(trackEvent).toHaveBeenCalledWith("field_added", { source: "duplicate", type: "text" });
  });

  it("routes context-menu duplicate through the same path (offset, selection, analytics)", async () => {
    await loadEditorWithPdf();
    placeText();
    (trackEvent as jest.Mock).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Mock context duplicate text" }));

    const fields = getFields();
    expect(fields).toHaveLength(2);
    const copy = fields[1];
    expect(copy.x).toBe(22);
    expect(copy.y).toBe(22);
    expect(selectedFieldId()).toBe(copy.id);
    expect(trackEvent).toHaveBeenCalledWith("field_added", { source: "duplicate", type: "text" });
  });
});
