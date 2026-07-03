import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { CropOverlay } from "@/components/CropOverlay";
import { FULL_FRAME_CROP, MIN_CROP_FRACTION, type CropRect } from "@/lib/image-cleanup";

// jsdom has no PointerEvent; back it with MouseEvent so pointer coordinates
// (clientX/clientY) reach the component under test.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.defineProperty(window, "PointerEvent", { value: PointerEventPolyfill, writable: true });
}

/** The overlay container is mocked to a 200x100 box at the origin. */
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) };

function lastCrop(onChange: jest.Mock): CropRect {
  expect(onChange).toHaveBeenCalled();
  return onChange.mock.calls[onChange.mock.calls.length - 1][0] as CropRect;
}

describe("CropOverlay", () => {
  beforeEach(() => {
    jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue(RECT as DOMRect);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the crop box at the crop rect with four corner handles", () => {
    render(<CropOverlay crop={FULL_FRAME_CROP} onChange={jest.fn()} />);

    const box = screen.getByTestId("crop-box");
    expect(box).toHaveStyle({ left: "0%", top: "0%", width: "100%", height: "100%" });
    expect(screen.getByTestId("crop-handle-nw")).toBeInTheDocument();
    expect(screen.getByTestId("crop-handle-ne")).toBeInTheDocument();
    expect(screen.getByTestId("crop-handle-sw")).toBeInTheDocument();
    expect(screen.getByTestId("crop-handle-se")).toBeInTheDocument();
  });

  it("positions the box from a partial crop rect", () => {
    render(
      <CropOverlay crop={{ x: 0.25, y: 0.1, width: 0.5, height: 0.8 }} onChange={jest.fn()} />
    );

    expect(screen.getByTestId("crop-box")).toHaveStyle({
      left: "25%",
      top: "10%",
      width: "50%",
      height: "80%",
    });
  });

  it("dragging the se handle resizes the crop", () => {
    const onChange = jest.fn();
    render(<CropOverlay crop={FULL_FRAME_CROP} onChange={onChange} />);

    const handle = screen.getByTestId("crop-handle-se");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150, clientY: 80 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(lastCrop(onChange)).toEqual({ x: 0, y: 0, width: 0.75, height: 0.8 });
  });

  it("dragging the nw handle moves the top-left edge inward", () => {
    const onChange = jest.fn();
    render(<CropOverlay crop={FULL_FRAME_CROP} onChange={onChange} />);

    const handle = screen.getByTestId("crop-handle-nw");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 40, clientY: 30 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    const crop = lastCrop(onChange);
    expect(crop.x).toBeCloseTo(0.2, 5);
    expect(crop.y).toBeCloseTo(0.3, 5);
    expect(crop.width).toBeCloseTo(0.8, 5);
    expect(crop.height).toBeCloseTo(0.7, 5);
  });

  it("dragging the box interior moves the crop without resizing", () => {
    const onChange = jest.fn();
    render(
      <CropOverlay crop={{ x: 0, y: 0, width: 0.5, height: 0.5 }} onChange={onChange} />
    );

    const box = screen.getByTestId("crop-box");
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 50, clientY: 25 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerUp(box, { pointerId: 1 });

    expect(lastCrop(onChange)).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  });

  it("clamps moves to the frame bounds", () => {
    const onChange = jest.fn();
    render(
      <CropOverlay crop={{ x: 0.4, y: 0.4, width: 0.5, height: 0.5 }} onChange={onChange} />
    );

    const box = screen.getByTestId("crop-box");
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(box, { pointerId: 1 });

    expect(lastCrop(onChange)).toEqual({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
  });

  it("enforces the minimum crop size while resizing", () => {
    const onChange = jest.fn();
    render(<CropOverlay crop={FULL_FRAME_CROP} onChange={onChange} />);

    const handle = screen.getByTestId("crop-handle-se");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 100 });
    // Try to collapse the box past the top-left corner.
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    const crop = lastCrop(onChange);
    expect(crop.width).toBeCloseTo(MIN_CROP_FRACTION, 5);
    expect(crop.height).toBeCloseTo(MIN_CROP_FRACTION, 5);
  });

  it("ignores pointer moves when no drag is active", () => {
    const onChange = jest.fn();
    render(<CropOverlay crop={FULL_FRAME_CROP} onChange={onChange} />);

    fireEvent.pointerMove(screen.getByTestId("crop-box"), { pointerId: 1, clientX: 50, clientY: 50 });

    expect(onChange).not.toHaveBeenCalled();
  });
});
