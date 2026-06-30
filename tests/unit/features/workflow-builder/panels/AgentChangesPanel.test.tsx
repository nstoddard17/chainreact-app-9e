/**
 * AGENT-CHANGE-HISTORY-1 — AgentChangesPanel (the "Agent changes" activity timeline).
 *
 * Business rules under test:
 *   - Renders recent items with status, prompt, and the value-free counts line.
 *   - Empty state reads "No agent changes yet."
 *   - Restore is offered ONLY for items linked to a checkpoint, and goes through
 *     the `onRestore` prop (wired to the hook → typed client API in the builder) —
 *     the panel imports no service/repository and reaches no checkpoint directly.
 *   - "View details" reveals the summary + (for failures) the user-safe reason.
 */

import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentChangesPanel } from "@/features/workflow-builder/panels/AgentChangesPanel";
import type { AgentChangeHistoryItem } from "@/contracts/agentChangeHistory";

function item(overrides: Partial<AgentChangeHistoryItem> = {}): AgentChangeHistoryItem {
  return {
    id: "row-1",
    agentChangeId: "11111111-1111-4111-8111-111111111111",
    workflowId: "wf-1",
    source: "react_agent",
    status: "preview_applied",
    prompt: "change slack message to gmail send email",
    title: "1 node added, 1 node removed",
    summary: "Removed Slack Send Channel Message; Added Gmail Send Email.",
    changedNodeCount: 0,
    addedNodeCount: 1,
    removedNodeCount: 1,
    changedConfigCount: 0,
    setupIssueCount: 1,
    previewPatchRef: null,
    checkpointId: "cp-1",
    runId: null,
    failureReason: null,
    diff: null,
    aiCostEventId: null,
    createdByUserId: "user-1",
    createdAt: "2026-07-16T01:00:00Z",
    updatedAt: "2026-07-16T01:00:00Z",
    ...overrides,
  };
}

function renderPanel(overrides: Partial<ComponentProps<typeof AgentChangesPanel>> = {}) {
  const onRestore = jest.fn();
  const onViewDiff = jest.fn();
  render(
    <AgentChangesPanel
      items={[item()]}
      loading={false}
      error={null}
      restoringCheckpointId={null}
      restoreError={null}
      onRestore={onRestore}
      onViewDiff={onViewDiff}
      {...overrides}
    />,
  );
  return { onRestore, onViewDiff };
}

describe("AgentChangesPanel", () => {
  it("renders the items with status, prompt and the value-free counts line", () => {
    renderPanel();
    expect(screen.getByTestId("builder-agent-changes-panel")).toBeInTheDocument();
    expect(screen.getByText("Agent changes")).toBeInTheDocument();
    const row = screen.getByTestId("builder-agent-change");
    expect(within(row).getByTestId("builder-agent-change-status")).toHaveTextContent("Applied");
    expect(within(row).getByText(/change slack message to gmail/)).toBeInTheDocument();
    expect(within(row).getByTestId("builder-agent-change-counts")).toHaveTextContent(
      "1 added · 1 removed · 1 setup issue",
    );
  });

  it("shows the empty state when there are no items", () => {
    renderPanel({ items: [] });
    expect(screen.getByTestId("builder-agent-changes-empty")).toHaveTextContent(
      "No agent changes yet.",
    );
  });

  it("offers Restore only for a checkpoint-linked item and calls onRestore with the checkpoint id", async () => {
    const user = userEvent.setup();
    const { onRestore } = renderPanel();
    await user.click(screen.getByTestId("builder-agent-change-restore"));
    expect(onRestore).toHaveBeenCalledWith("cp-1");
  });

  it("hides Restore for an item with no linked checkpoint", () => {
    renderPanel({ items: [item({ status: "preview_discarded", checkpointId: null })] });
    expect(screen.queryByTestId("builder-agent-change-restore")).not.toBeInTheDocument();
  });

  it("offers 'View diff' only for an item with a stored diff and calls onViewDiff with it", async () => {
    const user = userEvent.setup();
    const withDiff = item({ diff: { nodes: [] } });
    const { onViewDiff } = renderPanel({ items: [withDiff] });
    await user.click(screen.getByTestId("builder-agent-change-view-diff"));
    expect(onViewDiff).toHaveBeenCalledWith(withDiff);
  });

  it("hides 'View diff' for an item with no stored diff", () => {
    renderPanel({ items: [item({ diff: null })] });
    expect(screen.queryByTestId("builder-agent-change-view-diff")).not.toBeInTheDocument();
  });

  it("reveals the failure reason for a failed apply via View details", async () => {
    const user = userEvent.setup();
    renderPanel({
      items: [
        item({
          status: "apply_failed",
          checkpointId: null,
          failureReason: "ChainReact could not safely apply this preview.",
        }),
      ],
    });
    expect(screen.getByTestId("builder-agent-change-status")).toHaveTextContent("Failed");
    await user.click(screen.getByTestId("builder-agent-change-details"));
    expect(screen.getByTestId("builder-agent-change-failure")).toHaveTextContent(
      "ChainReact could not safely apply this preview.",
    );
  });
});
