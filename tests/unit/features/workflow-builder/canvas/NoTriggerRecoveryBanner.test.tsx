/**
 * Tests for features/workflow-builder/canvas/NoTriggerRecoveryBanner.
 *
 * NoTriggerRecoveryBanner (Slice 4.BUILDER-TRIGGER-RECOVERY-1) is a leaf
 * presentational component. The canvas decides WHEN to render it (when
 * pendingNodes is non-empty but no node is a trigger — see WorkflowCanvas);
 * WorkflowBuilder wires the CTA callback to `openTriggerPicker`. This file
 * targets the leaf in isolation, mirroring EmptyCanvasState.test.tsx.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoTriggerRecoveryBanner } from "@/features/workflow-builder/canvas/NoTriggerRecoveryBanner";

describe("NoTriggerRecoveryBanner", () => {
  it("renders the recovery prompt, supporting copy, and 'Choose trigger' CTA", () => {
    render(<NoTriggerRecoveryBanner />);
    expect(
      screen.getByRole("button", { name: /choose trigger/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/add a trigger/i)).toBeInTheDocument();
    expect(
      screen.getByText(/needs a trigger before it can run/i),
    ).toBeInTheDocument();
    // Reassures the user their actions weren't lost (Case B contract).
    expect(screen.getByText(/your actions are still here/i)).toBeInTheDocument();
  });

  it("invokes onChooseTrigger when the CTA is clicked", async () => {
    const user = userEvent.setup();
    const onChooseTrigger = jest.fn();
    render(<NoTriggerRecoveryBanner onChooseTrigger={onChooseTrigger} />);
    await user.click(screen.getByTestId("recovery-choose-trigger"));
    expect(onChooseTrigger).toHaveBeenCalledTimes(1);
  });

  it("is safe to click without an onChooseTrigger handler (no throw)", async () => {
    const user = userEvent.setup();
    render(<NoTriggerRecoveryBanner />);
    await user.click(screen.getByTestId("recovery-choose-trigger"));
    expect(screen.getByTestId("no-trigger-recovery-banner")).toBeInTheDocument();
  });

  it("exposes a stable testid + status landmark so canvas integration can locate it", () => {
    render(<NoTriggerRecoveryBanner />);
    expect(screen.getByTestId("no-trigger-recovery-banner")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/missing a trigger/i),
    ).toBeInTheDocument();
  });
});
