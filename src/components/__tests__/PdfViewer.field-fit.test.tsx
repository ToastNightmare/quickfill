import "@testing-library/jest-dom";
import React, { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { PdfViewer } from "../PdfViewer";
import type { EditorField, ToolDefaultState } from "@/lib/types";
import { STANDARD_OVERLAY_TEXT_HEIGHT_RATIO } from "@/lib/pdf-utils";

const mockDetectAllBoxes = jest.fn();
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
  detectCombCells: jest.fn(() => null),
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
  onFieldUpdate = jest.fn(),
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
  onFieldUpdate = jest.fn(),
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
});
