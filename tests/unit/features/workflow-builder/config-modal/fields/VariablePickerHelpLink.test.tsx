/**
 * HELP-CENTER-CONTEXTUAL-1 — variable-picker Help Center link.
 *
 * Pins: the open picker renders one footer link to the step-data article
 * as a real keyboard-focusable <a>, the empty picker (no sources) still
 * renders nothing at all, and insert behavior is untouched.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VariablePickerPopover } from "@/features/workflow-builder/config-modal/fields/VariablePickerPopover";
import type { VariableSource } from "@/features/workflow-builder/hooks/useUpstreamVariables";

const triggerSource: VariableSource = {
  sourceId: "trigger",
  displayName: "Manual Trigger",
  kind: "trigger",
  provider: "native",
  outputs: [{ name: "from", type: "string", description: "Sender address." }],
};

describe("VariablePickerPopover — Help Center link", () => {
  it("renders the step-data article link as a focusable footer <a>", async () => {
    const user = userEvent.setup();
    render(
      <VariablePickerPopover
        sources={[triggerSource]}
        onInsert={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const help = screen.getByTestId("variable-picker-help-link");
    expect(help.tagName.toLowerCase()).toBe("a");
    expect(help).toHaveAttribute("href", "/help/use-data-from-an-earlier-step");
    expect(help).toHaveTextContent("Learn how to use data from an earlier step");
    // Keyboard reachable: it takes focus via tabbing like any real link.
    await user.tab();
    // (first tabbable is the source toggle button; keep tabbing to the link)
    let guard = 0;
    while (document.activeElement !== help && guard < 10) {
      await user.tab();
      guard += 1;
    }
    expect(document.activeElement).toBe(help);
  });

  it("still renders nothing at all when there are no sources", () => {
    const { container } = render(
      <VariablePickerPopover sources={[]} onInsert={jest.fn()} onClose={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("variable-picker-help-link")).not.toBeInTheDocument();
  });

  it("inserting a variable still works with the footer present", async () => {
    const user = userEvent.setup();
    const onInsert = jest.fn();
    render(
      <VariablePickerPopover
        sources={[triggerSource]}
        onInsert={onInsert}
        onClose={jest.fn()}
      />,
    );
    // Trigger sources start expanded; click the output row's insert button.
    await user.click(
      within(screen.getByTestId("variable-output-trigger-from")).getByRole("button"),
    );
    expect(onInsert).toHaveBeenCalledWith("{{trigger.from}}");
  });
});
