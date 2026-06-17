/**
 * Tests for the node-card quick actions (Slice 4.BUILDER-NODE-QUICK-ACTIONS-1):
 * direct rename + delete from the canvas node, without opening the config panel.
 *
 * The card consumes rename/delete handlers from BuilderNodeActionsContext; the
 * canvas provides them. We render the card through both providers and exercise
 * the affordances. Restricted behavior (no one-click delete for triggers) and
 * keyboard isolation (typing a name must not trigger canvas shortcuts) are
 * covered here.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { WorkflowNodeCard } from "@/features/workflow-builder/canvas/WorkflowNodeCard";
import {
  BuilderNodeActionsProvider,
  type BuilderNodeActions,
} from "@/features/workflow-builder/canvas/nodeActionsContext";
import type { WorkflowNodeData } from "@/features/workflow-builder/canvas/adapters";

function renderCard({
  data,
  selected = false,
  actions,
}: {
  data: WorkflowNodeData;
  selected?: boolean;
  actions?: BuilderNodeActions;
}) {
  return render(
    <ReactFlowProvider>
      <BuilderNodeActionsProvider value={actions ?? {}}>
        <WorkflowNodeCard
          id="n1"
          type="workflowNode"
          data={data}
          selected={selected}
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

const actionData: WorkflowNodeData = {
  kind: "action",
  provider: "slack",
  type: "send_message",
  displayName: "Send Message",
};
const triggerData: WorkflowNodeData = {
  kind: "trigger",
  provider: "slack",
  type: "message_received",
  displayName: "Message Received",
};

describe("WorkflowNodeCard quick actions — wiring + restrictions", () => {
  it("renders rename + delete for an action node when handlers are wired", () => {
    renderCard({ data: actionData, actions: { onRenameNode: jest.fn(), onRequestDeleteNode: jest.fn() } });
    expect(screen.getByTestId("node-quick-rename")).toBeInTheDocument();
    expect(screen.getByTestId("node-quick-delete")).toBeInTheDocument();
  });

  it("omits one-click delete on a trigger node but still allows rename (restricted start node)", () => {
    renderCard({ data: triggerData, actions: { onRenameNode: jest.fn(), onRequestDeleteNode: jest.fn() } });
    expect(screen.getByTestId("node-quick-rename")).toBeInTheDocument();
    expect(screen.queryByTestId("node-quick-delete")).toBeNull();
  });

  it("renders no quick actions when no handlers are provided (isolated render)", () => {
    renderCard({ data: actionData });
    expect(screen.queryByTestId("node-quick-actions")).toBeNull();
    expect(screen.queryByTestId("node-quick-rename")).toBeNull();
    expect(screen.queryByTestId("node-quick-delete")).toBeNull();
  });

  it("exposes only safe labels — never a raw node id", () => {
    renderCard({ data: actionData, actions: { onRenameNode: jest.fn(), onRequestDeleteNode: jest.fn() } });
    expect(screen.getByTestId("node-quick-rename").getAttribute("aria-label")).toBe("Rename step");
    expect(screen.getByTestId("node-quick-delete").getAttribute("aria-label")).toBe("Delete step");
    expect(document.body.textContent).not.toContain("n1");
  });
});

describe("WorkflowNodeCard quick actions — delete", () => {
  it("clicking delete requests deletion for this node (routes to the confirm flow)", () => {
    const onRequestDeleteNode = jest.fn();
    renderCard({ data: actionData, actions: { onRequestDeleteNode } });
    fireEvent.click(screen.getByTestId("node-quick-delete"));
    expect(onRequestDeleteNode).toHaveBeenCalledWith("n1");
  });
});

describe("WorkflowNodeCard tail add (BUILDER-CANVAS-ERGONOMICS-FIX-1)", () => {
  it("renders the tail '+' on a tail node and appends after THIS node when clicked", () => {
    const onAppendAfter = jest.fn();
    renderCard({ data: { ...actionData, isTail: true }, actions: { onAppendAfter } });
    const add = screen.getByTestId("node-tail-add");
    expect(add).toBeInTheDocument();
    fireEvent.click(add);
    expect(onAppendAfter).toHaveBeenCalledWith("n1");
  });

  it("does NOT render the tail '+' on a non-tail node", () => {
    const onAppendAfter = jest.fn();
    renderCard({ data: { ...actionData, isTail: false }, actions: { onAppendAfter } });
    expect(screen.queryByTestId("node-tail-add")).toBeNull();
  });

  it("does NOT render the tail '+' when no append handler is wired", () => {
    renderCard({ data: { ...actionData, isTail: true } });
    expect(screen.queryByTestId("node-tail-add")).toBeNull();
  });

  it("renders the tail '+' on a trigger that has no next step (append the first action)", () => {
    const onAppendAfter = jest.fn();
    renderCard({ data: { ...triggerData, isTail: true }, actions: { onAppendAfter } });
    fireEvent.click(screen.getByTestId("node-tail-add"));
    expect(onAppendAfter).toHaveBeenCalledWith("n1");
  });

  it("uses a safe label — never a raw node id", () => {
    renderCard({ data: { ...actionData, isTail: true }, actions: { onAppendAfter: jest.fn() } });
    expect(screen.getByTestId("node-tail-add").getAttribute("aria-label")).toBe("Add next step");
    expect(document.body.textContent).not.toContain("n1");
  });
});

describe("WorkflowNodeCard quick actions — inline rename", () => {
  it("edits inline and commits on Enter via onRenameNode(id, value)", () => {
    const onRenameNode = jest.fn();
    renderCard({ data: actionData, actions: { onRenameNode } });
    fireEvent.click(screen.getByTestId("node-quick-rename"));
    const input = screen.getByTestId("node-rename-input");
    fireEvent.change(input, { target: { value: "My step" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRenameNode).toHaveBeenCalledWith("n1", "My step");
    // Editor closes after commit.
    expect(screen.queryByTestId("node-rename-input")).toBeNull();
  });

  it("commits on blur (click away)", () => {
    const onRenameNode = jest.fn();
    renderCard({ data: actionData, actions: { onRenameNode } });
    fireEvent.click(screen.getByTestId("node-quick-rename"));
    const input = screen.getByTestId("node-rename-input");
    fireEvent.change(input, { target: { value: "Blurred name" } });
    fireEvent.blur(input);
    expect(onRenameNode).toHaveBeenCalledWith("n1", "Blurred name");
  });

  it("Escape cancels without renaming", () => {
    const onRenameNode = jest.fn();
    renderCard({ data: actionData, actions: { onRenameNode } });
    fireEvent.click(screen.getByTestId("node-quick-rename"));
    const input = screen.getByTestId("node-rename-input");
    fireEvent.change(input, { target: { value: "discard me" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRenameNode).not.toHaveBeenCalled();
    expect(screen.queryByTestId("node-rename-input")).toBeNull();
  });

  it("seeds the editor empty (placeholder = default) when the node has no custom name", () => {
    const onRenameNode = jest.fn();
    renderCard({ data: actionData, actions: { onRenameNode } });
    fireEvent.click(screen.getByTestId("node-quick-rename"));
    const input = screen.getByTestId("node-rename-input") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.getAttribute("placeholder")).toBe("Send Message");
  });

  it("seeds the editor with the existing custom name", () => {
    const onRenameNode = jest.fn();
    renderCard({
      data: { ...actionData, customName: "Notify the team", displayName: "Notify the team" },
      actions: { onRenameNode },
    });
    fireEvent.click(screen.getByTestId("node-quick-rename"));
    const input = screen.getByTestId("node-rename-input") as HTMLInputElement;
    expect(input.value).toBe("Notify the team");
  });

  it("isolates typing from canvas shortcuts — keydown does not bubble out of the editor", () => {
    const onParentKeyDown = jest.fn();
    render(
      <div onKeyDown={onParentKeyDown}>
        <ReactFlowProvider>
          <BuilderNodeActionsProvider value={{ onRenameNode: jest.fn(), onRequestDeleteNode: jest.fn() }}>
            <WorkflowNodeCard
              id="n1"
              type="workflowNode"
              data={actionData}
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
        </ReactFlowProvider>
      </div>,
    );
    fireEvent.click(screen.getByTestId("node-quick-rename"));
    const input = screen.getByTestId("node-rename-input");
    // A Delete/Backspace keystroke while editing must NOT reach the canvas.
    fireEvent.keyDown(input, { key: "Delete" });
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });
});
