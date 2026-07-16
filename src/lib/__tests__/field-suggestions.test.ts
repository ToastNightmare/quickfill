import {
  createDocumentRevision,
  createFieldSuggestionId,
  fieldSuggestionsToEditorFields,
  parseFieldSuggestion,
  validateFieldSuggestions,
  withSuggestionType,
  type FieldSuggestion,
  type FieldSuggestionBounds,
} from "../field-suggestions";
import {
  detectLocalFieldSuggestions,
  renderedCanvasBoxToPageBounds,
} from "../local-field-suggestion-provider";
import {
  FIELD_SUGGESTION_INTENT_KEY,
  clearFieldSuggestionIntent,
  consumeFieldSuggestionIntent,
  fieldSuggestionRolloutModeFromFlag,
  isFieldSuggestionReviewEnabled,
  storeFieldSuggestionIntent,
} from "../field-suggestion-rollout";
import { detectAllBoxes } from "../snap-detect";

jest.mock("../snap-detect", () => ({
  detectAllBoxes: jest.fn(),
}));

const mockedDetectAllBoxes = detectAllBoxes as jest.MockedFunction<typeof detectAllBoxes>;
const DOCUMENT_REVISION = `qf-document-v1-${"a".repeat(64)}`;
const OTHER_DOCUMENT_REVISION = `qf-document-v1-${"b".repeat(64)}`;

function suggestion(overrides: Partial<FieldSuggestion> = {}): FieldSuggestion {
  const boundingBox: FieldSuggestionBounds = overrides.boundingBox ?? {
    x: 10,
    y: 20,
    width: 60,
    height: 18,
  };
  const documentRevision = overrides.documentRevision ?? DOCUMENT_REVISION;
  const pageIndex = overrides.pageIndex ?? 0;
  return {
    schemaVersion: 1,
    id: createFieldSuggestionId({ documentRevision, pageIndex, boundingBox }),
    documentRevision,
    type: "text",
    pageIndex,
    boundingBox,
    coordinateSpace: {
      unit: "pdf-point",
      origin: "top-left",
      pageWidth: 100,
      pageHeight: 120,
    },
    confidence: 0.75,
    metadata: { category: "visual-box", reasoning: "rectangular-entry-boundary" },
    ...overrides,
  };
}

const VALIDATION_CONTEXT = {
  documentRevision: DOCUMENT_REVISION,
  pageIndex: 0,
  pageWidth: 100,
  pageHeight: 120,
};

