import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ContextPanel } from "@/components/ContextPanel";
import type { EditorField, SignatureField, ToolDefaultState } from "@/lib/types";
import type { ComponentProps } from "react";

// PR #93: the mobile field sheet is compact by default so the document stays
// the hero on phone/tablet. Advanced controls live behind the Adjust toggle.

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

const textField: EditorField = {
  id: "text-1",
  type: "text",
  x: 50,
  y: 60,
  width: 200,
  height: 28,
  page: 0,
  value: "hello",
  fontSize: 14,
};

function signatureField(overrides: Partial<SignatureField> = {}): SignatureField {
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
    ...overrides,
  };
}

function renderPanel(overrides: Partial<ComponentProps<typeof ContextPanel>> = {}) {
  const props: ComponentProps<typeof ContextPanel> = {
    activeTool: "select",
    selectedField: textField,
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

describe("MobileFieldSheet compact behaviour", () => {
  it("renders compact by default: primary actions visible, advanced controls hidden", () => {
    renderPanel();

    const sheet = screen.getByTestId("mobile-field-sheet");
    expect(sheet).toHaveAttribute("data-expanded", "false");

    // Primary actions stay one tap away.
    expect(within(sheet).getByTestId("mobile-field-edit")).toBeInTheDocument();
    expect(within(sheet).getByTestId("mobile-field-duplicate")).toBeInTheDocument();
    expect(within(sheet).getByTestId("mobile-field-delete")).toBeInTheDocument();
    expect(within(sheet).getByTestId("mobile-field-done")).toBeInTheDocument();

    // Advanced controls (font size for text fields) are collapsed.
    expect(within(sheet).queryByTestId("mobile-field-advanced")).not.toBeInTheDocument();
    expect(within(sheet).queryByText("Font Size")).not.toBeInTheDocument();
  });

  it("expands advanced controls behind the Adjust toggle and collapses again", () => {
    renderPanel();

    const sheet = screen.getByTestId("mobile-field-sheet");
    const toggle = within(sheet).getByTestId("mobile-field-adjust-toggle");

    fireEvent.click(toggle);
    expect(sheet).toHaveAttribute("data-expanded", "true");
    expect(within(sheet).getByTestId("mobile-field-advanced")).toBeInTheDocument();
    expect(within(sheet).getByText("Font Size")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(sheet).toHaveAttribute("data-expanded", "false");
    expect(within(sheet).queryByTestId("mobile-field-advanced")).not.toBeInTheDocument();
  });

  it("keeps Sign as a primary compact action for unsigned signature fields", () => {
    const props = renderPanel({ selectedField: signatureField() });

    const sheet = screen.getByTestId("mobile-field-sheet");
    const signButton = within(sheet).getByTestId("mobile-field-sign");
    expect(signButton).toHaveTextContent("Sign");

    fireEvent.click(signButton);
    expect(props.onSignatureRequest).toHaveBeenCalledWith("sig-1");
  });

  it("shows Re-sign for signed signature fields and signature adjustments only after expanding", () => {
    renderPanel({ selectedField: signatureField({ signatureDataUrl: TINY_PNG_DATA_URL }) });

    const sheet = screen.getByTestId("mobile-field-sheet");
    expect(within(sheet).getByTestId("mobile-field-sign")).toHaveTextContent("Re-sign");
    expect(within(sheet).queryByLabelText("Signature opacity")).not.toBeInTheDocument();

    fireEvent.click(within(sheet).getByTestId("mobile-field-adjust-toggle"));
    expect(within(sheet).getByLabelText("Signature opacity")).toBeInTheDocument();
  });

  it("fires duplicate, delete + deselect, and done actions from the compact bar", () => {
    const props = renderPanel();
    const sheet = screen.getByTestId("mobile-field-sheet");

    fireEvent.click(within(sheet).getByTestId("mobile-field-duplicate"));
    expect(props.onFieldDuplicate).toHaveBeenCalledWith("text-1");

    fireEvent.click(within(sheet).getByTestId("mobile-field-done"));
    expect(props.onFieldDeselect).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sheet).getByTestId("mobile-field-delete"));
    expect(props.onFieldDelete).toHaveBeenCalledWith("text-1");
    expect(props.onFieldDeselect).toHaveBeenCalledTimes(2);
  });

  it("hides the mobile sheet entirely while inline text editing (suppressMobileSheet)", () => {
    renderPanel({ suppressMobileSheet: true });

    expect(screen.queryByTestId("mobile-field-sheet")).not.toBeInTheDocument();
  });

  it("collapses again when a different field is selected", () => {
    const props = renderPanel();
    fireEvent.click(screen.getByTestId("mobile-field-adjust-toggle"));
    expect(screen.getByTestId("mobile-field-sheet")).toHaveAttribute("data-expanded", "true");

    // Re-render with a different selected field: sheet resets to compact.
    render(
      <ContextPanel
        {...props}
        selectedField={{ ...textField, id: "text-2" }}
      />
    );
    const sheets = screen.getAllByTestId("mobile-field-sheet");
    expect(sheets[sheets.length - 1]).toHaveAttribute("data-expanded", "false");
  });
});
