import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import PrivacyPage from "../page";

describe("PrivacyPage document handling", () => {
  it("separates browser editing, cloud AI, completed-PDF processing, local data, and telemetry", () => {
    const { container } = render(<PrivacyPage />);

    expect(screen.getByRole("heading", { name: "How QuickFill handles your document" })).toBeInTheDocument();
    for (const heading of [
      "Core editing and optional local suggestions",
      "Cloud AI field detection",
      "Creating the completed PDF",
      "Browser-local working data",
      "Limited operational telemetry",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }

    expect(container).toHaveTextContent("Much of QuickFill's editing happens in your browser");
    expect(container).toHaveTextContent("does not call QuickFill's cloud detection API");
    expect(container).toHaveTextContent("currently OpenAI");
    expect(container).toHaveTextContent("working PDF and the field data required for that request");
    expect(container).toHaveTextContent("normalized working data in browser-local storage");
    expect(container).toHaveTextContent("exclude document pixels, field contents, coordinates, and raw suggestions");
    expect(container).toHaveTextContent("not cohort-safe or complete rollout evidence");
  });

  it("does not make absolute device, upload, storage, or deletion claims", () => {
    const { container } = render(<PrivacyPage />);
    const copy = container.textContent ?? "";

    for (const forbiddenClaim of [
      "Everything stays on your device",
      "Your document never leaves your browser",
      "QuickFill stores nothing",
      "Nothing is uploaded",
      "Everything disappears when the tab closes",
      "permanently removed from our systems",
    ]) {
      expect(copy).not.toContain(forbiddenClaim);
    }
  });
});
