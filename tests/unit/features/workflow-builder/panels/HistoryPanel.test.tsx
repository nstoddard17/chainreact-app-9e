/**
 * AGENT-CHANGE-HISTORY-1 — HistoryPanel (the "History" top-tab body).
 *
 * Business rules under test:
 *   - Renders recent items with status, prompt, and the value-free counts line.
 *   - Empty state reads "No agent changes yet."
 *   - "View diff" is offered ONLY for items that captured a diff, and calls onViewDiff.
 *   - Restore is a POPOVER (not an inline card): clicking Restore opens a confirm, and
 *     confirming calls onRestore with the linked checkpoint id. Offered only for
 *     checkpoint-linked items.
 *   - "View details" reveals the summary + (for failures) the user-safe reason.
 */

import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryPanel } from "@/features/workflow-builder/panels/HistoryPanel";
import type { AgentChangeHistoryItem } from "@/contracts/agentChangeHistory";

// Cast-based fixture: the agent_change_history DTO is evolving in a parallel slice;
// the panel only reads the stable display fields, so we build the subset it uses.
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
  } as AgentChangeHistoryItem;
}

function renderPanel(overrides: Partial<ComponentProps<typeof HistoryPanel>> = {}) {
  const onRestore = jest.fn();
  const onViewDiff = jest.fn();
  render(
    <HistoryPanel
      items={[item()]}
      loading={false}
      error={null}
      isDirty={false}
      restoringCheckpointId={null}
      restoreError={null}
      onRestore={onRestore}
      onViewDiff={onViewDiff}
      {...overrides}
    />,
  );
  return { onRestore, onViewDiff };
}

describe("HistoryPanel", () => {
  it("renders items with status, prompt, and the value-free counts line", () => {
    renderPanel();
    expect(screen.getByTestId("builder-history-panel")).toBeInTheDocument();
    const row = screen.getByTestId("builder-history-item");
    expect(within(row).getByTestId("builder-history-item-status")).toHaveTextContent("Applied");
    expect(within(row).getByText(/change slack message to gmail/)).toBeInTheDocument();
    expect(within(row).getByTestId("builder-history-item-counts")).toHaveTextContent(
      "1 added · 1 removed · 1 setup issue",
    );
  });

  it("shows the empty state when there are no items", () => {
    renderPanel({ items: [] });
    expect(screen.getByTestId("builder-history-empty")).toHaveTextContent("No agent changes yet.");
  });

  it("offers 'View diff' only for an item with a stored diff and calls onViewDiff", async () => {
    const user = userEvent.setup();
    const withDiff = item({ diff: { nodes: [] } });
    const { onViewDiff } = renderPanel({ items: [withDiff] });
    await user.click(screen.getByTestId("builder-history-item-view-diff"));
    expect(onViewDiff).toHaveBeenCalledWith(withDiff);
  });

  it("hides 'View diff' for an item with no stored diff", () => {
    renderPanel({ items: [item({ diff: null })] });
    expect(screen.queryByTestId("builder-history-item-view-diff")).not.toBeInTheDocument();
  });

  it("restores via a POPOVER confirmation (not an inline card) and calls onRestore with the checkpoint id", async () => {
    const user = userEvent.setup();
    const { onRestore } = renderPanel({ isDirty: true });
    // The Restore trigger opens a popover; nothing restores until confirmed.
    await user.click(screen.getByTestId("history-restore-trigger"));
    expect(onRestore).not.toHaveBeenCalled();
    // The popover warns that unsaved changes will be discarded.
    expect(screen.getByText(/unsaved changes will be discarded/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("history-restore-confirm"));
    expect(onRestore).toHaveBeenCalledWith("cp-1");
  });

  it("hides Restore for an item with no linked checkpoint", () => {
    renderPanel({ items: [item({ status: "preview_discarded", checkpointId: null })] });
    expect(screen.queryByTestId("history-restore-trigger")).not.toBeInTheDocument();
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
    expect(screen.getByTestId("builder-history-item-status")).toHaveTextContent("Failed");
    await user.click(screen.getByTestId("builder-history-item-details"));
    expect(screen.getByTestId("builder-history-item-failure")).toHaveTextContent(
      "ChainReact could not safely apply this preview.",
    );
  });
});
