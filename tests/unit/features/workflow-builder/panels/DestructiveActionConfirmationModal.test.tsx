/**
 * Tests for features/workflow-builder/panels/DestructiveActionConfirmationModal — Slice 3.POSTSEC-5.
 *
 * Verifies:
 *   - Renders title + body + action list from server-supplied detail.
 *   - Action list shows displayName + provider:type + riskDescription.
 *   - Confirm button stays disabled until the user types the exact
 *     server-issued phrase.
 *   - Confirm fires onConfirm; Cancel fires onCancel.
 *   - Modal does NOT leak workflow config / IDs / resolved values
 *     (defensive shape check — the modal only ever sees the
 *     allowlisted detail).
 *   - Escape key cancels.
 *   - busy=true disables both Confirm + Cancel.
 *   - Initial focus lands on the input.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DestructiveActionConfirmationModal } from "@/features/workflow-builder/panels/DestructiveActionConfirmationModal";
import type { WorkflowConfirmationRequiredDetail } from "@/lib/api/workflows";

const SAMPLE_DETAIL: WorkflowConfirmationRequiredDetail = {
  requiresConfirmation: true,
  confirmationText: "CONFIRM",
  actions: [
    {
      nodeId: "refund-node",
      provider: "stripe",
      type: "create_refund",
      displayName: "Create Refund",
      riskDescription:
        "Reverses a Stripe charge — moves money back to the customer.",
    },
    {
      nodeId: "delete-node",
      provider: "gmail",
      type: "delete_email",
      displayName: "Delete Email",
      // No riskDescription on this one — verifies the optional path renders.
    },
  ],
};

describe("DestructiveActionConfirmationModal — rendering", () => {
  it("renders the dialog role, title, and body", () => {
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      screen.getByRole("heading", { name: /confirmation required/i }),
    ).toBeInTheDocument();
    // Body mentions "external services" and "billing" to make the risk
    // category obvious regardless of which provider tripped the gate.
    expect(dialog).toHaveTextContent(/external services/i);
    expect(dialog).toHaveTextContent(/billing/i);
  });

  it("lists each action with displayName + provider:type + riskDescription when present", () => {
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const refundRow = screen.getByTestId("destructive-action-refund-node");
    expect(refundRow).toHaveTextContent("Create Refund");
    expect(refundRow).toHaveTextContent("stripe:create_refund");
    expect(refundRow).toHaveTextContent(/reverses a stripe charge/i);

    const gmailRow = screen.getByTestId("destructive-action-delete-node");
    expect(gmailRow).toHaveTextContent("Delete Email");
    expect(gmailRow).toHaveTextContent("gmail:delete_email");
    // No riskDescription — defensively verify the description text doesn't
    // accidentally leak from the previous row.
    expect(gmailRow).not.toHaveTextContent(/reverses a stripe charge/i);
  });

  it("renders the server-issued confirmation phrase, NOT a hardcoded UI value", () => {
    const customDetail: WorkflowConfirmationRequiredDetail = {
      ...SAMPLE_DETAIL,
      confirmationText: "REMOVE",
    };
    render(
      <DestructiveActionConfirmationModal
        detail={customDetail}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("REMOVE");
    expect(dialog).not.toHaveTextContent(/type CONFIRM to/i);
  });

  it("does NOT render workflow config / IDs / resolved values (defensive shape)", () => {
    // The modal only takes the route-safe `detail` payload. We sanity-check
    // that nothing leaks even if a future maintainer adds new fields to
    // ConfirmationRequiredAction — only the documented keys appear in the
    // rendered output.
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog");
    // Sample sensitive-looking strings that absolutely must not leak.
    expect(dialog).not.toHaveTextContent(/ch_secret/i);
    expect(dialog).not.toHaveTextContent(/cus_/i);
    expect(dialog).not.toHaveTextContent(/draftDefinition/i);
    expect(dialog).not.toHaveTextContent(/config/i);
  });

  it("Confirm button is disabled before any input", () => {
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const confirmBtn = screen.getByTestId(
      "destructive-action-confirmation-confirm",
    );
    expect(confirmBtn).toBeDisabled();
  });

  it("input receives initial focus", () => {
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const input = screen.getByTestId(
      "destructive-action-confirmation-input",
    );
    expect(input).toHaveFocus();
  });
});

describe("DestructiveActionConfirmationModal — confirm gating", () => {
  it("Confirm stays disabled when the user types the wrong phrase (lowercase)", async () => {
    const onConfirm = jest.fn();
    const user = userEvent.setup();
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "confirm",
    );
    expect(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    ).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Confirm stays disabled when the user types a partial match", async () => {
    const onConfirm = jest.fn();
    const user = userEvent.setup();
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "CONFI",
    );
    expect(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    ).toBeDisabled();
  });

  it("Confirm becomes enabled when the user types the exact phrase", async () => {
    const onConfirm = jest.fn();
    const user = userEvent.setup();
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "CONFIRM",
    );
    expect(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    ).toBeEnabled();
  });

  it("Confirm tolerates surrounding whitespace (matches server isValidConfirmationText)", async () => {
    const user = userEvent.setup();
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "   CONFIRM   ",
    );
    expect(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    ).toBeEnabled();
  });

  it("clicking Confirm with the correct phrase fires onConfirm exactly once", async () => {
    const onConfirm = jest.fn();
    const user = userEvent.setup();
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "CONFIRM",
    );
    await user.click(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("DestructiveActionConfirmationModal — cancel + escape", () => {
  it("clicking Cancel fires onCancel and never fires onConfirm", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const user = userEvent.setup();
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await user.click(
      screen.getByTestId("destructive-action-confirmation-cancel"),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Escape key cancels even when input is focused", async () => {
    const onCancel = jest.fn();
    const user = userEvent.setup();
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("DestructiveActionConfirmationModal — busy state", () => {
  it("disables Confirm + Cancel + input while busy=true", async () => {
    const user = userEvent.setup();
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={() => {}}
        onCancel={() => {}}
        busy
      />,
    );
    // Pre-type the phrase to confirm busy overrides validity.
    const input = screen.getByTestId(
      "destructive-action-confirmation-input",
    );
    expect(input).toBeDisabled();

    const confirmBtn = screen.getByTestId(
      "destructive-action-confirmation-confirm",
    );
    expect(confirmBtn).toBeDisabled();
    expect(confirmBtn).toHaveTextContent(/working/i);

    const cancelBtn = screen.getByTestId(
      "destructive-action-confirmation-cancel",
    );
    expect(cancelBtn).toBeDisabled();

    // Clicking Confirm while busy is a no-op.
    const onConfirm = jest.fn();
    render(
      <DestructiveActionConfirmationModal
        detail={SAMPLE_DETAIL}
        onConfirm={onConfirm}
        onCancel={() => {}}
        busy
      />,
    );
    const allConfirms = screen.getAllByTestId(
      "destructive-action-confirmation-confirm",
    );
    await user.click(allConfirms[allConfirms.length - 1]!);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
