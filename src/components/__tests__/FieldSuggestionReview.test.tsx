import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { FieldSuggestionReview } from "@/components/FieldSuggestionReview";
import { createFieldSuggestionId, type FieldSuggestion } from "@/lib/field-suggestions";

const DOCUMENT_REVISION = `qf-document-v1-${"a".repeat(64)}`;

function makeSuggestion(index: number, type: "text" | "checkbox" = "text"): FieldSuggestion {
  const boundingBox = { x: 10 + index * 30, y: 20, width: type === "checkbox" ? 18 : 60, height: 18 };
  return {
    schemaVersion: 1,
    id: createFieldSuggestionId({ documentRevision: DOCUMENT_REVISION, pageIndex: 0, boundingBox }),
    documentRevision: DOCUMENT_REVISION,
    type,
    pageIndex: 0,
    boundingBox,
    coordinateSpace: { unit: "pdf-point", origin: "top-left", pageWidth: 200, pageHeight: 300 },
    confidence: 0.7,
    metadata: { category: "visual-box" },
  };
}

const suggestions = [makeSuggestion(0), makeSuggestion(1, "checkbox")];

function renderReview(overrides: Partial<React.ComponentProps<typeof FieldSuggestionReview>> = {}) {
  const props: React.ComponentProps<typeof FieldSuggestionReview> = {
    status: "review",
    suggestions,
    onTypeChange: jest.fn(),
    onCommit: jest.fn(),
    onRetry: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
  return { ...render(<FieldSuggestionReview {...props} />), props };
}

describe("FieldSuggestionReview", () => {
  it("announces local processing, focuses the dialog, and supports Escape cancellation", () => {
    const before = document.createElement("button");
    document.body.appendChild(before);
    before.focus();
    const onCancel = jest.fn();
    const { unmount } = renderReview({ status: "processing", suggestions: [], onCancel });

    const dialog = screen.getByRole("dialog", { name: "Finding fillable areas" });
    expect(dialog).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Checking the first photo page");
    expect(screen.getByText(/reuses geometry derived in your browser/i)).toBeInTheDocument();
    expect(screen.getByText(/No page image is sent to an external provider/i)).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
    expect(before).toHaveFocus();
    before.remove();
  });

  it("stages an individual acceptance until final confirmation", () => {
    const onCommit = jest.fn();
    const onDecision = jest.fn();
    renderReview({ onCommit, onDecision });

    fireEvent.click(screen.getByRole("button", { name: "Accept field 1" }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(onDecision).toHaveBeenCalledWith("accepted");
    expect(screen.getByText("Accepted for review")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add accepted fields (1)" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith([suggestions[0]], "accepted_selected");
  });

  it("rejects individually and Accept all commits remaining suggestions once", () => {
    const onCommit = jest.fn();
    renderReview({ onCommit });

    fireEvent.click(screen.getByRole("button", { name: "Reject field 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith([suggestions[0]], "accept_all");
  });

  it("reports only real individual decision transitions", () => {
    const onDecision = jest.fn();
    renderReview({ onDecision });

    fireEvent.click(screen.getByRole("button", { name: "Accept field 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept field 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject field 1" }));

    expect(onDecision.mock.calls).toEqual([["accepted"], ["rejected"]]);
  });

  it("offers only text and checkbox type changes without changing the stable ID", () => {
    const onTypeChange = jest.fn();
    renderReview({ onTypeChange });

    const firstType = screen.getAllByRole("combobox", { name: "Field type" })[0];
    expect(firstType).toHaveValue("text");
    fireEvent.change(firstType, { target: { value: "checkbox" } });

    expect(onTypeChange).toHaveBeenCalledWith(suggestions[0].id, "checkbox");
  });

  it("provides retry and safe editor fallback when detection fails or finds nothing", () => {
    const onRetry = jest.fn();
    const onCancel = jest.fn();
    const { rerender } = render(
      <FieldSuggestionReview
        status="error"
        suggestions={[]}
        errorMessage="Detection failed safely."
        onTypeChange={jest.fn()}
        onCommit={jest.fn()}
        onRetry={onRetry}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Detection failed safely.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <FieldSuggestionReview
        status="review"
        suggestions={[]}
        onTypeChange={jest.fn()}
        onCommit={jest.fn()}
        onRetry={onRetry}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("No clear fillable areas were found.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue in editor" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("uses native controls and 44px minimum targets for mobile and keyboard access", () => {
    renderReview();

    for (const control of [
      ...screen.getAllByRole("button"),
      ...screen.getAllByRole("combobox"),
    ]) {
      expect(control).toHaveClass("min-h-11");
    }
    expect(screen.getAllByRole("combobox", { name: "Field type" })).toHaveLength(2);
  });
});
