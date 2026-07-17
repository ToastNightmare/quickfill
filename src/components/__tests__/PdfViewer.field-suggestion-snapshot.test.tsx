import "@testing-library/jest-dom";
import React, { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { PdfViewer, type PdfViewerHandle } from "../PdfViewer";
import type { EditorField, ToolDefaultState } from "@/lib/types";
import * as localFieldSuggestionProvider from "@/lib/local-field-suggestion-provider";
import type { LocalFieldDetectionLifecycleEvent } from "@/lib/local-field-suggestion-provider";

const mockDetectAllBoxes = jest.fn();
const mockPageRender = jest.fn();
const mockGetViewport = jest.fn();

jest.mock("@/lib/snap-detect", () => ({
  detectAllBoxes: (...args: unknown[]) => mockDetectAllBoxes(...args),
  detectSnapBox: jest.fn(() => null),
  snapCredibilityScore: jest.fn(() => 0),
  floodFillCell: jest.fn(() => null),
  detectCombCells: jest.fn(() => null),
}));

jest.mock("@/lib/pdfjs-client", () => ({
  loadPdfjsClient: jest.fn(async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 3,
        getPage: async () => ({
          getViewport: (options: { scale: number }) => mockGetViewport(options),
          render: (options: unknown) => mockPageRender(options),
        }),
      }),
    }),
  })),
}));

jest.mock("react-konva", () => {
  const ReactModule = jest.requireActual("react") as typeof import("react");
  const createNode = (name: string) => ReactModule.forwardRef(function MockKonvaNode(
    { children }: { children?: React.ReactNode },
    ref: React.Ref<unknown>,
  ) {
    ReactModule.useImperativeHandle(ref, () => ({
      nodes: jest.fn(),
      getLayer: () => ({ batchDraw: jest.fn() }),
      getStage: () => null,
      getPointerPosition: () => null,
      toDataURL: () => "",
      container: () => document.createElement("div"),
      width: () => 768,
      height: () => 1024,
      find: () => [],
    }));
    return <div data-konva-node={name}>{children}</div>;
  });
  return {
    Stage: createNode("Stage"),
    Layer: createNode("Layer"),
    Rect: createNode("Rect"),
    Text: createNode("Text"),
    Group: createNode("Group"),
    Transformer: createNode("Transformer"),
    Image: createNode("Image"),
    Line: createNode("Line"),
  };
});

