/**
 * Tests for features/workflow-builder/panels/NodeInspectorPanel.
 *
 * Thin wrapper (Slice 4.BUILDER-INSPECTOR-1) around ConfigModalShell.
 * The interesting behavior (Save / Cancel / field rendering / metadata
 * lookup) is covered by ConfigModalShell.test.tsx + the provider-specific
 * config tests. Here we only verify the wrapper:
 *   - data-testid for parent (drawer) integration.
 *   - ConfigModalShell mounts when activeNodeId is set.
 *   - ConfigModalShell stays null when no active node (existing
 *     shell contract — wrapper does not render an empty form).
 */
const mockListNativeActions = jest.fn(async () => []);
const mockListNativeTriggers = jest.fn(async () => []);
const mockListProviderActions = jest.fn(async (_p: string) => []);
const mockListProviderTriggers = jest.fn(async (_p: string) => []);
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeInspectorPanel } from "@/features/workflow-builder/panels/NodeInspectorPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";

beforeEach(() => {
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("NodeInspectorPanel", () => {
  it("renders the data-testid wrapper (used by the drawer integration)", () => {
    render(<NodeInspectorPanel />);
    expect(screen.getByTestId("node-inspector-panel")).toBeInTheDocument();
  });

  it("does NOT render ConfigModalShell content when no node is active (shell returns null)", () => {
    render(<NodeInspectorPanel />);
    // ConfigModalShell renders a `role='complementary' aria-label='Node configuration'`
    // landmark when active. With no activeNodeId, it should not render.
    expect(
      screen.queryByRole("complementary", { name: /node configuration/i }),
    ).toBeNull();
  });

  it("renders ConfigModalShell content once a node is hydrated + opened in configSlice", () => {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "trig",
          kind: "trigger",
          provider: "slack",
          type: "",
          config: {},
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    render(<NodeInspectorPanel />);
    act(() => {
      useConfigSlice.getState().openNode({ nodeId: "trig", initialValues: {} });
    });
    expect(
      screen.getByRole("complementary", { name: /node configuration/i }),
    ).toBeInTheDocument();
  });

  // Slice 4.BUILDER-DESIGN-PARITY-1 — the inspector now surfaces the
  // design's Setup / Advanced / Test / Variables tab strip. V2 only
  // wires Setup today; the rest render as disabled placeholders.
  it("renders the Setup / Advanced / Test / Variables tab strip with only Setup active", () => {
    render(<NodeInspectorPanel />);
    const strip = screen.getByTestId("node-inspector-tabs");
    const tabs = Array.from(strip.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Setup",
      "Advanced",
      "Test",
      "Variables",
    ]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]!).not.toBeDisabled();
    for (const t of tabs.slice(1)) {
      expect(t.getAttribute("aria-selected")).toBe("false");
      expect(t).toBeDisabled();
    }
  });
});

// ─── Slice 4.BUILDER-NODE-DELETE-1 — delete affordance ──────────────────────

function hydrateChainABC(): void {
  useGraphSlice.getState().hydrate("wf-1", {
    nodes: [
      {
        id: "a",
        kind: "trigger",
        provider: "slack",
        type: "slack.message",
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: "b",
        kind: "action",
        provider: "native",
        type: "noop",
        config: {},
        position: { x: 100, y: 100 },
      },
      {
        id: "c",
        kind: "action",
        provider: "native",
        type: "noop",
        config: {},
        position: { x: 200, y: 200 },
      },
    ],
    edges: [
      { id: "e-a-b", from: "a", to: "b" },
      { id: "e-b-c", from: "b", to: "c" },
    ],
  });
}

