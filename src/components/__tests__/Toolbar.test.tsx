import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Toolbar } from "@/components/Toolbar";

// Keep the /api/usage lookup pending so the component never updates state
// outside of act() during these layout-focused tests.
beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

function renderMobileToolbar(extraProps: { hidden?: boolean } = {}) {
  return render(
    <Toolbar
      {...extraProps}
      activeTool="select"
      onToolSelect={jest.fn()}
      onUndo={jest.fn()}
      onRedo={jest.fn()}
      onClear={jest.fn()}
      onDownload={jest.fn()}
      canUndo={false}
      canRedo={false}
      isDownloading={false}
      selectedField={null}
      onFontSizeChange={jest.fn()}
      onDetectFields={jest.fn()}
      isDetecting={false}
      onAutoFill={jest.fn()}
      snapEnabled={false}
      onSnapToggle={jest.fn()}
      mobile
    />
  );
}

describe("Toolbar (mobile)", () => {
  it("labels the whiteout tool as Whiteout, distinct from the eraser", () => {
    renderMobileToolbar();

    const whiteout = screen.getByTitle("Whiteout: drag over text to cover it");
    expect(whiteout).toHaveTextContent("Whiteout");

    const eraser = screen.getByTitle("Eraser: drag to erase parts of placed fields");
    expect(eraser).toHaveTextContent("Eraser");
  });

  it("keeps the Download button outside the scrollable tool row", () => {
    renderMobileToolbar();

    const download = screen.getByTitle("Download PDF");
    const whiteout = screen.getByTitle("Whiteout: drag over text to cover it");
    const toolRow = whiteout.parentElement as HTMLElement;

    // Every placement tool lives in the scrollable row; Download must not,
    // so tools can never slide underneath it.
    expect(toolRow).toContainElement(whiteout);
    expect(toolRow).not.toContainElement(download);
    expect(download).toHaveTextContent("Download PDF");
  });

  it("shows every placement tool in the tool row", () => {
    renderMobileToolbar();

    for (const label of ["Select", "Text", "Box", "Tick", "Line", "Eraser", "Sign", "Date", "Whiteout"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders nothing when hidden (field sheet or text edit owns the bottom)", () => {
    const { container } = renderMobileToolbar({ hidden: true });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTitle("Download PDF")).not.toBeInTheDocument();
  });

  it("stays visible below the lg desktop breakpoint so tablets get mobile controls", () => {
    renderMobileToolbar();

    const download = screen.getByTitle("Download PDF");
    // The fixed bottom bar hides at lg (not sm): tablet portrait keeps the
    // mobile toolbar instead of two fixed side panels.
    const bar = download.closest("div.fixed") as HTMLElement;
    expect(bar).toHaveClass("lg:hidden");
    expect(bar.className).not.toContain("sm:hidden");
  });
});
