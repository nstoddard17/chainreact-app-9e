/**
 * Tests for features/workflow-builder/config-modal/fields/VariablePickerPopover.
 *
 * Slice 3.7 — plain HTML popover, jsdom-friendly. Tests pin:
 *   - Empty sources renders nothing.
 *   - Source headers + output buttons render with friendly labels +
 *     type chips.
 *   - Clicking an output fires onInsert with the canonical token.
 *   - Recursive output trees insert dotted paths.
 *   - Expanding / collapsing sections toggles visibility.
 *   - Escape calls onClose.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  VariablePickerPopover,
  type VariablePickerPopoverProps,
} from "@/features/workflow-builder/config-modal/fields/VariablePickerPopover";
import type { VariableSource } from "@/features/workflow-builder/hooks/useUpstreamVariables";

const triggerSource: VariableSource = {
  sourceId: "trigger",
  displayName: "Manual Trigger",
  kind: "trigger",
  provider: "native",
  outputs: [
    { name: "from", type: "string", description: "Sender address." },
    {
      name: "payload",
      type: "object",
      fields: [
        { name: "message", type: "string" },
        { name: "subject", type: "string" },
      ],
    },
  ],
};

const actionSource: VariableSource = {
  sourceId: "node-x",
  displayName: "HTTP Request",
  kind: "action",
  provider: "native",
  outputs: [
    { name: "status", type: "number" },
    { name: "body", type: "string" },
  ],
};

function renderPopover(
  overrides: Partial<VariablePickerPopoverProps> = {},
): {
  onInsert: jest.Mock<void, [string]>;
  onClose: jest.Mock<void, []>;
} {
  const onInsert = jest.fn<void, [string]>();
  const onClose = jest.fn<void, []>();
  render(
    <VariablePickerPopover
      sources={[triggerSource, actionSource]}
      onInsert={onInsert}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onInsert, onClose };
}

describe("VariablePickerPopover — empty", () => {
  it("renders nothing when sources is empty", () => {
    const onInsert = jest.fn();
    const onClose = jest.fn();
    const { container } = render(
      <VariablePickerPopover
        sources={[]}
        onInsert={onInsert}
        onClose={onClose}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("VariablePickerPopover — render", () => {
  it("renders one section per source with display names + source ids", () => {
    renderPopover();
    expect(
      screen.getByRole("dialog", { name: /variable picker/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /variable source trigger/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /variable source node-x/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
  });

  it("expands the first source by default and collapses the rest", () => {
    renderPopover();
    // Trigger source is first → its outputs are visible.
    expect(screen.getByText("from")).toBeInTheDocument();
    // Action source is collapsed → its outputs are NOT in the DOM.
    expect(screen.queryByText("status")).not.toBeInTheDocument();
  });

  it("shows type chips next to outputs", () => {
    renderPopover();
    // First-source outputs visible: from (string), payload (object),
    // payload.message (string), payload.subject (string) — three
    // strings + one object.
    expect(screen.getAllByLabelText("Type string")).toHaveLength(3);
    expect(screen.getByLabelText("Type object")).toBeInTheDocument();
  });

  it("shows recursive nested fields under expandable parent outputs", () => {
    renderPopover();
    // `payload` declares nested fields — they render inline (no
    // separate expansion for nested fields, they just appear under the
    // parent's expanded section).
    expect(screen.getByText("message")).toBeInTheDocument();
    expect(screen.getByText("subject")).toBeInTheDocument();
  });
});

describe("VariablePickerPopover — expand / collapse", () => {
  it("clicking a collapsed section header expands it", async () => {
    const user = userEvent.setup();
    renderPopover();
    expect(screen.queryByText("status")).not.toBeInTheDocument();
    await user.click(screen.getByText("HTTP Request"));
    expect(screen.getByText("status")).toBeInTheDocument();
  });

  it("clicking an expanded section header collapses it", async () => {
    const user = userEvent.setup();
    renderPopover();
    expect(screen.getByText("from")).toBeInTheDocument();
    await user.click(screen.getByText("Manual Trigger"));
    expect(screen.queryByText("from")).not.toBeInTheDocument();
  });
});

describe("VariablePickerPopover — insert", () => {
  it("clicking a leaf output fires onInsert with the canonical token", async () => {
    const { onInsert } = renderPopover();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Insert {{trigger.from}}"));
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith("{{trigger.from}}");
  });

  it("clicking a nested field uses the dotted full path", async () => {
    const { onInsert } = renderPopover();
    const user = userEvent.setup();
    await user.click(
      screen.getByLabelText("Insert {{trigger.payload.message}}"),
    );
    expect(onInsert).toHaveBeenCalledWith("{{trigger.payload.message}}");
  });

  it("clicking an action-source output uses the source id (not 'trigger' alias)", async () => {
    const user = userEvent.setup();
    const { onInsert } = renderPopover();
    // Expand the action source first.
    await user.click(screen.getByText("HTTP Request"));
    await user.click(screen.getByLabelText("Insert {{node-x.status}}"));
    expect(onInsert).toHaveBeenCalledWith("{{node-x.status}}");
  });

  it("clicking a parent `object` output also inserts the parent path (authors may want the whole object)", async () => {
    const { onInsert } = renderPopover();
    const user = userEvent.setup();
    // The parent output `payload` itself has an Insert button — the
    // expand toggle is the section header, the Insert button is the
    // output button.
    await user.click(screen.getByLabelText("Insert {{trigger.payload}}"));
    expect(onInsert).toHaveBeenCalledWith("{{trigger.payload}}");
  });
});

describe("VariablePickerPopover — keyboard", () => {
  it("Escape inside the popover calls onClose", () => {
    const { onClose } = renderPopover();
    const dialog = screen.getByRole("dialog", { name: /variable picker/i });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("VariablePickerPopover — testId scoping", () => {
  it("renders the default testid root by default", () => {
    renderPopover();
    expect(screen.getByTestId("variable-picker-popover")).toBeInTheDocument();
  });

  it("renders a custom testId when supplied", () => {
    renderPopover({ testId: "custom-picker" });
    expect(screen.getByTestId("custom-picker")).toBeInTheDocument();
  });

  it("output buttons carry per-source-per-path testids for scoped queries", () => {
    renderPopover();
    expect(
      screen.getByTestId("variable-output-trigger-from"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByTestId("variable-output-trigger-payload"),
      ).getByLabelText("Insert {{trigger.payload}}"),
    ).toBeInTheDocument();
  });
});
