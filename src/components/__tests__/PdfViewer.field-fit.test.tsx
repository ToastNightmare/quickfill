import "@testing-library/jest-dom";
import React, { act } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PdfViewer } from "../PdfViewer";
import type { EditorField, ToolDefaultState } from "@/lib/types";
import {
  fitMultilineOverlayText,
  fitOverlayTextPadding,
  STANDARD_OVERLAY_TEXT_HEIGHT_RATIO,
  standardOverlayTextHeightAtSize,
} from "@/lib/pdf-utils";

const mockDetectAllBoxes = jest.fn();
const mockDetectCombCells = jest.fn();
const mockPageRender = jest.fn();
const mockGetViewport = jest.fn();
const mockKonvaProps: Record<string, Array<Record<string, unknown>>> = {
  Stage: [],
  Layer: [],
  Rect: [],
  Text: [],
  Group: [],
  Transformer: [],
  Image: [],
  Line: [],
};

jest.mock("@/lib/snap-detect", () => ({
  detectAllBoxes: (...args: unknown[]) => mockDetectAllBoxes(...args),
  detectSnapBox: jest.fn(() => null),
  snapCredibilityScore: jest.fn(() => 0),
  floodFillCell: jest.fn(() => null),
  detectCombCells: (...args: unknown[]) => mockDetectCombCells(...args),
}));

