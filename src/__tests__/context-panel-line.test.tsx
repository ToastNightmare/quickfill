import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContextPanel } from "@/components/ContextPanel";
import type { ToolDefaultState } from "@/lib/types";
import type { ComponentProps } from "react";

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
  "mask-eraser": {},
};

function renderPanel(overrides: Partial<ComponentProps<typeof ContextPanel>> = {}) {
  const props: ComponentProps<typeof ContextPanel> = {
    activeTool: "line",
    selectedField: null,
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

describe("ContextPanel line controls", () => {
  it("renders pre-placement orientation, colour, and thickness pickers for the line tool", () => {
    renderPanel();

    expect(screen.getByText("Orientation")).toBeInTheDocument();
    expect(screen.getByText("Colour")).toBeInTheDocument();
    expect(screen.getByText("Thickness")).toBeInTheDocument();
  });

  it("calls onToolDefaultChange when vertical orientation is clicked", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /vertical/i }));

    expect(props.onToolDefaultChange).toHaveBeenCalledWith("line", { orientation: "vertical" });
  });

  it("calls onToolDefaultChange when blue colour is clicked", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByLabelText("Blue line colour"));

    expect(props.onToolDefaultChange).toHaveBeenCalledWith("line", { color: "#2563eb" });
  });

  it("calls onToolDefaultChange when thick stroke is clicked", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /thick/i }));

    expect(props.onToolDefaultChange).toHaveBeenCalledWith("line", { strokeWidth: 4 });
  });
});
