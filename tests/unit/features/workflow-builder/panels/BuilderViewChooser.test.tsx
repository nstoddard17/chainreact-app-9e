/**
 * BUILDER-VIEW-DEFAULT-1 — the first-open view chooser for a newly created
 * workflow. Pins: both real views offered, choosing reports the view + the
 * opt-in remember flag (unchecked by default), × and Escape dismiss without
 * choosing, and the dialog is labeled for assistive tech.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderViewChooser } from "@/features/workflow-builder/panels/BuilderViewChooser";

describe("BuilderViewChooser", () => {
  it("offers Visual and Document as a labeled dialog", () => {
    render(<BuilderViewChooser onChoose={jest.fn()} onDismiss={jest.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Choose your builder view" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId("builder-view-chooser-visual")).toHaveTextContent(
      "Visual builder",
    );
    expect(screen.getByTestId("builder-view-chooser-document")).toHaveTextContent(
      "Document builder",
    );
  });

  it("choosing a view reports remember=false by default (asks again next time)", async () => {
    const user = userEvent.setup();
    const onChoose = jest.fn();
    render(<BuilderViewChooser onChoose={onChoose} onDismiss={jest.fn()} />);
    await user.click(screen.getByTestId("builder-view-chooser-document"));
    expect(onChoose).toHaveBeenCalledWith("document", false);
  });

  it("ticking 'always use this view' reports remember=true", async () => {
    const user = userEvent.setup();
    const onChoose = jest.fn();
    render(<BuilderViewChooser onChoose={onChoose} onDismiss={jest.fn()} />);
    await user.click(screen.getByTestId("builder-view-chooser-remember"));
    await user.click(screen.getByTestId("builder-view-chooser-visual"));
    expect(onChoose).toHaveBeenCalledWith("visual", true);
  });

  it("× and Escape dismiss without choosing", async () => {
    const user = userEvent.setup();
    const onChoose = jest.fn();
    const onDismiss = jest.fn();
    render(<BuilderViewChooser onChoose={onChoose} onDismiss={onDismiss} />);
    await user.click(screen.getByTestId("builder-view-chooser-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    screen.getByRole("dialog").focus();
    await user.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onChoose).not.toHaveBeenCalled();
  });
});
