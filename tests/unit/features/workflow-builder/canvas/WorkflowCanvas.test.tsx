/**
 * Tests for features/workflow-builder/canvas/WorkflowCanvas.
 *
 * Asserts the canvas's dispatch contract: ReactFlow user actions
 * route through to graphSlice / configSlice, never to backend
 * persistence. We render the real canvas (with our jsdom polyfills)
 * and exercise it through React Flow's emitted nodes / edges, then
 * verify the slice mutations.
 *
 * Rendering details are deliberately NOT asserted (those depend on
 * React Flow internals + ResizeObserver size). The contract that
 * matters is: clicking → openNode, drag-end → updateNodePosition,
 * connect → connectNodes, delete → removeNode / removeEdge.
 */

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

import { render, screen, fireEvent, within } from "@testing-library/react";
import { WorkflowCanvas } from "@/features/workflow-builder/canvas/WorkflowCanvas";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { WorkflowDefinition } from "@/contracts/workflow";

const baseDef: WorkflowDefinition = {
  nodes: [
    {
      id: "trig",
      kind: "trigger",
      provider: "slack",
      type: "message_received",
      config: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "act",
      kind: "action",
      provider: "github",
      type: "add_comment",
      config: { repository: "octocat/x" },
      position: { x: 0, y: 200 },
    },
  ],
  edges: [{ id: "e1", from: "trig", to: "act" }],
};

const providerLabels = { slack: "Slack", github: "GitHub" };

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", baseDef);
});

describe("WorkflowCanvas — render", () => {
  it("renders the canvas region with the workflow's pending nodes", () => {
    render(<WorkflowCanvas providerLabels={providerLabels} />);
    const canvas = screen.getByTestId("workflow-canvas");
    expect(canvas).toBeInTheDocument();
    // Custom node views appear one per pending node.
    const views = within(canvas).getAllByTestId("workflow-node-view");
    expect(views).toHaveLength(2);
    // Provider labels surface in the node body (Slack / GitHub).
    expect(within(canvas).getByText("Slack")).toBeInTheDocument();
    expect(within(canvas).getByText("GitHub")).toBeInTheDocument();
  });

  it("falls back to the raw provider id when no label map entry exists", () => {
    render(<WorkflowCanvas />); // no providerLabels prop
    const canvas = screen.getByTestId("workflow-canvas");
    expect(within(canvas).getByText("slack")).toBeInTheDocument();
    expect(within(canvas).getByText("github")).toBeInTheDocument();
  });

  it("renders nothing inside the canvas when there are no pending nodes", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    render(<WorkflowCanvas providerLabels={providerLabels} />);
    expect(
      screen.queryAllByTestId("workflow-node-view"),
    ).toHaveLength(0);
  });

  it("highlights the active node when configSlice.activeNodeId is set (list ↔ canvas sync)", () => {
    useConfigSlice
      .getState()
      .openNode({ nodeId: "act", initialValues: {} });
    render(<WorkflowCanvas providerLabels={providerLabels} />);
    // Selection on the node view is surfaced via `data-selected="true"`.
    const views = screen.getAllByTestId("workflow-node-view");
    const active = views.find(
      (v) => v.getAttribute("data-selected") === "true",
    );
    expect(active).toBeDefined();
    expect(active!.textContent).toMatch(/GitHub/);
  });
});

describe("WorkflowCanvas — node click dispatches configSlice.openNode", () => {
  it("opens the matching configSlice draft when a node is clicked", () => {
    render(<WorkflowCanvas providerLabels={providerLabels} />);
    const views = screen.getAllByTestId("workflow-node-view");
    const githubNodeView = views.find((v) =>
      v.textContent?.includes("GitHub"),
    )!;
    // React Flow attaches its click handler to the wrapping `.react-flow__node`
    // element rather than our custom view, so fire on the closest parent.
    const flowNode = githubNodeView.closest(".react-flow__node");
    expect(flowNode).not.toBeNull();
    fireEvent.click(flowNode!);
    const cfg = useConfigSlice.getState();
    expect(cfg.activeNodeId).toBe("act");
    expect(cfg.drafts.act!.initialValues).toEqual({ repository: "octocat/x" });
  });
});

