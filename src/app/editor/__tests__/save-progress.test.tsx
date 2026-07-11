import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditorPage from "../page";
import { trackEvent } from "@/lib/analytics";

const authState = { isLoaded: true, isSignedIn: false };

jest.mock("@clerk/nextjs", () => ({
  useAuth: () => authState,
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock("next/link", () => {
  const MockLink = ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
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
  UploadZone: ({ onFileLoad }: { onFileLoad: (upload: { pdfBytes: ArrayBuffer; fileName: string; skipAcroFormDetection?: boolean }) => void }) => (
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
  Toolbar: ({ onSaveProgress, isSavingProgress }: { onSaveProgress?: () => void; isSavingProgress?: boolean }) => (
    <button type="button" onClick={onSaveProgress} disabled={isSavingProgress}>
      Mock save progress
    </button>
  ),
}));

jest.mock("@/components/PdfViewer", () => {
  const React = jest.requireActual("react");
  return {
    PdfViewer: React.forwardRef(function MockPdfViewer(_props: unknown, ref: React.Ref<unknown>) {
      React.useImperativeHandle(ref, () => ({
        getCanvasDataURL: () => "data:image/png;base64,base",
        getCanvasDimensions: () => ({ width: 100, height: 100 }),
        getCanvas: () => null,
        getViewportDims: () => ({ width: 100, height: 100 }),
        editField: jest.fn(),
        getCompositePreviewURL: jest.fn().mockResolvedValue("data:image/png;base64,composite"),
      }));
      return <div data-testid="pdf-viewer" />;
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

jest.mock("@/lib/use-history", () => ({
  useHistory: () => ({
    fields: [],
    set: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn(),
    reset: jest.fn(),
    canUndo: false,
    canRedo: false,
  }),
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

const PROMPT_COPY =
  "Your document is already saved on this device. Sign in to save progress to your account.";

function mockFetch(sessionResponse: { ok: boolean; status: number }) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/session") {
      return { ...sessionResponse, json: async () => ({}) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function sessionCalls(fetchMock: jest.Mock) {
  return fetchMock.mock.calls.filter(([input]) => {
    const url = typeof input === "string" ? input : String(input);
    return url.startsWith("/api/session");
  });
}

async function openEditorAndClickSave() {
  render(<EditorPage />);
  fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
  const saveButtons = await screen.findAllByRole("button", { name: "Mock save progress" });
  fireEvent.click(saveButtons[0]);
}

describe("Save Progress feedback", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    authState.isLoaded = true;
    authState.isSignedIn = false;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("anonymous users", () => {
    it("shows the sign-in prompt without calling /api/session", async () => {
      const fetchMock = mockFetch({ ok: true, status: 200 });
      await openEditorAndClickSave();

      expect(await screen.findByText(PROMPT_COPY)).toBeInTheDocument();
      expect(sessionCalls(fetchMock)).toHaveLength(0);
      expect(trackEvent).toHaveBeenCalledWith("save_progress_anon_prompt");
    });

    it("offers Sign in to save linking to /sign-in with a redirect back to the editor", async () => {
      mockFetch({ ok: true, status: 200 });
      await openEditorAndClickSave();

      const signInLink = await screen.findByRole("link", { name: "Sign in to save" });
      expect(signInLink).toHaveAttribute("href", "/sign-in?redirect_url=%2Feditor");

      fireEvent.click(signInLink);
      expect(trackEvent).toHaveBeenCalledWith("save_progress_sign_in_click");
    });

    it("closes the prompt with Keep editing", async () => {
      mockFetch({ ok: true, status: 200 });
      await openEditorAndClickSave();

      expect(await screen.findByText(PROMPT_COPY)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

      await waitFor(() => {
        expect(screen.queryByText(PROMPT_COPY)).not.toBeInTheDocument();
      });
    });
  });

  describe("signed-in users", () => {
    beforeEach(() => {
      authState.isSignedIn = true;
    });

    it("shows a success toast on 200", async () => {
      const fetchMock = mockFetch({ ok: true, status: 200 });
      await openEditorAndClickSave();

      expect(await screen.findByText("Progress saved to your account")).toBeInTheDocument();
      expect(sessionCalls(fetchMock)).toHaveLength(1);
    });

    it("shows a rate-limit toast on 429", async () => {
      mockFetch({ ok: false, status: 429 });
      await openEditorAndClickSave();

      expect(await screen.findByText("Too many saves. Try again in a moment.")).toBeInTheDocument();
    });

    it("shows a failure toast on other non-ok responses", async () => {
      mockFetch({ ok: false, status: 500 });
      await openEditorAndClickSave();

      expect(
        await screen.findByText("Account save failed. Local autosave is still on.")
      ).toBeInTheDocument();
    });

    it("falls back to the sign-in prompt when the API returns 401", async () => {
      mockFetch({ ok: false, status: 401 });
      await openEditorAndClickSave();

      expect(await screen.findByText(PROMPT_COPY)).toBeInTheDocument();
    });
  });
});
