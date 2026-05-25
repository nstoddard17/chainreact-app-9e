/**
 * Tests for VariablePickerButton — Slice 3.7.
 *
 * The trigger button toggles the popover; outside-click closes it;
 * empty sources hide the button entirely.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VariablePickerButton } from "@/features/workflow-builder/config-modal/fields/VariablePickerButton";
import type { VariableSource } from "@/features/workflow-builder/hooks/useUpstreamVariables";

const triggerSource: VariableSource = {
  sourceId: "trigger",
  displayName: "Manual Trigger",
  kind: "trigger",
  provider: "native",
  outputs: [{ name: "from", type: "string" }],
};

describe("VariablePickerButton", () => {
  it("renders nothing when sources is empty", () => {
    const { container } = render(
      <VariablePickerButton
        sources={[]}
        onInsertAtCursor={jest.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the trigger button when sources exist", () => {
    render(
      <VariablePickerButton
        sources={[triggerSource]}
        onInsertAtCursor={jest.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /insert variable/i }),
    ).toBeInTheDocument();
  });

  it("clicking the trigger toggles the popover open/closed", async () => {
    const user = userEvent.setup();
    render(
      <VariablePickerButton
        sources={[triggerSource]}
        onInsertAtCursor={jest.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: /insert variable/i });
    expect(
      screen.queryByRole("dialog", { name: /variable picker/i }),
    ).not.toBeInTheDocument();
    await user.click(trigger);
    expect(
      screen.getByRole("dialog", { name: /variable picker/i }),
    ).toBeInTheDocument();
    await user.click(trigger);
    expect(
      screen.queryByRole("dialog", { name: /variable picker/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking an output forwards the token through onInsertAtCursor + closes the popover", async () => {
    const user = userEvent.setup();
    const onInsert = jest.fn();
    render(
      <VariablePickerButton
        sources={[triggerSource]}
        onInsertAtCursor={onInsert}
      />,
    );
    await user.click(screen.getByRole("button", { name: /insert variable/i }));
    await user.click(screen.getByLabelText("Insert {{trigger.from}}"));
    expect(onInsert).toHaveBeenCalledWith("{{trigger.from}}");
    expect(
      screen.queryByRole("dialog", { name: /variable picker/i }),
    ).not.toBeInTheDocument();
  });

  it("outside-click closes the popover (mousedown listener)", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <VariablePickerButton
          sources={[triggerSource]}
          onInsertAtCursor={jest.fn()}
        />
        <button type="button" data-testid="outside">Outside</button>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: /insert variable/i }));
    expect(
      screen.getByRole("dialog", { name: /variable picker/i }),
    ).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(
      screen.queryByRole("dialog", { name: /variable picker/i }),
    ).not.toBeInTheDocument();
  });

  it("applies the custom testIdRoot to root + trigger + popover", () => {
    render(
      <VariablePickerButton
        sources={[triggerSource]}
        onInsertAtCursor={jest.fn()}
        testIdRoot="my-picker"
      />,
    );
    expect(screen.getByTestId("my-picker-root")).toBeInTheDocument();
    expect(screen.getByTestId("my-picker-trigger")).toBeInTheDocument();
  });
});
