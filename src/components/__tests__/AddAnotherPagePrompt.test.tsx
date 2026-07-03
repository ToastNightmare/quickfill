import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { AddAnotherPagePrompt } from "@/components/AddAnotherPagePrompt";

describe("AddAnotherPagePrompt", () => {
  it("calls the add and done actions", () => {
    const onAddAnother = jest.fn();
    const onDone = jest.fn();

    render(<AddAnotherPagePrompt open onAddAnother={onAddAnother} onDone={onDone} />);

    expect(screen.getByText("Page added")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add another page" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onAddAnother).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("dismisses when the backdrop is clicked", () => {
    const onDone = jest.fn();

    const { container } = render(<AddAnotherPagePrompt open onAddAnother={jest.fn()} onDone={onDone} />);
    fireEvent.mouseDown(container.firstChild as Element);

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    render(<AddAnotherPagePrompt open={false} onAddAnother={jest.fn()} onDone={jest.fn()} />);

    expect(screen.queryByText("Page added")).not.toBeInTheDocument();
  });
});
