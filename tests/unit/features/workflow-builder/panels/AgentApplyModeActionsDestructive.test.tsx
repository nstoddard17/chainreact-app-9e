/**
 * DOC-FINAL-ACCEPTANCE-1 — right-drawer apply-mode destructive parity.
 *
 * When the shared destructive classification says the proposal is destructive,
 * choosing an APPLYING mode (apply to draft / apply and test) routes through the
 * SAME shared confirmation the center Document preview uses — never a one-click
 * apply. Cancel applies nothing; Confirm calls onSelectMode with the chosen mode.
 * "Keep as preview" and Discard never confirm. Without the destructive prop the
 * component behaves exactly as before.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { AgentApplyModeActions } from "@/features/workflow-builder/panels/AgentApplyModeActions";
import type { AgentApplyModeAvailability } from "@/core/workflows/agentApplyModes";

const modes: AgentApplyModeAvailability[] = [
  { mode: "apply_to_draft", enabled: true, label: "Apply to draft", description: "" },
  { mode: "apply_and_test", enabled: true, label: "Apply and test", description: "" },
  { mode: "preview_only", enabled: true, label: "Keep as preview", description: "" },
];

const destructive = {
  isDestructive: true as const,
  removedStepCount: 1,
  removedConnectionCount: 0,
  removedStepTitles: ["Send Channel Message"],
};

describe("AgentApplyModeActions — destructive parity", () => {
  it("a destructive apply-to-draft opens the shared confirmation, not an immediate apply", () => {
    const onSelectMode = jest.fn();
    render(
      <AgentApplyModeActions
        modes={modes}
        onSelectMode={onSelectMode}
        onDiscard={() => {}}
        destructive={destructive}
      />,
    );
    fireEvent.click(screen.getByTestId("agent-apply-mode-apply_to_draft"));
    expect(onSelectMode).not.toHaveBeenCalled();
    const confirm = screen.getByTestId("agent-apply-mode-destructive-confirm");
    expect(confirm).toHaveAttribute("role", "alertdialog");
    expect(confirm).toHaveAccessibleName("Apply destructive change?");
  });

  it("Cancel applies nothing; Confirm calls onSelectMode with the chosen mode", () => {
    const onSelectMode = jest.fn();
    render(
      <AgentApplyModeActions
        modes={modes}
        onSelectMode={onSelectMode}
        onDiscard={() => {}}
        destructive={destructive}
      />,
    );
    fireEvent.click(screen.getByTestId("agent-apply-mode-apply_and_test"));
    fireEvent.click(screen.getByTestId("agent-apply-mode-destructive-cancel"));
    expect(onSelectMode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("agent-apply-mode-apply_and_test"));
    fireEvent.click(screen.getByTestId("agent-apply-mode-destructive-accept"));
    expect(onSelectMode).toHaveBeenCalledWith("apply_and_test");
    expect(onSelectMode).toHaveBeenCalledTimes(1);
  });

  it("'Keep as preview' never triggers the destructive confirm", () => {
    const onSelectMode = jest.fn();
    render(
      <AgentApplyModeActions
        modes={modes}
        onSelectMode={onSelectMode}
        onDiscard={() => {}}
        destructive={destructive}
      />,
    );
    fireEvent.click(screen.getByTestId("agent-apply-mode-preview_only"));
    expect(onSelectMode).toHaveBeenCalledWith("preview_only");
    expect(screen.queryByTestId("agent-apply-mode-destructive-confirm")).toBeNull();
  });

  it("without the destructive prop, apply-to-draft applies in one click (unchanged behavior)", () => {
    const onSelectMode = jest.fn();
    render(
      <AgentApplyModeActions modes={modes} onSelectMode={onSelectMode} onDiscard={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("agent-apply-mode-apply_to_draft"));
    expect(onSelectMode).toHaveBeenCalledWith("apply_to_draft");
    expect(screen.queryByTestId("agent-apply-mode-destructive-confirm")).toBeNull();
  });
});
