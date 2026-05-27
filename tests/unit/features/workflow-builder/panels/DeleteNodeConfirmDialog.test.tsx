/**
 * Tests for features/workflow-builder/panels/DeleteNodeConfirmDialog
 *
 * Presentational dialog. Two modes:
 *   - preview.ok === true  → Cancel + Delete buttons.
 *   - preview.ok === false → single Close button (blocked path).
 *
 * Covered:
 *   - role / aria / labelled-by
 *   - title varies by kind + ok-state
 *   - body copy reflects rewire vs drop-only vs blocked
 *   - Cancel + Confirm + Close button wiring
 *   - Escape closes via onCancel
 *   - initial focus moves to Confirm (ok) or Close (blocked)
 *   - busy flag disables Confirm + Cancel
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteNodeConfirmDialog } from "@/features/workflow-builder/panels/DeleteNodeConfirmDialog";
import type { WorkflowNode } from "@/contracts/workflow";
import type { DeleteNodeFromGraphResult } from "@/features/workflow-builder/utils/deleteNodeFromGraph";

const triggerNode: WorkflowNode = {
  id: "trig",
  kind: "trigger",
  provider: "slack",
  type: "slack.message",
  config: {},
  position: { x: 0, y: 0 },
};

const actionNode: WorkflowNode = {
  id: "act",
  kind: "action",
  provider: "native",
  type: "noop",
  config: {},
  position: { x: 0, y: 100 },
};

const okWithRewire: DeleteNodeFromGraphResult = {
  ok: true,
  nodes: [],
  edges: [],
  deletedNode: actionNode,
  removedEdgeIds: ["e1", "e2"],
  rewiredEdgeId: "new-edge",
  warning: null,
};

const okStandalone: DeleteNodeFromGraphResult = {
  ok: true,
  nodes: [],
  edges: [],
  deletedNode: actionNode,
  removedEdgeIds: [],
  rewiredEdgeId: null,
  warning: null,
};

const okDropOnly: DeleteNodeFromGraphResult = {
  ok: true,
  nodes: [],
  edges: [],
  deletedNode: actionNode,
  removedEdgeIds: ["e1"],
  rewiredEdgeId: null,
  warning: null,
};

const okWithDuplicateWarning: DeleteNodeFromGraphResult = {
  ok: true,
  nodes: [],
  edges: [],
  deletedNode: actionNode,
  removedEdgeIds: ["e1", "e2"],
  rewiredEdgeId: null,
  warning: "rewire_would_duplicate",
};

const blocked: DeleteNodeFromGraphResult = {
  ok: false,
  reason: "cannot_rewire_multi_edge",
  message: "Multiple paths — disconnect manually.",
};

describe("DeleteNodeConfirmDialog — chrome + a11y", () => {
  it("renders the testid + dialog role + aria-modal + labelled-by + describedby", () => {
    render(
      <DeleteNodeConfirmDialog
        node={actionNode}
        preview={okWithRewire}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const dlg = screen.getByTestId("delete-node-confirm-dialog");
    expect(dlg).toBeInTheDocument();
    expect(dlg.getAttribute("role")).toBe("dialog");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.getAttribute("aria-labelledby")).toBe("delete-node-confirm-title");
    expect(dlg.getAttribute("aria-describedby")).toBe("delete-node-confirm-body");
  });

  it("Escape calls onCancel", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(
      <DeleteNodeConfirmDialog
        node={actionNode}
        preview={okWithRewire}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    // userEvent dispatches keydown on the active element which bubbles
    // to the dialog div. The dialog's onKeyDown handler fires.
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("DeleteNodeConfirmDialog — allowed (ok) path", () => {
  it("trigger node uses 'Delete trigger?' title + 'Delete trigger' confirm copy", () => {
    render(
      <DeleteNodeConfirmDialog
        node={triggerNode}
        preview={okDropOnly}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /delete trigger\?/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("delete-node-confirm-confirm"),
    ).toHaveTextContent(/delete trigger/i);
    expect(
      screen.getByTestId("delete-node-confirm-body"),
    ).toHaveTextContent(/your workflow will have no trigger/i);
  });

  it("action with rewire shows the rewire-aware copy", () => {
    render(
      <DeleteNodeConfirmDialog
        node={actionNode}
        preview={okWithRewire}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /delete action\?/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("delete-node-confirm-body"),
    ).toHaveTextContent(/new edge will be created to keep the chain connected/i);
  });

  it("standalone action shows the 'no connected edges' copy", () => {
    render(
      <DeleteNodeConfirmDialog
        node={actionNode}
        preview={okStandalone}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByTestId("delete-node-confirm-body"),
    ).toHaveTextContent(/no connected edges/i);
  });

  it("rewire_would_duplicate warning surfaces a hint line", () => {
    render(
      <DeleteNodeConfirmDialog
        node={actionNode}
        preview={okWithDuplicateWarning}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByTestId("delete-node-confirm-body"),
    ).toHaveTextContent(/direct connection.*already exists/i);
  });

  it("Cancel calls onCancel; Confirm calls onConfirm", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(
      <DeleteNodeConfirmDialog
        node={actionNode}
        preview={okWithRewire}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByTestId("delete-node-confirm-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId("delete-node-confirm-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("focuses the Confirm button on mount when allowed", () => {
    render(
      <DeleteNodeConfirmDialog
        node={actionNode}
        preview={okWithRewire}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(document.activeElement).toBe(
      screen.getByTestId("delete-node-confirm-confirm"),
    );
  });

  it("busy disables both Cancel and Confirm and renames Confirm to 'Deleting…'", () => {
    render(
      <DeleteNodeConfirmDialog
        node={actionNode}
        preview={okWithRewire}
        onConfirm={() => {}}
        onCancel={() => {}}
        busy
      />,
    );
    expect(screen.getByTestId("delete-node-confirm-cancel")).toBeDisabled();
    const confirm = screen.getByTestId("delete-node-confirm-confirm");
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveTextContent(/deleting…/i);
  });
});

describe("DeleteNodeConfirmDialog — blocked path", () => {
  it("renders the blocked title + multi-edge-specific copy + single Close button", () => {
    render(
      <DeleteNodeConfirmDialog
        node={actionNode}
        preview={blocked}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /can't delete this node yet/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("delete-node-confirm-body"),
    ).toHaveTextContent(/remove the extra edges manually/i);
    expect(screen.getByTestId("delete-node-confirm-close")).toBeInTheDocument();
    expect(
      screen.queryByTestId("delete-node-confirm-confirm"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("delete-node-confirm-cancel"),
    ).not.toBeInTheDocument();
  });

  it("Close button calls onCancel (parent treats Close == dismiss)", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(
      <DeleteNodeConfirmDialog
        node={actionNode}
        preview={blocked}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByTestId("delete-node-confirm-close"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("focuses the Close button on mount when blocked", () => {
    render(
      <DeleteNodeConfirmDialog
        node={actionNode}
        preview={blocked}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(document.activeElement).toBe(
      screen.getByTestId("delete-node-confirm-close"),
    );
  });
});