describe("field suggestion schema", () => {
  it("accepts a strictly valid, document-bound suggestion", () => {
    const value = suggestion();
    expect(parseFieldSuggestion(value, VALIDATION_CONTEXT)).toEqual(value);
  });

  it.each([
    ["NaN x", { x: Number.NaN, y: 20, width: 60, height: 18 }],
    ["negative x", { x: -1, y: 20, width: 60, height: 18 }],
    ["zero width", { x: 10, y: 20, width: 0, height: 18 }],
    ["negative height", { x: 10, y: 20, width: 60, height: -1 }],
    ["right overflow", { x: 50, y: 20, width: 60, height: 18 }],
    ["bottom overflow", { x: 10, y: 110, width: 60, height: 18 }],
  ])("rejects %s", (_name, boundingBox) => {
    expect(parseFieldSuggestion(suggestion({ boundingBox }), VALIDATION_CONTEXT)).toBeNull();
  });

  it("rejects unsupported types, non-finite confidence, and mismatched coordinate dimensions", () => {
    expect(parseFieldSuggestion({ ...suggestion(), type: "date" }, VALIDATION_CONTEXT)).toBeNull();
    expect(parseFieldSuggestion({ ...suggestion(), confidence: Number.POSITIVE_INFINITY }, VALIDATION_CONTEXT)).toBeNull();
    expect(parseFieldSuggestion({
      ...suggestion(),
      coordinateSpace: { ...suggestion().coordinateSpace, pageWidth: 101 },
    }, VALIDATION_CONTEXT)).toBeNull();
  });

  it("rejects a stale document, wrong page, and non-QuickFill or recomputed ID", () => {
    expect(parseFieldSuggestion(suggestion({ documentRevision: OTHER_DOCUMENT_REVISION }), VALIDATION_CONTEXT)).toBeNull();
    expect(parseFieldSuggestion(suggestion({ pageIndex: 1 }), VALIDATION_CONTEXT)).toBeNull();
    expect(parseFieldSuggestion({ ...suggestion(), id: "provider-field-1" }, VALIDATION_CONTEXT)).toBeNull();
    expect(parseFieldSuggestion({
      ...suggestion(),
      boundingBox: { ...suggestion().boundingBox, x: 11 },
    }, VALIDATION_CONTEXT)).toBeNull();
  });

  it("deduplicates stable IDs and keeps the last validated version", () => {
    const first = suggestion();
    const changedType = withSuggestionType(first, "checkbox");
    expect(changedType.id).toBe(first.id);
    expect(validateFieldSuggestions([first, changedType], VALIDATION_CONTEXT)).toEqual([changedType]);
  });

  it("creates deterministic revisions without exposing the document bytes", async () => {
    const first = await createDocumentRevision(Uint8Array.from([1, 2, 3]).buffer);
    const same = await createDocumentRevision(Uint8Array.from([1, 2, 3]).buffer);
    const different = await createDocumentRevision(Uint8Array.from([1, 2, 4]).buffer);

    expect(first).toBe(same);
    expect(first).not.toBe(different);
    expect(first).toMatch(/^qf-document-v1-[a-f0-9]{16,64}$/);
    expect(first).not.toContain("1,2,3");
  });

  it("creates empty text and unchecked checkbox editor fields with unique IDs", () => {
    const text = suggestion();
    const checkbox = withSuggestionType(suggestion({
      boundingBox: { x: 75, y: 20, width: 18, height: 18 },
      id: createFieldSuggestionId({
        documentRevision: DOCUMENT_REVISION,
        pageIndex: 0,
        boundingBox: { x: 75, y: 20, width: 18, height: 18 },
      }),
    }), "checkbox");
    const fields = fieldSuggestionsToEditorFields([text, checkbox], [{ id: "suggested-text-existing" }]);

    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({ type: "text", value: "", page: 0 });
    expect(fields[1]).toMatchObject({ type: "checkbox", checked: false, page: 0 });
    expect(new Set(fields.map((field) => field.id)).size).toBe(2);
    expect(fields.some((field) => field.id === "suggested-text-existing")).toBe(false);
  });
});

