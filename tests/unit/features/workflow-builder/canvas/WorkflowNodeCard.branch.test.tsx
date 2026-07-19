/**
 * WorkflowNodeCard branch handles (BRANCH-ENT-1 C4).
 *
 * Business rule protected: a branching node renders one SOURCE handle per
 * route it can return (stable `branch:<label>` ids) plus an Always cleanup
 * handle — so the route an edge means comes from its handle id, never from
 * where a connector happens to sit visually. Non-branching nodes keep the
 * single default source handle.
 */
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { WorkflowNodeCard } from "@/features/workflow-builder/canvas/WorkflowNodeCard";
import type { WorkflowNodeData } from "@/features/workflow-builder/canvas/adapters";

function renderCard(data: WorkflowNodeData) {
  return render(
    <ReactFlowProvider>
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
    </ReactFlowProvider>,
  );
}

describe("WorkflowNodeCard — branch route handles", () => {
  it("an If/Then node renders True, False and Always source handles with stable route ids", () => {
    const { container } = renderCard({
      kind: "action",
      provider: "native",
      type: "if_then_condition",
      displayName: "If/Then Condition",
      branchHandles: ["true", "false"],
    });
    expect(
      screen.getByLabelText("Outgoing True route source"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Outgoing False route source"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Outgoing edge source (always runs)"),
    ).toBeInTheDocument();
    // Handle ids are the persisted route identity.
    expect(
      container.querySelector('[data-handleid="branch:true"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-handleid="branch:false"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-handleid="branch-always"]'),
    ).not.toBeNull();
    // Captions align with the handle order for at-a-glance routing.
    const captions = screen.getByTestId("branch-handle-captions");
    expect(captions.textContent).toBe("TrueFalseAlways");
  });

  it("a Router node renders one handle per route label verbatim", () => {
    const { container } = renderCard({
      kind: "action",
      provider: "native",
      type: "router",
      displayName: "Router",
      branchHandles: ["vip", "standard", "other"],
    });
    for (const label of ["vip", "standard", "other"]) {
      expect(
        container.querySelector(`[data-handleid="branch:${label}"]`),
      ).not.toBeNull();
    }
  });

  it("non-branching nodes keep the single default source handle (no route handles, no captions)", () => {
    const { container } = renderCard({
      kind: "action",
      provider: "slack",
      type: "send_channel_message",
      displayName: "Send Message",
    });
    expect(screen.getByLabelText("Outgoing edge source")).toBeInTheDocument();
    expect(screen.queryByTestId("branch-handle-captions")).toBeNull();
    expect(container.querySelector('[data-handleid^="branch:"]')).toBeNull();
  });
});