const TOOL_DEFAULTS: ToolDefaultState = {
  select: {},
  text: { fontSize: 14 },
  date: { fontSize: 14, format: "en-AU" },
  checkbox: { stamp: "tick", color: "#000000", size: 20 },
  signature: { fontSize: 16 },
  box: { charCount: 9 },
  whiteout: { fillColor: null },
  line: { strokeWidth: 1, color: "#000000", orientation: "horizontal" },
  eraser: { size: 48 },
  "mask-eraser": { size: 48 },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createProps(overrides: Partial<React.ComponentProps<typeof PdfViewer>> = {}) {
  return {
    pdfBytes: Uint8Array.from([1, 2, 3]).buffer,
    currentPage: 0,
    fields: [] as EditorField[],
    activeTool: null,
    selectedFieldId: null,
    onFieldAdd: (field: EditorField) => field,
    onFieldUpdate: jest.fn(),
    onFieldsSet: jest.fn(),
    onFieldSelect: jest.fn(),
    onFieldDelete: jest.fn(),
    onToolSelect: jest.fn(),
    onPageScaleSet: jest.fn(),
    totalPages: 1,
    onTotalPagesChange: jest.fn(),
    zoom: 100,
    snapEnabled: false,
    toolDefaults: TOOL_DEFAULTS,
    ...overrides,
  };
}

function readyEvents(callback: jest.Mock): Extract<LocalFieldDetectionLifecycleEvent, { status: "ready" }>[] {
  return callback.mock.calls
    .map(([event]) => event as LocalFieldDetectionLifecycleEvent)
    .filter((event): event is Extract<LocalFieldDetectionLifecycleEvent, { status: "ready" }> => event.status === "ready");
}

describe("PdfViewer shared local-detection snapshot", () => {
  let canvasContext: CanvasRenderingContext2D;
  let clientWidthDescriptor: PropertyDescriptor | undefined;
  let getContextSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetViewport.mockImplementation(({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      rotation: 0,
      transform: [scale, 0, 0, -scale, 0, 800 * scale],
    }));
    mockPageRender.mockImplementation(() => ({ promise: Promise.resolve(), cancel: jest.fn() }));
    mockDetectAllBoxes.mockReturnValue([
      { x: 120, y: 180, width: 360, height: 48 },
      { x: 520, y: 180, width: 32, height: 32 },
    ]);
    canvasContext = {} as CanvasRenderingContext2D;
    getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
    jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,canvas");
    clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    });
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    if (clientWidthDescriptor) Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDescriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    jest.restoreAllMocks();
  });

  it("keeps publication fully optional while preserving the one existing scan", async () => {
    const prepareSnapshot = jest.spyOn(localFieldSuggestionProvider, "prepareLocalFieldDetectionSnapshot");
    const props = createProps();
    const { rerender } = render(<PdfViewer {...props} />);

    await waitFor(() => expect(mockDetectAllBoxes).toHaveBeenCalledTimes(1));
    expect(mockDetectAllBoxes).toHaveBeenCalledWith(expect.any(HTMLCanvasElement));
    expect(prepareSnapshot).not.toHaveBeenCalled();
    rerender(<PdfViewer {...props} fields={[]} />);
    await act(async () => Promise.resolve());
    expect(mockDetectAllBoxes).toHaveBeenCalledTimes(1);
    expect(prepareSnapshot).not.toHaveBeenCalled();
  });

  it("publishes an exact immutable numeric copy and normal parent rerenders do not rescan", async () => {
    const detectorBoxes = [
      { x: 120, y: 180, width: 360, height: 48, area: 17_280 },
      { x: 520, y: 180, width: 32, height: 32, area: 1_024 },
    ];
    const before = detectorBoxes.map((box) => ({ ...box }));
    mockDetectAllBoxes.mockReturnValue(detectorBoxes);
    const onSnapshot = jest.fn();
    const props = createProps({
      fieldSuggestionDocumentRevision: 7,
      onFieldSuggestionSnapshotEvent: onSnapshot,
    });
    const { rerender } = render(<PdfViewer {...props} />);
    await waitFor(() => expect(readyEvents(onSnapshot)).toHaveLength(1));

    const ready = readyEvents(onSnapshot)[0];
    expect(ready.key).toMatchObject({
      documentRevision: 7,
      renderGeneration: 1,
      pageIndex: 0,
      rotation: 0,
      canvasWidth: 768,
      canvasHeight: 1024,
      viewportWidth: 600,
      viewportHeight: 800,
      renderedViewportWidth: 768,
      renderedViewportHeight: 1024,
    });
    expect(ready.snapshot.boxes).toEqual(detectorBoxes.map(({ x, y, width, height }) => ({ x, y, width, height })));
    expect(Object.isFrozen(ready.key)).toBe(true);
    expect(Object.isFrozen(ready.key.viewportTransform)).toBe(true);
    expect(Object.isFrozen(ready.snapshot)).toBe(true);
    expect(Object.isFrozen(ready.snapshot.boxes)).toBe(true);
    expect(ready.snapshot.boxes.every(Object.isFrozen)).toBe(true);
    expect("canvas" in ready.snapshot || "pixels" in ready.snapshot || "imageData" in ready.snapshot).toBe(false);
    expect(Number.isFinite(ready.snapshotPreparationDurationMs)).toBe(true);
    expect(detectorBoxes).toEqual(before);
    expect(Object.isFrozen(detectorBoxes)).toBe(false);
    expect(detectorBoxes.every((box) => !Object.isFrozen(box))).toBe(true);

    rerender(<PdfViewer {...props} fields={[]} selectedFieldId="missing" />);
    await act(async () => Promise.resolve());
    expect(mockDetectAllBoxes).toHaveBeenCalledTimes(1);
    expect(readyEvents(onSnapshot)).toHaveLength(1);
  });

  it("contains callback exceptions without breaking render or the existing scan", async () => {
    const onSnapshot = jest.fn(() => {
      throw new Error("optional callback failure");
    });
    render(<PdfViewer {...createProps({
      fieldSuggestionDocumentRevision: 1,
      onFieldSuggestionSnapshotEvent: onSnapshot,
    })} />);

    await waitFor(() => expect(mockDetectAllBoxes).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("Rendering PDF...")).not.toBeInTheDocument());
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "started" }));
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "ready" }));
    expect(screen.queryByText("Failed to render PDF. The file may be corrupted.")).not.toBeInTheDocument();
  });

  it("cancels old identities and increments generation while non-first pages fail closed", async () => {
    const onSnapshot = jest.fn();
    const ref = React.createRef<PdfViewerHandle>();
    const bytes = Uint8Array.from([4, 5, 6]).buffer;
    const props = createProps({
      pdfBytes: bytes,
      fieldSuggestionDocumentRevision: 3,
      onFieldSuggestionSnapshotEvent: onSnapshot,
    });
    const { rerender } = render(<PdfViewer ref={ref} {...props} />);
    await waitFor(() => expect(readyEvents(onSnapshot)).toHaveLength(1));

    rerender(<PdfViewer ref={ref} {...props} zoom={110} />);
    await waitFor(() => expect(readyEvents(onSnapshot)).toHaveLength(2));
    rerender(<PdfViewer ref={ref} {...props} zoom={110} currentPage={1} totalPages={3} />);
    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      reason: "ineligible-metadata",
      key: expect.objectContaining({ renderGeneration: 3, pageIndex: 1 }),
    })));
    act(() => ref.current?.refit());
    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      reason: "ineligible-metadata",
      key: expect.objectContaining({ renderGeneration: 4, pageIndex: 1 }),
    })));

    expect(readyEvents(onSnapshot).map((event) => event.key.renderGeneration)).toEqual([1, 2]);
    expect(readyEvents(onSnapshot).map((event) => event.key.pageIndex)).toEqual([0, 0]);
    const cancellations = onSnapshot.mock.calls
      .map(([event]) => event as LocalFieldDetectionLifecycleEvent)
      .filter((event) => event.status === "cancelled");
    expect(cancellations.map((event) => event.key.renderGeneration)).toEqual([1, 2]);
    expect(mockDetectAllBoxes).toHaveBeenCalledTimes(4);
  });

  it("cancels an in-flight render and suppresses its late result after B is ready", async () => {
    const firstRender = deferred<void>();
    const firstCancel = jest.fn();
    mockPageRender
      .mockImplementationOnce(() => ({ promise: firstRender.promise, cancel: firstCancel }))
      .mockImplementation(() => ({ promise: Promise.resolve(), cancel: jest.fn() }));
    const onSnapshot = jest.fn();
    const bytes = Uint8Array.from([9]).buffer;
    const props = createProps({
      pdfBytes: bytes,
      fieldSuggestionDocumentRevision: 1,
      onFieldSuggestionSnapshotEvent: onSnapshot,
    });
    const { rerender } = render(<PdfViewer {...props} />);
    await waitFor(() => expect(mockPageRender).toHaveBeenCalledTimes(1));

    rerender(<PdfViewer {...props} zoom={110} />);
    await waitFor(() => expect(readyEvents(onSnapshot)).toHaveLength(1));
    expect(readyEvents(onSnapshot)[0].key.renderGeneration).toBe(2);
    expect(firstCancel).toHaveBeenCalledTimes(1);

    await act(async () => firstRender.resolve());
    expect(readyEvents(onSnapshot)).toHaveLength(1);
    expect(mockDetectAllBoxes).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["detector failure", "detector-failed"],
    ["missing context", "missing-canvas-context"],
    ["render rejection", "render-failed"],
  ] as const)("settles %s fail-closed without a stuck loading state", async (scenario, reason) => {
    if (scenario === "detector failure") mockDetectAllBoxes.mockImplementation(() => { throw new Error("scan"); });
    if (scenario === "missing context") getContextSpy.mockReturnValue(null);
    if (scenario === "render rejection") mockPageRender.mockReturnValue({ promise: Promise.reject(new Error("render")), cancel: jest.fn() });
    const onSnapshot = jest.fn();
    render(<PdfViewer {...createProps({ fieldSuggestionDocumentRevision: 1, onFieldSuggestionSnapshotEvent: onSnapshot })} />);

    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", reason })));
    expect(screen.queryByText("Rendering PDF...")).not.toBeInTheDocument();
    if (scenario !== "render rejection") expect(screen.queryByText("Failed to render PDF. The file may be corrupted.")).not.toBeInTheDocument();
  });

  it("cancels and releases an in-flight identity on unmount", async () => {
    const pending = deferred<void>();
    const cancel = jest.fn();
    mockPageRender.mockReturnValue({ promise: pending.promise, cancel });
    const onSnapshot = jest.fn();
    const { unmount } = render(
      <PdfViewer {...createProps({ fieldSuggestionDocumentRevision: 1, onFieldSuggestionSnapshotEvent: onSnapshot })} />,
    );
    await waitFor(() => expect(mockPageRender).toHaveBeenCalledTimes(1));
    unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
    await act(async () => pending.resolve());
    expect(readyEvents(onSnapshot)).toHaveLength(0);
    expect(mockDetectAllBoxes).not.toHaveBeenCalled();
  });

  it("survives React StrictMode and assigns distinct viewer instance identities", async () => {
    const first = jest.fn();
    const second = jest.fn();
    render(
      <StrictMode>
        <PdfViewer {...createProps({ fieldSuggestionDocumentRevision: 1, onFieldSuggestionSnapshotEvent: first })} />
        <PdfViewer {...createProps({ fieldSuggestionDocumentRevision: 1, onFieldSuggestionSnapshotEvent: second })} />
      </StrictMode>,
    );
    await waitFor(() => {
      expect(readyEvents(first).length).toBeGreaterThanOrEqual(1);
      expect(readyEvents(second).length).toBeGreaterThanOrEqual(1);
    });
    const firstReady = readyEvents(first).at(-1)!;
    const secondReady = readyEvents(second).at(-1)!;
    expect(firstReady.key.viewerInstanceId).not.toBe(secondReady.key.viewerInstanceId);
    expect(firstReady.key.renderGeneration).toBeGreaterThanOrEqual(1);
    expect(secondReady.key.renderGeneration).toBeGreaterThanOrEqual(1);
    expect(mockDetectAllBoxes).toHaveBeenCalledTimes(2);
  });

  it.each([
    [50, 100, true],
    [50.001, 100, false],
    [5, 101, false],
  ])("applies post-scan duration/count caps (duration=%f, boxes=%i)", async (duration, count, eligible) => {
    let clock = 0;
    jest.spyOn(performance, "now").mockImplementation(() => clock);
    mockDetectAllBoxes.mockImplementation(() => {
      clock = duration;
      return Array.from({ length: count }, (_, index) => ({
        x: (index % 10) * 50,
        y: Math.floor(index / 10) * 50,
        width: 20,
        height: 20,
      }));
    });
    const onSnapshot = jest.fn();
    render(<PdfViewer {...createProps({ fieldSuggestionDocumentRevision: 1, onFieldSuggestionSnapshotEvent: onSnapshot })} />);

    if (eligible) {
      await waitFor(() => expect(readyEvents(onSnapshot)).toHaveLength(1));
    } else {
      await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        status: "failed",
        reason: "ineligible-metadata",
      })));
      expect(readyEvents(onSnapshot)).toHaveLength(0);
    }
    expect(mockDetectAllBoxes).toHaveBeenCalledTimes(1);
  });

  it("fails closed when bounded snapshot preparation exceeds the incremental budget", async () => {
    jest.spyOn(localFieldSuggestionProvider, "prepareLocalFieldDetectionSnapshot").mockReturnValue({
      status: "ineligible",
      snapshotPreparationDurationMs: 10.001,
      reason: "incremental-budget-exceeded",
    });
    const onSnapshot = jest.fn();
    render(<PdfViewer {...createProps({ fieldSuggestionDocumentRevision: 1, onFieldSuggestionSnapshotEvent: onSnapshot })} />);

    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      reason: "ineligible-metadata",
      scanDurationMs: expect.any(Number),
    })));
    expect(readyEvents(onSnapshot)).toHaveLength(0);
    expect(mockDetectAllBoxes).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Rendering PDF...")).not.toBeInTheDocument();
  });

  it.each([101, 390, 1_000, 10_000])(
    "rejects %i detector boxes before any per-box read and leaves the detector array untouched",
    async (count) => {
      const detectorBoxes = new Array(count);
      const firstBoxRead = jest.fn(() => {
        throw new Error("out-of-budget box read");
      });
      Object.defineProperty(detectorBoxes, 0, { configurable: true, get: firstBoxRead });
      mockDetectAllBoxes.mockReturnValue(detectorBoxes);
      const onSnapshot = jest.fn();
      render(<PdfViewer {...createProps({ fieldSuggestionDocumentRevision: 1, onFieldSuggestionSnapshotEvent: onSnapshot })} />);

      await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        status: "failed",
        reason: "ineligible-metadata",
      })));
      expect(firstBoxRead).not.toHaveBeenCalled();
      expect(Object.isFrozen(detectorBoxes)).toBe(false);
      expect(mockDetectAllBoxes).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Rendering PDF...")).not.toBeInTheDocument();
      expect(screen.queryByText("Failed to render PDF. The file may be corrupted.")).not.toBeInTheDocument();
    },
  );
});