describe("local field suggestion provider", () => {
  beforeEach(() => {
    mockedDetectAllBoxes.mockReset();
  });

  it.each([
    {
      canvas: { width: 1200, height: 1600 },
      viewport: { width: 600, height: 800 },
      box: { x: 200, y: 400, width: 400, height: 60 },
    },
    {
      canvas: { width: 1800, height: 1600 },
      viewport: { width: 600, height: 800 },
      box: { x: 300, y: 400, width: 600, height: 60 },
    },
    {
      canvas: { width: 900, height: 1200 },
      viewport: { width: 600, height: 800 },
      box: { x: 150, y: 300, width: 300, height: 45 },
    },
  ])("uses independent rendered-canvas X/Y scales for %#", ({ canvas, viewport, box }) => {
    expect(renderedCanvasBoxToPageBounds(box, canvas, viewport)).toEqual({
      x: 100,
      y: 200,
      width: 200,
      height: 30,
    });
  });

  it("keeps landscape scale-1 geometry and IDs stable across independent backing-canvas scales", () => {
    const viewport = { width: 792, height: 612 };
    const firstBounds = renderedCanvasBoxToPageBounds(
      { x: 198, y: 306, width: 792, height: 153 },
      { width: 1584, height: 1836 },
      viewport,
    );
    const secondBounds = renderedCanvasBoxToPageBounds(
      { x: 297, y: 204, width: 1188, height: 102 },
      { width: 2376, height: 1224 },
      viewport,
    );

    expect(firstBounds).toEqual({ x: 99, y: 102, width: 396, height: 51 });
    expect(secondBounds).toEqual(firstBounds);
    if (!firstBounds || !secondBounds) throw new Error("Expected valid landscape bounds");
    expect(createFieldSuggestionId({
      documentRevision: DOCUMENT_REVISION,
      pageIndex: 0,
      boundingBox: firstBounds,
    })).toBe(createFieldSuggestionId({
      documentRevision: DOCUMENT_REVISION,
      pageIndex: 0,
      boundingBox: secondBounds,
    }));
  });

  it.each([
    { x: 0, y: 0, width: 0, height: 10 },
    { x: 0, y: 0, width: Number.NaN, height: 10 },
    { x: -1, y: 0, width: 10, height: 10 },
    { x: 95, y: 0, width: 10, height: 10 },
  ])("rejects unusable rendered box %#", (box) => {
    expect(renderedCanvasBoxToPageBounds(
      box,
      { width: 100, height: 100 },
      { width: 50, height: 50 },
    )).toBeNull();
  });

  it("returns only validated text and checkbox suggestions and makes no request", () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = jest.fn();
    Object.defineProperty(globalThis, "fetch", { value: fetchSpy, configurable: true, writable: true });
    mockedDetectAllBoxes.mockReturnValue([
      { x: 20, y: 20, width: 30, height: 30 },
      { x: 100, y: 80, width: 240, height: 40 },
      { x: 799, y: 0, width: 2, height: 10 },
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1000;

    const result = detectLocalFieldSuggestions({
      canvas,
      viewport: { width: 400, height: 500 },
      documentRevision: DOCUMENT_REVISION,
      pageIndex: 0,
    });

    expect(result.map((item) => item.type)).toEqual(["checkbox", "text"]);
    expect(result.every((item) => item.documentRevision === DOCUMENT_REVISION && item.pageIndex === 0)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      Reflect.deleteProperty(globalThis, "fetch");
    }
  });

  it("produces the same IDs across proportionally different render scales", () => {
    const firstCanvas = document.createElement("canvas");
    firstCanvas.width = 1200;
    firstCanvas.height = 1600;
    mockedDetectAllBoxes.mockReturnValueOnce([{ x: 200, y: 400, width: 400, height: 60 }]);
    const first = detectLocalFieldSuggestions({
      canvas: firstCanvas,
      viewport: { width: 600, height: 800 },
      documentRevision: DOCUMENT_REVISION,
      pageIndex: 0,
    });

    const secondCanvas = document.createElement("canvas");
    secondCanvas.width = 1800;
    secondCanvas.height = 2400;
    mockedDetectAllBoxes.mockReturnValueOnce([{ x: 300, y: 600, width: 600, height: 90 }]);
    const second = detectLocalFieldSuggestions({
      canvas: secondCanvas,
      viewport: { width: 600, height: 800 },
      documentRevision: DOCUMENT_REVISION,
      pageIndex: 0,
    });

    expect(first[0]?.boundingBox).toEqual(second[0]?.boundingBox);
    expect(first[0]?.id).toBe(second[0]?.id);
  });

  it("never scans a non-first page", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1000;
    expect(detectLocalFieldSuggestions({
      canvas,
      viewport: { width: 400, height: 500 },
      documentRevision: DOCUMENT_REVISION,
      pageIndex: 1,
    })).toEqual([]);
    expect(mockedDetectAllBoxes).not.toHaveBeenCalled();
  });
});

describe("field suggestion rollout and one-shot intent", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("defaults off and enables only the exact source-backed mode", () => {
    expect(fieldSuggestionRolloutModeFromFlag(undefined)).toBe("off");
    expect(fieldSuggestionRolloutModeFromFlag("true")).toBe("off");
    expect(fieldSuggestionRolloutModeFromFlag("local-review")).toBe("local-review");
    expect(isFieldSuggestionReviewEnabled(undefined)).toBe(false);
    expect(isFieldSuggestionReviewEnabled("local-review")).toBe(true);
  });

  it("stores no content, uses session storage only, and consumes a matching intent once", () => {
    expect(storeFieldSuggestionIntent(DOCUMENT_REVISION)).toBe(true);
    const raw = sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY);
    expect(raw).toContain(DOCUMENT_REVISION);
    expect(raw).not.toContain("image");
    expect(raw).not.toContain("documentBytes");
    expect(localStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();

    expect(consumeFieldSuggestionIntent(DOCUMENT_REVISION)).toMatchObject({
      version: 1,
      documentRevision: DOCUMENT_REVISION,
      pageIndex: 0,
    });
    expect(consumeFieldSuggestionIntent(DOCUMENT_REVISION)).toBeNull();
  });

  it("rejects and clears a stale intent", () => {
    storeFieldSuggestionIntent(DOCUMENT_REVISION);
    expect(consumeFieldSuggestionIntent(OTHER_DOCUMENT_REVISION)).toBeNull();
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
    clearFieldSuggestionIntent();
  });
});
