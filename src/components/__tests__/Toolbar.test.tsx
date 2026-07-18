import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { Toolbar } from "@/components/Toolbar";

// Keep the /api/usage lookup pending so the component never updates state
// outside of act() during these layout-focused tests.
beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

type ToolbarActionOverrides = {
  hidden?: boolean;
  onShowHelp?: () => void;
  onStartOver?: () => void;
};

function renderToolbar(extraProps: ToolbarActionOverrides & { mobile?: boolean } = {}) {
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
    />
  );
}

function renderMobileToolbar(extraProps: ToolbarActionOverrides = {}) {
  return renderToolbar({ ...extraProps, mobile: true });
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

  it("groups Help and Start Over in an accessible actions menu", () => {
    renderMobileToolbar({ onShowHelp: jest.fn(), onStartOver: jest.fn() });

    const actions = screen.getByRole("button", { name: "More actions" });
    expect(actions).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Actions" })).not.toBeInTheDocument();

    fireEvent.click(actions);

    expect(actions).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Start Over" })).toBeInTheDocument();
  });

  it("invokes each grouped action exactly once", () => {
    const onShowHelp = jest.fn();
    const onStartOver = jest.fn();
    renderMobileToolbar({ onShowHelp, onStartOver });

    const actions = screen.getByRole("button", { name: "More actions" });
    fireEvent.click(actions);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(onShowHelp).toHaveBeenCalledTimes(1);
    expect(onStartOver).not.toHaveBeenCalled();
    expect(actions).toHaveAttribute("aria-expanded", "false");
    expect(actions).toHaveFocus();

    fireEvent.click(actions);
    fireEvent.click(screen.getByRole("button", { name: "Start Over" }));
    expect(onShowHelp).toHaveBeenCalledTimes(1);
    expect(onStartOver).toHaveBeenCalledTimes(1);
    expect(actions).toHaveAttribute("aria-expanded", "false");
  });

  it("preserves direct icon buttons when only one callback exists", () => {
    const help = renderMobileToolbar({ onShowHelp: jest.fn() });
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    help.unmount();

    renderMobileToolbar({ onStartOver: jest.fn() });
    expect(screen.getByRole("button", { name: "Start over" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  it("dismisses the actions menu with Escape and an outside pointer", () => {
    renderMobileToolbar({ onShowHelp: jest.fn(), onStartOver: jest.fn() });

    const actions = screen.getByRole("button", { name: "More actions" });
    fireEvent.click(actions);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(actions).toHaveAttribute("aria-expanded", "false");
    expect(actions).toHaveFocus();

    fireEvent.click(actions);
    fireEvent.pointerDown(document.body);
    expect(actions).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Actions" })).not.toBeInTheDocument();
  });
});

describe("Toolbar (desktop)", () => {
  it("keeps Help and Start Over as separate desktop actions", () => {
    const onShowHelp = jest.fn();
    const onStartOver = jest.fn();
    renderToolbar({ onShowHelp, onStartOver });

    fireEvent.click(screen.getByTitle("Show tutorial"));
    fireEvent.click(screen.getByRole("button", { name: "Start Over" }));

    expect(onShowHelp).toHaveBeenCalledTimes(1);
    expect(onStartOver).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });
});
