import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ContextPanel } from "@/components/ContextPanel";
import type { EditorField, ToolDefaultState } from "@/lib/types";
import type { ComponentProps } from "react";

const FORM_FIDELITY_FLAG = "NEXT_PUBLIC_QUICKFILL_FORM_FIDELITY";
const originalFormFidelityFlag = process.env[FORM_FIDELITY_FLAG];

const toolDefaults: ToolDefaultState = {
  select: {},
  text: { fontSize: 14 },
  date: { fontSize: 14, format: "en-AU" },
  checkbox: { stamp: "tick", color: "#000000", size: 20 },
  signature: { fontSize: 16 },
  box: { charCount: 9 },
  whiteout: { fillColor: null },
  line: {
    strokeWidth: 1,
    color: "#000000",
    orientation: "horizontal",
  },
  eraser: { size: 48 },
  "mask-eraser": { size: 48 },
};

const combField: Extract<EditorField, { type: "comb" }> = {
  id: "comb-1",
  type: "comb",
  x: 10,
  y: 10,
  width: 216,
  height: 28,
  page: 0,
  value: "",
  charCount: 9,
};

function renderPanel() {
  const props: ComponentProps<typeof ContextPanel> = {
    activeTool: "select",
    selectedField: combField,
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
  };
  render(<ContextPanel {...props} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Character Count" }),
  );
  return props;
}

afterEach(() => {
  if (originalFormFidelityFlag === undefined) {
    delete process.env[FORM_FIDELITY_FLAG];
  } else {
    process.env[FORM_FIDELITY_FLAG] = originalFormFidelityFlag;
  }
});

describe("ContextPanel form-fidelity comb controls", () => {
  it("offers every count from 2 through 30 and exposes BSB plus Y offset", () => {
    process.env[FORM_FIDELITY_FLAG] = "v1";
    const props = renderPanel();
    const select = screen.getByRole("combobox");
    const optionValues = within(select)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);

    expect(optionValues).toEqual(
      Array.from({ length: 29 }, (_, index) => String(index + 2)),
    );
    expect(optionValues).toContain("2");
    expect(optionValues).toContain("6");
    expect(
      screen.getByText(
        "Common: 9 TFN, 11 ABN, 10 Medicare, 6 BSB",
      ),
    ).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "2" } });
    fireEvent.change(select, { target: { value: "6" } });
    expect(props.onFieldUpdate).toHaveBeenNthCalledWith(1, combField.id, {
      charCount: 2,
      cellPositions: undefined,
      cellWidths: undefined,
    });
    expect(props.onFieldUpdate).toHaveBeenNthCalledWith(2, combField.id, {
      charCount: 6,
      cellPositions: undefined,
      cellWidths: undefined,
    });

    fireEvent.change(screen.getByTestId("comb-offset-y"), {
      target: { value: "-7" },
    });
    expect(props.onFieldUpdate).toHaveBeenLastCalledWith(combField.id, {
      offsetY: -7,
    });
  });

  it("keeps the exact legacy count list and hides Y offset flag-off", () => {
    delete process.env[FORM_FIDELITY_FLAG];
    renderPanel();
    const optionValues = within(screen.getByRole("combobox"))
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);

    expect(optionValues).toEqual([
      "8",
      "9",
      "10",
      "11",
      "12",
      "15",
      "16",
      "20",
      "30",
    ]);
    expect(
      screen.getByText("Common: 9 TFN, 11 ABN, 10 Medicare"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("comb-offset-y")).not.toBeInTheDocument();
  });
});
