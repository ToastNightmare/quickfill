import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContextPanel } from "@/components/ContextPanel";
import type { EditorField, ToolDefaultState } from "@/lib/types";
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
    activeTool: "checkbox",
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

const checkboxField: EditorField = {
  id: "checkbox-1",
  type: "checkbox",
  x: 10,
  y: 10,
  width: 20,
  height: 20,
  page: 0,
  checked: true,
  stamp: "tick",
  color: "#000000",
};

describe("ContextPanel checkbox controls", () => {
  it("renders pre-placement style, color, and size pickers for the checkbox tool", () => {
    renderPanel();

    expect(screen.getByText("Style")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /empty/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tick/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cross/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Blue checkbox color")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /M 20/i })).toBeInTheDocument();
  });

  it("calls onToolDefaultChange when a default color swatch is clicked", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByLabelText("Blue checkbox color"));

    expect(props.onToolDefaultChange).toHaveBeenCalledWith("checkbox", { color: "#2563eb" });
  });

  it("calls onToolDefaultChange when a default style is clicked", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /cross/i }));

    expect(props.onToolDefaultChange).toHaveBeenCalledWith("checkbox", { stamp: "cross" });
  });

  it("shows color controls when a checkbox field is selected", () => {
    renderPanel({ activeTool: "select", selectedField: checkboxField });

    expect(screen.getAllByText("Checkbox selected")).toHaveLength(2);
    expect(screen.getAllByText("Color")).toHaveLength(2);
    expect(screen.getAllByLabelText("Red checkbox color")).toHaveLength(2);
  });
});