describe("WorkflowCanvas — canvas action bar (4.BUILDER-DESIGN-PARITY-1)", () => {
  it("renders the canvas action bar above the canvas with Builder active + secondaries disabled", () => {
    render(<WorkflowCanvas providerLabels={providerLabels} />);
    const bar = screen.getByTestId("canvas-action-bar");
    expect(bar).toBeInTheDocument();
    const tabs = within(bar).getAllByRole("tab");
    // Builder / Run history / Schema / Settings.
    expect(tabs).toHaveLength(4);
    expect(tabs[0]!.textContent).toMatch(/^Builder$/);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    // Secondary tabs are present-but-disabled placeholders (V2 doesn't
    // surface those flows inside the builder yet — documented as
    // deferred in the slice doc).
    for (const t of tabs.slice(1)) {
      expect(t).toBeDisabled();
      expect(t.getAttribute("aria-selected")).toBe("false");
    }
  });

  it("Add action canvas button fires the supplied callback when enabled, disabled otherwise", () => {
    const onAddAction = jest.fn();
    const { rerender } = render(
      <WorkflowCanvas
        providerLabels={providerLabels}
        onAddAction={onAddAction}
        canAddAction={false}
      />,
    );
    const btn = screen.getByTestId("canvas-add-action-button");
    expect(btn).toBeDisabled();
    rerender(
      <WorkflowCanvas
        providerLabels={providerLabels}
        onAddAction={onAddAction}
        canAddAction
      />,
    );
    expect(screen.getByTestId("canvas-add-action-button")).toBeEnabled();
    fireEvent.click(screen.getByTestId("canvas-add-action-button"));
    expect(onAddAction).toHaveBeenCalledTimes(1);
  });

  it("Arrange now lives in the bottom-left zoom/fit control cluster, NOT the action bar (ERGONOMICS-FIX-1)", () => {
    const onArrange = jest.fn();
    render(<WorkflowCanvas providerLabels={providerLabels} onArrange={onArrange} />);
    const btn = screen.getByTestId("canvas-arrange-button");
    // It's inside the ReactFlow controls cluster (beside zoom in/out + fit)…
    expect(btn.closest(".react-flow__controls")).not.toBeNull();
    // …and NOT inside the top action bar.
    expect(within(screen.getByTestId("canvas-action-bar")).queryByTestId("canvas-arrange-button")).toBeNull();
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onArrange).toHaveBeenCalledTimes(1);
  });

  it("Arrange control is disabled when the canvas is empty", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    render(<WorkflowCanvas providerLabels={providerLabels} onArrange={jest.fn()} />);
    expect(screen.getByTestId("canvas-arrange-button")).toBeDisabled();
  });
});

// ─── Slice 4.BUILDER-TRIGGER-RECOVERY-1 — no-trigger recovery banner ────────

const triggerlessDef: WorkflowDefinition = {
  nodes: [
    {
      id: "act",
      kind: "action",
      provider: "github",
      type: "add_comment",
      config: { repository: "octocat/x" },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

describe("WorkflowCanvas — no-trigger recovery banner", () => {
  it("renders the recovery banner when actions exist but no trigger does", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", triggerlessDef);
    render(<WorkflowCanvas providerLabels={providerLabels} />);
    expect(
      screen.getByTestId("no-trigger-recovery-banner"),
    ).toBeInTheDocument();
    // It is a recovery prompt, NOT the full empty-state card — the action
    // node is still on the canvas.
    expect(screen.queryByTestId("empty-canvas-state")).toBeNull();
    expect(screen.getAllByTestId("workflow-node-view")).toHaveLength(1);
  });

  it("does NOT render the recovery banner when a trigger exists", () => {
    // baseDef (hydrated in beforeEach) has a trigger.
    render(<WorkflowCanvas providerLabels={providerLabels} />);
    expect(screen.queryByTestId("no-trigger-recovery-banner")).toBeNull();
  });

  it("shows the empty-state card (not the recovery banner) when the canvas is empty", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    render(<WorkflowCanvas providerLabels={providerLabels} />);
    expect(screen.getByTestId("empty-canvas-state")).toBeInTheDocument();
    expect(screen.queryByTestId("no-trigger-recovery-banner")).toBeNull();
  });

  it("recovery banner CTA fires the onAddTrigger callback", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", triggerlessDef);
    const onAddTrigger = jest.fn();
    render(
      <WorkflowCanvas
        providerLabels={providerLabels}
        onAddTrigger={onAddTrigger}
      />,
    );
    fireEvent.click(screen.getByTestId("recovery-choose-trigger"));
    expect(onAddTrigger).toHaveBeenCalledTimes(1);
  });
});

// ─── Slice 4.BUILDER-NODE-DELETE-2 — keyboard-delete uses the safe path ─────

describe("WorkflowCanvas — safe keyboard-delete dialog mounts", () => {
  it("does NOT render the delete dialog by default (no pending delete)", () => {
    render(<WorkflowCanvas providerLabels={providerLabels} />);
    expect(screen.queryByTestId("delete-node-confirm-dialog")).toBeNull();
  });
});

describe("WorkflowCanvas — never persists to backend", () => {
  it("does not call updateWorkflow on mount", () => {
    render(<WorkflowCanvas providerLabels={providerLabels} />);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("does not call updateWorkflow on a node click", () => {
    render(<WorkflowCanvas providerLabels={providerLabels} />);
    const view = screen.getAllByTestId("workflow-node-view")[0]!;
    const flowNode = view.closest(".react-flow__node");
    fireEvent.click(flowNode!);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
