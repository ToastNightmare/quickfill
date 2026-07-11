import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContextPanel } from "@/components/ContextPanel";
import type { SignatureField, ToolDefaultState } from "@/lib/types";
import type { ComponentProps } from "react";

// Note: ContextPanel renders both the desktop panel and the mobile bottom
// sheet (hidden via CSS, still present in jsdom), so shared controls appear
// twice once the mobile sheet's Adjust section is expanded. The mobile sheet
// is compact by default, so its type-specific controls only exist after
// clicking the Adjust toggle. Queries below use getAllBy* where both
// instances can exist.

const toolDefaults: ToolDefaultState = {
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

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function signedField(overrides: Partial<SignatureField> = {}): SignatureField {
  return {
    id: "sig-1",
    type: "signature",
    x: 100,
    y: 200,
    width: 180,
    height: 60,
    page: 0,
    value: "",
    fontSize: 16,
    signatureDataUrl: TINY_PNG_DATA_URL,
    ...overrides,
  };
}

function renderPanel(overrides: Partial<ComponentProps<typeof ContextPanel>> = {}) {
  const props: ComponentProps<typeof ContextPanel> = {
    activeTool: "select",
    selectedField: signedField(),
    onToolCancel: jest.fn(),
    onFieldUpdate: jest.fn(),
    onFieldDelete: jest.fn(),
    onFieldDeselect: jest.fn(),
    onFieldEdit: jest.fn(),
    onFieldDuplicate: jest.fn(),
    onStampChange: jest.fn(),
    onSignatureRequest: jest.fn(),
    onAutoFill: jest.fn(),
    onDetectFields: jest.fn(),
    isDetecting: false,
    toolDefaults,
    onToolDefaultChange: jest.fn(),
    ...overrides,
  };

  render(<ContextPanel {...props} />);
  return props;
}

describe("ContextPanel signature adjustments", () => {
  it("renders opacity and rotation controls with default values for a signed field", () => {
    renderPanel();

    expect(screen.getAllByTestId("signature-opacity-value")[0]).toHaveTextContent("100%");
    expect(screen.getAllByTestId("signature-rotation-value")[0]).toHaveTextContent("0°");
    expect(screen.getAllByLabelText("Signature opacity").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Signature rotation").length).toBeGreaterThan(0);
  });

  it("does not render adjustment controls for an unsigned field", () => {
    renderPanel({ selectedField: signedField({ signatureDataUrl: undefined }) });

    expect(screen.queryAllByLabelText("Signature opacity")).toHaveLength(0);
    expect(screen.queryAllByLabelText("Signature rotation")).toHaveLength(0);
    expect(screen.queryByTestId("signature-nudge-pad")).not.toBeInTheDocument();
  });

  it("updates opacity through the slider", () => {
    const props = renderPanel();

    fireEvent.change(screen.getAllByLabelText("Signature opacity")[0], { target: { value: "55" } });

    expect(props.onFieldUpdate).toHaveBeenCalledWith("sig-1", { opacity: 0.55 });
  });

  it("updates rotation through the slider", () => {
    const props = renderPanel();

    fireEvent.change(screen.getAllByLabelText("Signature rotation")[0], { target: { value: "-15" } });

    expect(props.onFieldUpdate).toHaveBeenCalledWith("sig-1", { rotation: -15 });
  });

  it("rotates by one degree with the rotate buttons", () => {
    const props = renderPanel({ selectedField: signedField({ rotation: 5 }) });

    fireEvent.click(screen.getAllByLabelText("Rotate 1 degree left")[0]);
    expect(props.onFieldUpdate).toHaveBeenCalledWith("sig-1", { rotation: 4 });

    fireEvent.click(screen.getAllByLabelText("Rotate 1 degree right")[0]);
    expect(props.onFieldUpdate).toHaveBeenCalledWith("sig-1", { rotation: 6 });
  });

  it("clamps rotation at the range limits", () => {
    const props = renderPanel({ selectedField: signedField({ rotation: 180 }) });

    fireEvent.click(screen.getAllByLabelText("Rotate 1 degree right")[0]);

    expect(props.onFieldUpdate).toHaveBeenCalledWith("sig-1", { rotation: 180 });
  });

  it("toggles horizontal flip", () => {
    const props = renderPanel();

    fireEvent.click(screen.getAllByLabelText("Flip horizontally")[0]);

    expect(props.onFieldUpdate).toHaveBeenCalledWith("sig-1", { flipH: true });
  });

  it("resets opacity, rotation, and flip to defaults", () => {
    const props = renderPanel({
      selectedField: signedField({ opacity: 0.4, rotation: 12, flipH: true }),
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Reset" })[0]);

    expect(props.onFieldUpdate).toHaveBeenCalledWith("sig-1", {
      opacity: 1,
      rotation: 0,
      flipH: false,
    });
  });

  it("disables reset when the signature has no adjustments", () => {
    renderPanel();

    for (const button of screen.getAllByRole("button", { name: "Reset" })) {
      expect(button).toBeDisabled();
    }
  });

  it("renders the mobile nudge pad only in the mobile sheet and nudges x/y by 1pt", () => {
    const props = renderPanel();

    // Compact sheet hides advanced controls until Adjust is expanded.
    expect(screen.queryByTestId("signature-nudge-pad")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mobile-field-adjust-toggle"));

    // Exactly one nudge pad: the mobile bottom sheet instance.
    const pads = screen.getAllByTestId("signature-nudge-pad");
    expect(pads).toHaveLength(1);

    fireEvent.click(screen.getByLabelText("Nudge left"));
    expect(props.onFieldUpdate).toHaveBeenCalledWith("sig-1", { x: 99, y: 200 });

    fireEvent.click(screen.getByLabelText("Nudge up"));
    expect(props.onFieldUpdate).toHaveBeenCalledWith("sig-1", { x: 100, y: 199 });

    fireEvent.click(screen.getByLabelText("Nudge down"));
    expect(props.onFieldUpdate).toHaveBeenCalledWith("sig-1", { x: 100, y: 201 });

    fireEvent.click(screen.getByLabelText("Nudge right"));
    expect(props.onFieldUpdate).toHaveBeenCalledWith("sig-1", { x: 101, y: 200 });
  });

  it("desktop panel shows the arrow-key nudge hint", () => {
    renderPanel();

    expect(screen.getByText(/arrow keys nudge/i)).toBeInTheDocument();
  });
});
