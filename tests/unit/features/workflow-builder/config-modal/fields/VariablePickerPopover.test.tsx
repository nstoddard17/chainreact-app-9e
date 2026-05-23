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

describe("VariablePickerPopover — latest-run preview (Slice 3.9)", () => {
  it("renders no preview badges when latestValuesBySource is absent (back-compat with 3.7)", () => {
    renderPopover();
    expect(
      screen.queryByTestId("variable-output-trigger-from-preview"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("variable-output-trigger-payload-preview"),
    ).not.toBeInTheDocument();
  });

  it("renders no preview when the source has no entry in the map", () => {
    renderPopover({
      latestValuesBySource: { "different-source": { x: 1 } },
    });
    expect(
      screen.queryByTestId("variable-output-trigger-from-preview"),
    ).not.toBeInTheDocument();
  });

  it("renders a scalar preview for string values", () => {
    renderPopover({
      latestValuesBySource: { trigger: { from: "alice@example.com" } },
    });
    const preview = screen.getByTestId("variable-output-trigger-from-preview");
    expect(preview).toHaveAttribute("data-preview-kind", "scalar");
    expect(preview.textContent).toBe('"alice@example.com"');
  });

  it("renders a scalar preview for number, boolean, and null", () => {
    const triggerWithMix: VariableSource = {
      ...triggerSource,
      outputs: [
        { name: "n", type: "number" },
        { name: "b", type: "boolean" },
        { name: "v", type: "string" },
      ],
    };
    const onInsert = jest.fn();
    const onClose = jest.fn();
    render(
      <VariablePickerPopover
        sources={[triggerWithMix]}
        onInsert={onInsert}
        onClose={onClose}
        latestValuesBySource={{ trigger: { n: 42, b: true, v: null } }}
      />,
    );
    expect(
      screen.getByTestId("variable-output-trigger-n-preview").textContent,
    ).toBe("42");
    expect(
      screen.getByTestId("variable-output-trigger-b-preview").textContent,
    ).toBe("true");
    expect(
      screen.getByTestId("variable-output-trigger-v-preview").textContent,
    ).toBe("null");
  });

  it("renders an 'object' chip for object-shaped values", () => {
    renderPopover({
      latestValuesBySource: {
        trigger: { payload: { message: "hi", subject: "test" } },
      },
    });
    const preview = screen.getByTestId(
      "variable-output-trigger-payload-preview",
    );
    expect(preview).toHaveAttribute("data-preview-kind", "object");
    expect(preview.textContent).toBe("object");
  });

  it("renders an 'array(N)' chip for array values", () => {
    const arrayTrigger: VariableSource = {
      ...triggerSource,
      outputs: [{ name: "items", type: "array" }],
    };
    const onInsert = jest.fn();
    const onClose = jest.fn();
    render(
      <VariablePickerPopover
        sources={[arrayTrigger]}
        onInsert={onInsert}
        onClose={onClose}
        latestValuesBySource={{ trigger: { items: [1, 2, 3] } }}
      />,
    );
    const preview = screen.getByTestId(
      "variable-output-trigger-items-preview",
    );
    expect(preview).toHaveAttribute("data-preview-kind", "array");
    expect(preview.textContent).toBe("array(3)");
  });

  it("nested fields render their own previews against the path", () => {
    renderPopover({
      latestValuesBySource: {
        trigger: { payload: { message: "hello", subject: "test" } },
      },
    });
    expect(
      screen.getByTestId("variable-output-trigger-payload.message-preview")
        .textContent,
    ).toBe('"hello"');
    expect(
      screen.getByTestId("variable-output-trigger-payload.subject-preview")
        .textContent,
    ).toBe('"test"');
  });

  it("clicking an output still inserts the canonical token (NOT the preview value)", async () => {
    const user = userEvent.setup();
    const { onInsert } = renderPopover({
      latestValuesBySource: { trigger: { from: "alice@example.com" } },
    });
    await user.click(screen.getByLabelText("Insert {{trigger.from}}"));
    expect(onInsert).toHaveBeenCalledWith("{{trigger.from}}");
    expect(onInsert).not.toHaveBeenCalledWith("alice@example.com");
  });

  it("circular values do not crash the preview render", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      renderPopover({ latestValuesBySource: { trigger: circular } }),
    ).not.toThrow();
    // The picker resolves to absent for `trigger.from` since the
    // circular root has no `from` key.
    expect(
      screen.queryByTestId("variable-output-trigger-from-preview"),
    ).not.toBeInTheDocument();
  });

  it("absent path (key not present in latest output) renders no preview", () => {
    renderPopover({
      // The latest output has no `from` field, only payload.
      latestValuesBySource: { trigger: { payload: { message: "hi" } } },
    });
    expect(
      screen.queryByTestId("variable-output-trigger-from-preview"),
    ).not.toBeInTheDocument();
    // But the present path still renders.
    expect(
      screen.getByTestId("variable-output-trigger-payload-preview"),
    ).toBeInTheDocument();
  });
});