jest.mock("@/lib/pdfjs-client", () => ({
  loadPdfjsClient: jest.fn(async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
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
  const createNode = (name: string) =>
    ReactModule.forwardRef(function MockKonvaNode(
      {
        children,
        ...props
      }: {
        children?: React.ReactNode;
        [key: string]: unknown;
      },
      ref: React.Ref<unknown>,
    ) {
      mockKonvaProps[name].push({ ...props, children });
      ReactModule.useImperativeHandle(ref, () => ({
        nodes: jest.fn(),
        getLayer: () => ({ batchDraw: jest.fn() }),
        getStage: () => null,
        getPointerPosition: () => null,
        getIntersection: () => null,
        toDataURL: () => "",
        container: () => document.createElement("div"),
        width: () => (typeof props.width === "number" ? props.width : 0),
        height: () => (typeof props.height === "number" ? props.height : 0),
        cache: jest.fn(),
        clearCache: jest.fn(),
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

const FIELD_FIT_FLAG = "NEXT_PUBLIC_QUICKFILL_FIELD_FIT";
const originalFieldFitFlag = process.env[FIELD_FIT_FLAG];
const FORM_FIDELITY_FLAG = "NEXT_PUBLIC_QUICKFILL_FORM_FIDELITY";
const originalFormFidelityFlag = process.env[FORM_FIDELITY_FLAG];

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

function textField(
  overrides: Partial<Extract<EditorField, { type: "text" }>> = {},
): Extract<EditorField, { type: "text" }> {
  return {
    id: "field-fit-text",
    type: "text",
    x: 20,
    y: 20,
    width: 8,
    height: 8,
    page: 0,
    value: "VISIBLE",
    fontSize: 14,
    ...overrides,
  };
}

function createProps(
  field: EditorField,
  zoom: number,
  onFieldUpdate: (
    id: string,
    updates: Partial<EditorField>,
  ) => void = jest.fn(),
) {
  return {
    pdfBytes: Uint8Array.from([1, 2, 3]).buffer,
    currentPage: 0,
    fields: [field],
    activeTool: null,
    selectedFieldId: field.id,
    onFieldAdd: (addedField: EditorField) => addedField,
    onFieldUpdate,
    onFieldsSet: jest.fn(),
    onFieldSelect: jest.fn(),
    onFieldDelete: jest.fn(),
    onToolSelect: jest.fn(),
    onPageScaleSet: jest.fn(),
    totalPages: 1,
    onTotalPagesChange: jest.fn(),
    zoom,
    snapEnabled: false,
    toolDefaults: TOOL_DEFAULTS,
  };
}

function latestProps(
  name: keyof typeof mockKonvaProps,
  predicate: (props: Record<string, unknown>) => boolean = () => true,
) {
  const match = [...mockKonvaProps[name]].reverse().find(predicate);
  if (!match) throw new Error(`No ${name} props matched the test selector.`);
  return match;
}

async function renderViewer(
  field: EditorField,
  zoom: number,
  onFieldUpdate: (
    id: string,
    updates: Partial<EditorField>,
  ) => void = jest.fn(),
) {
  const result = render(
    <PdfViewer {...createProps(field, zoom, onFieldUpdate)} />,
  );
  await waitFor(() => expect(mockPageRender).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.queryByText("Rendering PDF...")).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(
      mockKonvaProps.Group.some((props) => props.id === field.id),
    ).toBe(true),
  );
  return result;
}

describe("PdfViewer field-fit rollout", () => {
  let getContextSpy: jest.SpyInstance;
  let clientWidthDescriptor: PropertyDescriptor | undefined;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const entries of Object.values(mockKonvaProps)) entries.length = 0;
    mockGetViewport.mockImplementation(({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      rotation: 0,
      transform: [scale, 0, 0, -scale, 0, 800 * scale],
    }));
    mockPageRender.mockImplementation(() => ({
      promise: Promise.resolve(),
      cancel: jest.fn(),
    }));
    mockDetectAllBoxes.mockReturnValue([]);
    mockDetectCombCells.mockReturnValue(null);
    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({} as CanvasRenderingContext2D);
    jest
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,canvas");
    clientWidthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth",
    );
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 800,
    });
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
    consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    if (clientWidthDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "clientWidth",
        clientWidthDescriptor,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    }
    if (originalFieldFitFlag === undefined) {
      delete process.env[FIELD_FIT_FLAG];
    } else {
      process.env[FIELD_FIT_FLAG] = originalFieldFitFlag;
    }
    if (originalFormFidelityFlag === undefined) {
      delete process.env[FORM_FIDELITY_FLAG];
    } else {
      process.env[FORM_FIDELITY_FLAG] = originalFormFidelityFlag;
    }
    jest.restoreAllMocks();
  });

  it.each([50, 100, 200])(
    "accepts an 8x8pt text field at %i%% zoom and commits the document-space floor",
    async (zoom) => {
      process.env[FIELD_FIT_FLAG] = "v1";
      const field = textField();
      const onFieldUpdate = jest.fn();
      await renderViewer(field, zoom, onFieldUpdate);

      const group = latestProps("Group", (props) => props.id === field.id);
      const transformer = latestProps("Transformer");
      const fitScale = Number(group.width) / field.width;
      const minimumScreenSize = 8 * fitScale * (zoom / 100);
      const boundBoxFunc = transformer.boundBoxFunc as (
        oldBox: Record<string, number>,
        newBox: Record<string, number>,
      ) => Record<string, number>;
      const oldBox = { x: 0, y: 0, width: 40, height: 40 };
      const rejected = {
        x: 0,
        y: 0,
        width: minimumScreenSize - 0.01,
        height: minimumScreenSize,
      };
      const accepted = {
        x: 0,
        y: 0,
        width: minimumScreenSize,
        height: minimumScreenSize,
      };

      expect(boundBoxFunc(oldBox, rejected)).toBe(oldBox);
      expect(boundBoxFunc(oldBox, accepted)).toBe(accepted);

      let scaleX = 0.01;
      let scaleY = 0.01;
      const target = {
        scaleX: jest.fn((next?: number) => {
          if (next !== undefined) scaleX = next;
          return scaleX;
        }),
        scaleY: jest.fn((next?: number) => {
          if (next !== undefined) scaleY = next;
          return scaleY;
        }),
        width: () => Number(group.width),
        height: () => Number(group.height),
        x: () => 0,
        y: () => 0,
      };

      act(() => {
        (
          group.onTransformEnd as (event: {
            target: typeof target;
          }) => void
        )({ target });
      });

      expect(onFieldUpdate).toHaveBeenLastCalledWith(
        field.id,
        expect.objectContaining({
          width: expect.closeTo(8, 8),
          height: expect.closeTo(8, 8),
        }),
      );
    },
  );

  it("keeps the exact flag-off Transformer floor and render props", async () => {
    delete process.env[FIELD_FIT_FLAG];
    const field = textField({ width: 100, height: 20 });
    await renderViewer(field, 100);

    const group = latestProps("Group", (props) => props.id === field.id);
    const transformer = latestProps("Transformer");
    const text = latestProps("Text", (props) => props.text === field.value);
    const fitScale = Number(group.width) / field.width;
    const boundBoxFunc = transformer.boundBoxFunc as (
      oldBox: Record<string, number>,
      newBox: Record<string, number>,
    ) => Record<string, number>;
    const oldBox = { x: 0, y: 0, width: 40, height: 40 };
    const rejected = { x: 0, y: 0, width: 15.99, height: 16 };
    const accepted = { x: 0, y: 0, width: 16, height: 16 };

    expect(boundBoxFunc(oldBox, rejected)).toBe(oldBox);
    expect(boundBoxFunc(oldBox, accepted)).toBe(accepted);
    expect(text.fontSize).toBe(field.fontSize * fitScale);
    expect(text.width).toBe(Number(group.width) - 8);
    expect(text.height).toBe(Number(group.height));
    expect(text.padding).toBe(4);
    expect(Object.prototype.hasOwnProperty.call(text, "lineHeight")).toBe(
      false,
    );
  });

  it("renders a non-empty minimum field visibly and uses the same fitted size while editing", async () => {
    process.env[FIELD_FIT_FLAG] = "v1";
    const field = textField();
    await renderViewer(field, 200);

    const group = latestProps("Group", (props) => props.id === field.id);
    const text = latestProps("Text", (props) => props.text === field.value);
    const fittedStageFontSize = Number(text.fontSize);
    const stagePadding = Number(text.padding);

    expect(text.text).toBe("VISIBLE");
    expect(fittedStageFontSize).toBeGreaterThan(0);
    expect(fittedStageFontSize).toBeLessThan(14 * (Number(group.width) / 8));
    expect(Number(text.width)).toBeGreaterThan(stagePadding * 2);
    expect(text.lineHeight).toBe(STANDARD_OVERLAY_TEXT_HEIGHT_RATIO);
    expect(text.wrap).toBe("none");
    expect(text.ellipsis).toBe(true);

    const event = { cancelBubble: false };
    act(() => {
      (group.onDblClick as (event: typeof event) => void)(event);
    });
    const input = await screen.findByTestId("pdf-field-editor");

    expect(event.cancelBubble).toBe(true);
    expect(Number.parseFloat(input.style.fontSize)).toBeCloseTo(
      fittedStageFontSize * 2,
      8,
    );
    expect(Number.parseFloat(input.style.paddingLeft)).toBeCloseTo(
      stagePadding * 2,
      8,
    );
    expect(Number.parseFloat(input.style.lineHeight)).toBeCloseTo(
      fittedStageFontSize * STANDARD_OVERLAY_TEXT_HEIGHT_RATIO * 2,
      8,
    );
  });

  it("renders a value-only signature fallback at the fitted italic size", async () => {
    process.env[FIELD_FIT_FLAG] = "v1";
    const signature: Extract<EditorField, { type: "signature" }> = {
      id: "field-fit-signature",
      type: "signature",
      x: 20,
      y: 20,
      width: 8,
      height: 8,
      page: 0,
      value: "SIGNED",
      fontSize: 16,
    };
    await renderViewer(signature, 100);

    const text = latestProps(
      "Text",
      (props) => props.text === signature.value,
    );
    expect(text.text).toBe("SIGNED");
    expect(text.fontStyle).toBe("italic");
    expect(Number(text.fontSize)).toBeGreaterThan(0);
  });

  it("uses shared multiline breaks and a textarea editor flag-on", async () => {
    process.env[FIELD_FIT_FLAG] = "v1";
    process.env[FORM_FIDELITY_FLAG] = "v1";
    const field = textField({
      width: 120,
      height: 54,
      value:
        "First explicit line\nSecond paragraph wraps at the field width",
      fontSize: 12,
    });
    const onFieldUpdate = jest.fn();
    await renderViewer(field, 100, onFieldUpdate);

    const group = latestProps("Group", (props) => props.id === field.id);
    const text = latestProps(
      "Text",
      (props) =>
        typeof props.text === "string" &&
        props.text.includes("First explicit line"),
    );
    const padding = fitOverlayTextPadding(
      field.width,
      field.height,
      4,
    );
    const expectedLayout = fitMultilineOverlayText(
      field.value,
      field.width - padding * 2,
      field.height,
      {
        widthOfTextAtSize: (value, fontSize) =>
          Array.from(value).length * fontSize * 0.5,
        heightAtSize: standardOverlayTextHeightAtSize,
      },
      field.fontSize,
      padding,
    );

    expect(text.text).toBe(expectedLayout.lines.join("\n"));
    expect(text.wrap).toBe("none");
    expect(text.ellipsis).toBe(false);
    expect(text.verticalAlign).toBe("top");

    act(() => {
      (group.onDblClick as (event: { cancelBubble: boolean }) => void)({
        cancelBubble: false,
      });
    });
    const editor = await screen.findByTestId("pdf-field-editor");
    expect(editor.tagName).toBe("TEXTAREA");

    fireEvent.keyDown(editor, { key: "Enter" });
    expect(screen.getByTestId("pdf-field-editor")).toBeInTheDocument();
    fireEvent.change(editor, {
      target: { value: `${field.value}\nThird explicit line` },
    });
    expect(onFieldUpdate).toHaveBeenLastCalledWith(field.id, {
      value: `${field.value}\nThird explicit line`,
    });
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(screen.queryByTestId("pdf-field-editor")).not.toBeInTheDocument();
  });

  it("uses a textarea for a one-line source multiline field", async () => {
    process.env[FORM_FIDELITY_FLAG] = "v1";
    const field = textField({
      width: 160,
      height: 54,
      value: "First line",
      fontSize: 12,
      multiline: true,
    });
    const onFieldUpdate = jest.fn();
    await renderViewer(field, 100, onFieldUpdate);
    const group = latestProps(
      "Group",
      (props) => props.id === field.id,
    );
    act(() => {
      (group.onDblClick as (event: { cancelBubble: boolean }) => void)({
        cancelBubble: false,
      });
    });

    const editor = await screen.findByTestId("pdf-field-editor");
    expect(editor.tagName).toBe("TEXTAREA");
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(screen.getByTestId("pdf-field-editor")).toBeInTheDocument();
    fireEvent.change(editor, {
      target: { value: "First line\nSecond line" },
    });
    expect(onFieldUpdate).toHaveBeenLastCalledWith(field.id, {
      value: "First line\nSecond line",
    });
  });

  it("applies comb offsetY only when form fidelity is enabled", async () => {
    const field: Extract<EditorField, { type: "comb" }> = {
      id: "comb-offset-y",
      type: "comb",
      x: 20,
      y: 20,
      width: 100,
      height: 24,
      page: 0,
      value: "AB",
      charCount: 2,
      offsetY: 7,
    };
    process.env[FORM_FIDELITY_FLAG] = "v1";
    const enabled = await renderViewer(field, 100);
    const enabledRoot = latestProps(
      "Group",
      (props) => props.id === field.id,
    );
    const fitScale = Number(enabledRoot.width) / field.width;
    expect(
      mockKonvaProps.Group.filter(
        (props) =>
          props.id === undefined &&
          Number(props.y) === 7 * fitScale &&
          Number(props.height) === Number(enabledRoot.height),
      ),
    ).toHaveLength(2);
    enabled.unmount();

    for (const entries of Object.values(mockKonvaProps)) entries.length = 0;
    delete process.env[FORM_FIDELITY_FLAG];
    await renderViewer(field, 100);
    const disabledRoot = latestProps(
      "Group",
      (props) => props.id === field.id,
    );
    expect(
      mockKonvaProps.Group.filter(
        (props) =>
          props.id === undefined &&
          Number(props.y) === 0 &&
          Number(props.height) === Number(disabledRoot.height),
      ),
    ).toHaveLength(2);
  });

  it("creates a normalized Box from two coarse-pointer taps", async () => {
    process.env[FORM_FIDELITY_FLAG] = "v1";
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn((query: string) => ({
        matches: query === "(pointer: coarse)",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    jest
      .spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        left: 0,
        top: 0,
        right: 768,
        bottom: 1024,
        width: 768,
        height: 1024,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    const onFieldAdd = jest.fn((field: EditorField) => field);
    const onFieldSelect = jest.fn();
    const onToolSelect = jest.fn();
    const props: React.ComponentProps<typeof PdfViewer> = {
      ...createProps(textField(), 100),
      fields: [],
      activeTool: "box",
      selectedFieldId: null,
      onFieldAdd,
      onFieldSelect,
      onToolSelect,
    };
    render(<PdfViewer {...props} />);
    await waitFor(() =>
      expect(screen.queryByText("Rendering PDF...")).not.toBeInTheDocument(),
    );
    const viewer = screen.getByTestId("pdf-viewer");

    fireEvent.touchEnd(viewer, {
      touches: [],
      changedTouches: [
        { identifier: 1, clientX: 300, clientY: 300 },
      ],
    });
    expect(onFieldAdd).not.toHaveBeenCalled();
    expect(
      screen.getByText("Now tap the opposite corner"),
    ).toBeInTheDocument();

    fireEvent.touchEnd(viewer, {
      touches: [],
      changedTouches: [
        { identifier: 2, clientX: 100, clientY: 140 },
      ],
    });
    expect(onFieldAdd).toHaveBeenCalledTimes(1);
    const added = onFieldAdd.mock.calls[0][0] as Extract<
      EditorField,
      { type: "comb" }
    >;
    const pageWidth = Number.parseFloat(
      screen.getByTestId("pdf-page").style.width,
    );
    const effectiveScale = pageWidth / 600;
    expect(added.type).toBe("comb");
    expect(added.x).toBeCloseTo(100 / effectiveScale, 8);
    expect(added.y).toBeCloseTo(140 / effectiveScale, 8);
    expect(added.width).toBeCloseTo(200 / effectiveScale, 8);
    expect(added.height).toBeCloseTo(160 / effectiveScale, 8);
    expect(mockDetectCombCells).toHaveBeenCalledTimes(1);
    expect(onToolSelect).toHaveBeenCalledWith(null);
    expect(onFieldSelect).toHaveBeenCalledWith(added.id);
    expect(
      screen.queryByTestId("box-first-corner-marker"),
    ).not.toBeInTheDocument();
  });

  it("enforces the drawn minimum for close Box taps", async () => {
    process.env[FORM_FIDELITY_FLAG] = "v1";
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn((query: string) => ({
        matches: query === "(pointer: coarse)",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    jest
      .spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        left: 0,
        top: 0,
        right: 768,
        bottom: 1024,
        width: 768,
        height: 1024,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    const onFieldAdd = jest.fn((field: EditorField) => field);
    const props: React.ComponentProps<typeof PdfViewer> = {
      ...createProps(textField(), 100),
      fields: [],
      activeTool: "box",
      selectedFieldId: null,
      onFieldAdd,
    };
    render(<PdfViewer {...props} />);
    await waitFor(() =>
      expect(screen.queryByText("Rendering PDF...")).not.toBeInTheDocument(),
    );
    const viewer = screen.getByTestId("pdf-viewer");
    fireEvent.touchEnd(viewer, {
      touches: [],
      changedTouches: [
        { identifier: 1, clientX: 100, clientY: 100 },
      ],
    });
    fireEvent.touchEnd(viewer, {
      touches: [],
      changedTouches: [
        { identifier: 2, clientX: 102, clientY: 103 },
      ],
    });

    const added = onFieldAdd.mock.calls[0][0] as Extract<
      EditorField,
      { type: "comb" }
    >;
    const fitScale =
      Number.parseFloat(screen.getByTestId("pdf-page").style.width) /
      600;
    expect(added.width).toBeCloseTo(20 / fitScale, 8);
    expect(added.height).toBeCloseTo(20 / fitScale, 8);
  });

  it("cancels a pending Box corner on Escape, tool switch, and two fingers", async () => {
    process.env[FORM_FIDELITY_FLAG] = "v1";
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn((query: string) => ({
        matches: query === "(pointer: coarse)",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    jest
      .spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        left: 0,
        top: 0,
        right: 768,
        bottom: 1024,
        width: 768,
        height: 1024,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    const props: React.ComponentProps<typeof PdfViewer> = {
      ...createProps(textField(), 100),
      fields: [],
      activeTool: "box",
      selectedFieldId: null,
    };
    const result = render(<PdfViewer {...props} />);
    await waitFor(() =>
      expect(screen.queryByText("Rendering PDF...")).not.toBeInTheDocument(),
    );
    const viewer = screen.getByTestId("pdf-viewer");
    const tapFirstCorner = () =>
      fireEvent.touchEnd(viewer, {
        touches: [],
        changedTouches: [
          { identifier: 1, clientX: 120, clientY: 120 },
        ],
      });

    tapFirstCorner();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByTestId("box-first-corner-marker"),
    ).not.toBeInTheDocument();

    tapFirstCorner();
    result.rerender(<PdfViewer {...props} activeTool={null} />);
    expect(
      screen.queryByTestId("box-first-corner-marker"),
    ).not.toBeInTheDocument();

    result.rerender(<PdfViewer {...props} activeTool="box" />);
    tapFirstCorner();
    fireEvent.touchStart(viewer, {
      touches: [
        { identifier: 7, clientX: 100, clientY: 100 },
        { identifier: 8, clientX: 200, clientY: 200 },
      ],
      changedTouches: [
        { identifier: 8, clientX: 200, clientY: 200 },
      ],
    });
    expect(
      screen.queryByTestId("box-first-corner-marker"),
    ).not.toBeInTheDocument();
  });

  it("keeps flag-off touch placement and fine-pointer mouse drag paths", async () => {
    delete process.env[FORM_FIDELITY_FLAG];
    jest
      .spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        left: 0,
        top: 0,
        right: 768,
        bottom: 1024,
        width: 768,
        height: 1024,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    const flagOffAdd = jest.fn((field: EditorField) => field);
    const flagOffProps: React.ComponentProps<typeof PdfViewer> = {
      ...createProps(textField(), 100),
      fields: [],
      activeTool: "box",
      selectedFieldId: null,
      onFieldAdd: flagOffAdd,
    };
    const flagOff = render(<PdfViewer {...flagOffProps} />);
    await waitFor(() =>
      expect(screen.queryByText("Rendering PDF...")).not.toBeInTheDocument(),
    );
    fireEvent.touchEnd(screen.getByTestId("pdf-viewer"), {
      touches: [],
      changedTouches: [
        { identifier: 1, clientX: 100, clientY: 100 },
      ],
    });
    expect(flagOffAdd).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId("box-first-corner-marker"),
    ).not.toBeInTheDocument();
    flagOff.unmount();

    for (const entries of Object.values(mockKonvaProps)) entries.length = 0;
    process.env[FORM_FIDELITY_FLAG] = "v1";
    const mouseAdd = jest.fn((field: EditorField) => field);
    const mouseProps: React.ComponentProps<typeof PdfViewer> = {
      ...createProps(textField(), 100),
      fields: [],
      activeTool: "box",
      selectedFieldId: null,
      onFieldAdd: mouseAdd,
    };
    render(<PdfViewer {...mouseProps} />);
    await waitFor(() =>
      expect(screen.queryByText("Rendering PDF...")).not.toBeInTheDocument(),
    );
    const stageProps = latestProps("Stage");
    const container = document.createElement("div");
    jest.spyOn(container, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 768,
      bottom: 1024,
      width: 768,
      height: 1024,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const stage = {
      getStage: () => stage,
      container: () => container,
    };

    act(() => {
      (
        stageProps.onMouseDown as (event: {
          target: typeof stage;
          evt: { clientX: number; clientY: number };
        }) => void
      )({
        target: stage,
        evt: { clientX: 80, clientY: 90 },
      });
      (
        stageProps.onMouseUp as (event: {
          target: typeof stage;
          evt: { clientX: number; clientY: number };
        }) => void
      )({
        target: stage,
        evt: { clientX: 280, clientY: 190 },
      });
    });
    expect(mouseAdd).toHaveBeenCalledTimes(1);
    expect(mouseAdd.mock.calls[0][0]).toMatchObject({
      type: "comb",
      snapped: false,
    });
  });
});
