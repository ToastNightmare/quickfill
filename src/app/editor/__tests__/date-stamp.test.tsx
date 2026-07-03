import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import EditorPage from "../page";
import type { EditorField, ToolType } from "@/lib/types";

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
  Toolbar: ({
    activeTool,
    onToolSelect,
  }: {
    activeTool: ToolType;
    onToolSelect: (tool: ToolType) => void;
  }) => (
    <div>
      <div data-testid="active-tool">{activeTool}</div>
      <button type="button" onClick={() => onToolSelect("date")}>Mock date tool</button>
      <button type="button" onClick={() => onToolSelect("text")}>Mock text tool</button>
      <button type="button" onClick={() => onToolSelect("select")}>Mock select tool</button>
    </div>
  ),
}));

jest.mock("@/components/PdfViewer", () => {
  const React = jest.requireActual("react");
  return {
    PdfViewer: React.forwardRef(function MockPdfViewer(
      props: {
        selectedFieldId: string | null;
        onFieldAdd: (field: EditorField) => void;
      },
      ref: React.Ref<unknown>
    ) {
      React.useImperativeHandle(ref, () => ({
        getCanvasDataURL: () => "data:image/png;base64,base",
        getCanvasDimensions: () => ({ width: 100, height: 100 }),
        getCanvas: () => null,
        getViewportDims: () => ({ width: 100, height: 100 }),
        editField: jest.fn(),
        getCompositePreviewURL: jest.fn().mockResolvedValue("data:image/png;base64,composite"),
      }));
      return (
        <div data-testid="pdf-viewer">
          <div data-testid="selected-field-id">{props.selectedFieldId ?? "none"}</div>
          <button
            type="button"
            onClick={() =>
              props.onFieldAdd({
                id: "date-1",
                type: "date",
                x: 10,
                y: 10,
                width: 120,
                height: 24,
                page: 0,
                value: "04/07/2026",
                fontSize: 14,
              })
            }
          >
            Mock place date
          </button>
          <button
            type="button"
            onClick={() =>
              props.onFieldAdd({
                id: "text-1",
                type: "text",
                x: 10,
                y: 40,
                width: 120,
                height: 24,
                page: 0,
                value: "",
                fontSize: 14,
              })
            }
          >
            Mock place text
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
          getViewport: () => ({ width: 100, height: 100 }),
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

function activeTool(): string {
  // Toolbar renders twice (desktop + mobile); both reflect the same state
  return screen.getAllByTestId("active-tool")[0].textContent ?? "";
}

function selectedFieldId(): string {
  return screen.getByTestId("selected-field-id").textContent ?? "";
}

describe("Date stamp behaviour", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("keeps the Date tool active after placing a date", async () => {
    await loadEditorWithPdf();

    fireEvent.click(screen.getAllByRole("button", { name: "Mock date tool" })[0]);
    expect(activeTool()).toBe("date");

    fireEvent.click(screen.getByRole("button", { name: "Mock place date" }));
    expect(activeTool()).toBe("date");

    // Repeat stamping stays in date mode
    fireEvent.click(screen.getByRole("button", { name: "Mock place date" }));
    expect(activeTool()).toBe("date");
  });

  it("does not auto-select a newly placed date", async () => {
    await loadEditorWithPdf();

    fireEvent.click(screen.getAllByRole("button", { name: "Mock date tool" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Mock place date" }));

    expect(selectedFieldId()).toBe("none");
  });

  it("exits date stamp mode on Escape", async () => {
    await loadEditorWithPdf();

    fireEvent.click(screen.getAllByRole("button", { name: "Mock date tool" })[0]);
    expect(activeTool()).toBe("date");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(activeTool()).toBe("select");
  });

  it("exits date stamp mode when Select tool is chosen", async () => {
    await loadEditorWithPdf();

    fireEvent.click(screen.getAllByRole("button", { name: "Mock date tool" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Mock select tool" })[0]);

    expect(activeTool()).toBe("select");
  });

  it("still auto-selects and reverts to select for text fields", async () => {
    await loadEditorWithPdf();

    fireEvent.click(screen.getAllByRole("button", { name: "Mock text tool" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Mock place text" }));

    expect(activeTool()).toBe("select");
    expect(selectedFieldId()).toBe("text-1");
  });
});