describe("NodeInspectorPanel — delete affordance", () => {
  it("does NOT render the Delete row when no node is active", () => {
    render(<NodeInspectorPanel />);
    expect(screen.queryByTestId("node-inspector-delete-row")).toBeNull();
    expect(screen.queryByTestId("node-inspector-delete-button")).toBeNull();
  });

  it("renders the Delete button once a node is hydrated + opened", () => {
    hydrateChainABC();
    render(<NodeInspectorPanel />);
    act(() => {
      useConfigSlice.getState().openNode({ nodeId: "b", initialValues: {} });
    });
    expect(screen.getByTestId("node-inspector-delete-button")).toBeInTheDocument();
  });

  it("clicking Delete opens the confirmation dialog with a rewire-aware preview", async () => {
    const user = userEvent.setup();
    hydrateChainABC();
    render(<NodeInspectorPanel />);
    act(() => {
      useConfigSlice.getState().openNode({ nodeId: "b", initialValues: {} });
    });
    await user.click(screen.getByTestId("node-inspector-delete-button"));
    expect(screen.getByTestId("delete-node-confirm-dialog")).toBeInTheDocument();
    expect(
      screen.getByTestId("delete-node-confirm-body"),
    ).toHaveTextContent(/new edge will be created/i);
  });

  it("Cancel closes the dialog and leaves the graph untouched", async () => {
    const user = userEvent.setup();
    hydrateChainABC();
    render(<NodeInspectorPanel />);
    act(() => {
      useConfigSlice.getState().openNode({ nodeId: "b", initialValues: {} });
    });
    await user.click(screen.getByTestId("node-inspector-delete-button"));
    await user.click(screen.getByTestId("delete-node-confirm-cancel"));
    expect(screen.queryByTestId("delete-node-confirm-dialog")).toBeNull();
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    expect(s.pendingEdges.map((e) => e.id).sort()).toEqual(["e-a-b", "e-b-c"]);
    expect(useConfigSlice.getState().activeNodeId).toBe("b");
  });

  it("Confirm deletes the node, rewires A→C, drops the draft, and clears activeNodeId", async () => {
    const user = userEvent.setup();
    hydrateChainABC();
    render(<NodeInspectorPanel />);
    act(() => {
      useConfigSlice
        .getState()
        .openNode({ nodeId: "b", initialValues: { hello: "world" } });
    });
    // Sanity: draft + activeNodeId set.
    expect(useConfigSlice.getState().activeNodeId).toBe("b");
    expect(useConfigSlice.getState().drafts.b).toBeDefined();

    await user.click(screen.getByTestId("node-inspector-delete-button"));
    await user.click(screen.getByTestId("delete-node-confirm-confirm"));

    expect(screen.queryByTestId("delete-node-confirm-dialog")).toBeNull();
    const graph = useGraphSlice.getState();
    expect(graph.pendingNodes.map((n) => n.id).sort()).toEqual(["a", "c"]);
    // One rewire edge replacing both original edges.
    expect(graph.pendingEdges).toHaveLength(1);
    expect(graph.pendingEdges[0]).toMatchObject({ from: "a", to: "c" });
    expect(graph.isDirty).toBe(true);
    // Config draft + active node both cleared via dropNode.
    const cfg = useConfigSlice.getState();
    expect(cfg.drafts.b).toBeUndefined();
    expect(cfg.activeNodeId).toBeNull();
  });

  it("blocked multi-edge node shows the blocked dialog and does NOT mutate state on Close", async () => {
    const user = userEvent.setup();
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "trig",
          kind: "trigger",
          provider: "slack",
          type: "slack.message",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "alt",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 0, y: 50 },
        },
        {
          id: "mid",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 100, y: 100 },
        },
        {
          id: "c",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 200, y: 200 },
        },
      ],
      edges: [
        { id: "e-trig-mid", from: "trig", to: "mid" },
        { id: "e-alt-mid", from: "alt", to: "mid" },
        { id: "e-mid-c", from: "mid", to: "c" },
      ],
    });
    render(<NodeInspectorPanel />);
    act(() => {
      useConfigSlice.getState().openNode({ nodeId: "mid", initialValues: {} });
    });
    await user.click(screen.getByTestId("node-inspector-delete-button"));
    expect(
      screen.getByRole("heading", { name: /can't delete this node yet/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("delete-node-confirm-close")).toBeInTheDocument();
    expect(
      screen.queryByTestId("delete-node-confirm-confirm"),
    ).toBeNull();
    await user.click(screen.getByTestId("delete-node-confirm-close"));
    expect(screen.queryByTestId("delete-node-confirm-dialog")).toBeNull();
    // No mutation.
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.map((n) => n.id).sort()).toEqual([
      "alt",
      "c",
      "mid",
      "trig",
    ]);
    expect(s.pendingEdges).toHaveLength(3);
    expect(useConfigSlice.getState().activeNodeId).toBe("mid");
  });
});