describe("VariablePickerPopover — sensitive output chip (Slice 3.SEC-7)", () => {
  const sensitiveSource: VariableSource = {
    sourceId: "stripe-node",
    displayName: "Create Customer",
    kind: "action",
    provider: "stripe",
    outputs: [
      { name: "paymentIntentId", type: "string" },
      {
        name: "customerEmail",
        type: "string",
        description: "Customer email address (PII).",
        sensitive: true,
      },
    ],
  };

  it("renders a Sensitive chip on a sensitive output button", () => {
    const onInsert = jest.fn();
    const onClose = jest.fn();
    render(
      <VariablePickerPopover
        sources={[sensitiveSource]}
        onInsert={onInsert}
        onClose={onClose}
      />,
    );
    const chip = screen.getByTestId(
      "variable-output-stripe-node-customerEmail-sensitive-chip",
    );
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent("Sensitive");
  });

  it("does NOT render a Sensitive chip on a non-sensitive output button", () => {
    const onInsert = jest.fn();
    const onClose = jest.fn();
    render(
      <VariablePickerPopover
        sources={[sensitiveSource]}
        onInsert={onInsert}
        onClose={onClose}
      />,
    );
    expect(
      screen.queryByTestId(
        "variable-output-stripe-node-paymentIntentId-sensitive-chip",
      ),
    ).not.toBeInTheDocument();
  });

  it("flags the row with data-sensitive=\"true\" for downstream CSS / queries", () => {
    const onInsert = jest.fn();
    const onClose = jest.fn();
    render(
      <VariablePickerPopover
        sources={[sensitiveSource]}
        onInsert={onInsert}
        onClose={onClose}
      />,
    );
    const row = screen.getByTestId("variable-output-stripe-node-customerEmail");
    expect(row).toHaveAttribute("data-sensitive", "true");
    const nonRow = screen.getByTestId("variable-output-stripe-node-paymentIntentId");
    expect(nonRow).not.toHaveAttribute("data-sensitive");
  });

  it("shows 'Sensitive value hidden' instead of the raw latest-run preview", () => {
    const onInsert = jest.fn();
    const onClose = jest.fn();
    render(
      <VariablePickerPopover
        sources={[sensitiveSource]}
        onInsert={onInsert}
        onClose={onClose}
        latestValuesBySource={{
          "stripe-node": {
            paymentIntentId: "pi_1",
            customerEmail: "alice@example.com",
          },
        }}
      />,
    );
    const preview = screen.getByTestId(
      "variable-output-stripe-node-customerEmail-preview",
    );
    expect(preview).toHaveTextContent("Sensitive value hidden");
    expect(preview).not.toHaveTextContent("alice@example.com");
    expect(preview).toHaveAttribute("data-preview-kind", "sensitive");
  });

  it("keeps the variable token insertable (clicking still fires onInsert)", async () => {
    const user = userEvent.setup();
    const onInsert = jest.fn<void, [string]>();
    const onClose = jest.fn<void, []>();
    render(
      <VariablePickerPopover
        sources={[sensitiveSource]}
        onInsert={onInsert}
        onClose={onClose}
      />,
    );
    const btn = screen.getByLabelText(
      "Insert {{stripe-node.customerEmail}} (sensitive value — preview is masked)",
    );
    await user.click(btn);
    expect(onInsert).toHaveBeenCalledWith("{{stripe-node.customerEmail}}");
  });

  it("non-sensitive outputs still show their latest-run preview unchanged", () => {
    const onInsert = jest.fn();
    const onClose = jest.fn();
    render(
      <VariablePickerPopover
        sources={[sensitiveSource]}
        onInsert={onInsert}
        onClose={onClose}
        latestValuesBySource={{
          "stripe-node": {
            paymentIntentId: "pi_1",
            customerEmail: "alice@example.com",
          },
        }}
      />,
    );
    const preview = screen.getByTestId(
      "variable-output-stripe-node-paymentIntentId-preview",
    );
    expect(preview).toHaveTextContent('"pi_1"');
    expect(preview).toHaveAttribute("data-preview-kind", "scalar");
  });

  // ─── Slice 3.POSTSEC-2 — array/object sensitive output coverage ────────
  //
  // The SEC-7 tests above cover a sensitive STRING output (customerEmail).
  // POSTSEC-2 added sensitive flags on ARRAY (gmail:search_emails.messages)
  // and OBJECT (stripe:find_payment_intent.paymentIntent) outputs. This
  // exercises one of each through the picker to confirm the chip + masked-
  // preview behavior works for non-scalar shapes too (the array/object
  // values are also masked, not just leaf strings).
  it("POSTSEC-2: sensitive ARRAY output (gmail:search_emails.messages) shows chip + masked preview", () => {
    const onInsert = jest.fn();
    const onClose = jest.fn();
    const arraySource: VariableSource = {
      sourceId: "gmail-node",
      displayName: "Search Emails",
      kind: "action",
      provider: "gmail",
      outputs: [
        { name: "count", type: "number" },
        {
          name: "messages",
          type: "array",
          description: "Per-row email projections (sensitive).",
          sensitive: true,
        },
      ],
    };
    render(
      <VariablePickerPopover
        sources={[arraySource]}
        onInsert={onInsert}
        onClose={onClose}
        latestValuesBySource={{
          "gmail-node": {
            count: 2,
            messages: [
              { subject: "Invoice #1", from: "alice@example.com" },
              { subject: "Invoice #2", from: "bob@example.com" },
            ],
          },
        }}
      />,
    );
    expect(
      screen.getByTestId("variable-output-gmail-node-messages-sensitive-chip"),
    ).toBeInTheDocument();
    const preview = screen.getByTestId(
      "variable-output-gmail-node-messages-preview",
    );
    expect(preview).toHaveTextContent("Sensitive value hidden");
    // Sanity — the raw email addresses do NOT leak into the picker preview.
    expect(preview).not.toHaveTextContent("alice@example.com");
    expect(preview).not.toHaveTextContent("bob@example.com");
    // Non-sensitive `count` sibling stays visible.
    const countPreview = screen.getByTestId(
      "variable-output-gmail-node-count-preview",
    );
    expect(countPreview).toHaveTextContent("2");
  });

  it("POSTSEC-2: sensitive OBJECT output (stripe:find_payment_intent.paymentIntent) shows chip + masked preview", () => {
    const onInsert = jest.fn();
    const onClose = jest.fn();
    const objectSource: VariableSource = {
      sourceId: "find-pi-node",
      displayName: "Find Payment Intent",
      kind: "action",
      provider: "stripe",
      outputs: [
        { name: "found", type: "boolean" },
        {
          name: "paymentIntent",
          type: "object",
          description: "PaymentIntent projection — receiptEmail + metadata.",
          sensitive: true,
        },
      ],
    };
    render(
      <VariablePickerPopover
        sources={[objectSource]}
        onInsert={onInsert}
        onClose={onClose}
        latestValuesBySource={{
          "find-pi-node": {
            found: true,
            paymentIntent: {
              paymentIntentId: "pi_1",
              receiptEmail: "alice@example.com",
              metadata: { order_id: "ord_42" },
            },
          },
        }}
      />,
    );
    expect(
      screen.getByTestId(
        "variable-output-find-pi-node-paymentIntent-sensitive-chip",
      ),
    ).toBeInTheDocument();
    const preview = screen.getByTestId(
      "variable-output-find-pi-node-paymentIntent-preview",
    );
    expect(preview).toHaveTextContent("Sensitive value hidden");
    expect(preview).not.toHaveTextContent("alice@example.com");
    expect(preview).not.toHaveTextContent("pi_1");
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
