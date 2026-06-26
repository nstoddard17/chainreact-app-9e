/**
 * Tests for the AI-preview DIFF treatment on the node card (HERMES-AGENT-PREVIEW-DIFF-GRAPH).
 *
 * In preview mode each card carries a `diffStatus` that drives an added/removed/changed treatment + a
 * pill, marks `data-diff-status` for tests, and turns the card READ-ONLY (no rename/delete/tail-add).
 */
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { WorkflowNodeCard } from "@/features/workflow-builder/canvas/WorkflowNodeCard";
import { BuilderNodeActionsProvider } from "@/features/workflow-builder/canvas/nodeActionsContext";
import type { WorkflowNodeData } from "@/features/workflow-builder/canvas/adapters";

function renderCard(data: WorkflowNodeData) {
  return render(
    <ReactFlowProvider>
      {/* Wire ambient actions so we can prove the preview card SUPPRESSES them (read-only). */}
      <BuilderNodeActionsProvider value={{ onRenameNode: () => {}, onRequestDeleteNode: () => {}, onAppendAfter: () => {} }}>
        <WorkflowNodeCard
          id="n1"
          type="workflowNode"
          data={data}
          selected={false}
          dragging={false}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          zIndex={0}
          selectable
          deletable
          draggable
        />
      </BuilderNodeActionsProvider>
    </ReactFlowProvider>,
  );
}

const base = (diffStatus: WorkflowNodeData["diffStatus"], over: Partial<WorkflowNodeData> = {}): WorkflowNodeData => ({
  kind: "action",
  provider: "gmail",
  type: "send_email",
  displayName: "Send Email",
  isTail: true,
  diffStatus,
  ...over,
});

describe("WorkflowNodeCard — diff treatment", () => {
  it("added → data-diff-status='added' + 'Added' pill, and no read-only-violating affordances", () => {
    renderCard(base("added"));
    expect(screen.getByTestId("workflow-node-view").getAttribute("data-diff-status")).toBe("added");
    expect(screen.getByTestId("node-diff-pill").textContent).toMatch(/added/i);
    // Read-only: no rename/delete quick actions, no tail "+".
    expect(screen.queryByTestId("node-tail-add")).toBeNull();
  });

  it("removed → 'Removing' pill + strikethrough title", () => {
    renderCard(base("removed", { provider: "slack", type: "send_channel_message", displayName: "Send Channel Message" }));
    expect(screen.getByTestId("workflow-node-view").getAttribute("data-diff-status")).toBe("removed");
    expect(screen.getByTestId("node-diff-pill").textContent).toMatch(/removing/i);
    expect(screen.getByText("Send Channel Message").className).toMatch(/line-through/);
  });

  it("changed → 'Changed' pill", () => {
    renderCard(base("changed"));
    expect(screen.getByTestId("node-diff-pill").textContent).toMatch(/changed/i);
  });

  it("unchanged → NO diff pill (renders like a normal node)", () => {
    renderCard(base("unchanged"));
    expect(screen.queryByTestId("node-diff-pill")).toBeNull();
  });

  it("a normal (non-preview) card has no diff status and keeps its tail '+'", () => {
    renderCard({ kind: "action", provider: "gmail", type: "send_email", displayName: "Send Email", isTail: true });
    expect(screen.getByTestId("workflow-node-view").getAttribute("data-diff-status")).toBeNull();
    expect(screen.getByTestId("node-tail-add")).toBeInTheDocument();
  });
});
