/**
 * CHECKPOINTS-1 — CheckpointsPanel (the "Recent checkpoints / Before agent changes" rail surface).
 *
 * Business rules under test:
 *   - Renders the recent checkpoints (name, prompt, summary) under non-"history" copy.
 *   - Restore goes through the `onRestore` prop (wired to the hook → typed client API in the
 *     builder) — the panel never imports a service/repository.
 *   - Restoring requires confirmation; with unsaved changes the confirmation warns they will be
 *     discarded, and Cancel restores nothing.
 *   - A restore error is surfaced with a useful message.
 */

import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckpointsPanel } from "@/features/workflow-builder/panels/CheckpointsPanel";
import type { WorkflowCheckpoint } from "@/contracts/workflowCheckpoint";

const CP: WorkflowCheckpoint = {
  id: "cp-1",
  workflowId: "wf-1",
  source: "react_agent",
  name: "Before React Agent change",
  prompt: "change slack message to gmail send email",
  summary: "Removed Slack Send Channel Message; Added Gmail Send Email.",
  createdByUserId: "user-1",
  createdAt: "2026-07-15T01:00:00Z",
};

function renderPanel(overrides: Partial<ComponentProps<typeof CheckpointsPanel>> = {}) {
  const onRestore = jest.fn();
  render(
    <CheckpointsPanel
      checkpoints={[CP]}
      loading={false}
      error={null}
      isDirty={false}
      restoringId={null}
      restoreError={null}
      onRestore={onRestore}
      {...overrides}
    />,
  );
  return { onRestore };
}

describe("CheckpointsPanel", () => {
  it("renders recent checkpoints with prompt + summary under non-'history' copy", () => {
    renderPanel();
    expect(screen.getByTestId("builder-checkpoints-panel")).toBeInTheDocument();
    expect(screen.getByText("Recent checkpoints")).toBeInTheDocument();
    expect(screen.getByText("Before agent changes")).toBeInTheDocument();
    // It must NOT call itself "history" (avoid confusion with published version history).
    expect(screen.queryByText(/history/i)).not.toBeInTheDocument();
    const row = screen.getByTestId("builder-checkpoint");
    expect(within(row).getByText("Before React Agent change")).toBeInTheDocument();
    expect(within(row).getByText(/change slack message to gmail send email/)).toBeInTheDocument();
    expect(within(row).getByText(/Removed Slack Send Channel Message/)).toBeInTheDocument();
  });

  it("shows the empty-state guidance when there are no checkpoints", () => {
    renderPanel({ checkpoints: [] });
    expect(screen.getByTestId("builder-checkpoints-empty")).toHaveTextContent(/before each React Agent change/i);
  });

  it("restores through the onRestore prop (not a service/repo) after explicit confirmation", async () => {
    const user = userEvent.setup();
    const { onRestore } = renderPanel();
    await user.click(screen.getByTestId("builder-checkpoint-restore"));
    // A confirm step appears before anything is restored.
    expect(onRestore).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("builder-checkpoint-restore-confirm"));
    expect(onRestore).toHaveBeenCalledWith("cp-1");
  });

  it("warns that unsaved changes will be discarded and restores nothing on Cancel", async () => {
    const user = userEvent.setup();
    const { onRestore } = renderPanel({ isDirty: true });
    await user.click(screen.getByTestId("builder-checkpoint-restore"));
    expect(screen.getByText(/unsaved changes will be discarded/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("builder-checkpoint-restore-cancel"));
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("does not show the discard warning when there are no unsaved changes", async () => {
    const user = userEvent.setup();
    renderPanel({ isDirty: false });
    await user.click(screen.getByTestId("builder-checkpoint-restore"));
    expect(screen.queryByText(/unsaved changes will be discarded/i)).not.toBeInTheDocument();
  });

  it("surfaces a useful restore error message", async () => {
    const user = userEvent.setup();
    renderPanel({ restoreError: "Couldn't restore this checkpoint." });
    // The error renders once the row is in its confirming state.
    await user.click(screen.getByTestId("builder-checkpoint-restore"));
    expect(screen.getByTestId("builder-checkpoint-restore-error")).toHaveTextContent(
      "Couldn't restore this checkpoint.",
    );
  });
});
