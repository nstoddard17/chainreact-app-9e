/**
 * Slice 3.5 integration test — canvas + config rail synchronization.
 *
 * Verifies the architectural promise from the slice brief: the canvas
 * and the inspector are different views of the same graphSlice +
 * configSlice. Selecting a node on the canvas opens the inspector
 * with that node's draft; the config modal saves back through the
 * same slice; the canvas re-renders.
 *
 * Slice 4.BUILDER-V1-SHELL-PARITY-1 — the legacy `NodeList` is no
 * longer mounted in the builder route. Setup paths that used to drive
 * NodeList ("Configure action node" button / "Remove action node"
 * button) now drive the underlying slice actions directly
 * (`configSlice.openNode` / `graphSlice.removeNode`), which are the
 * same actions the canvas click + future inspector-Remove button
 * dispatch. The "single source of truth" promise is unchanged.
 *
 * Also pins the boundary that Run Now / toolbar Save remain the only
 * paths that talk to the workflows API; canvas mount + click + select
 * never call `updateWorkflow`.
 */

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

// Slice 4.BUILDER-V1-SHELL-PARITY-1 — LifecycleActions (lifted into
// BuilderHeader) calls `useRouter`. Only `refresh()` is invoked.
const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

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

import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { WorkflowDetail } from "@/contracts/workflow";

const baseWorkflow: WorkflowDetail = {
  id: "wf-1",
  name: "Test",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: {
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
  },
  deletedAt: null,
  createdAt: "2026-05-17T00:00:00Z",
  updatedAt: "2026-05-17T00:00:00Z",
};

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "github", displayName: "GitHub" }];

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("Slice 3.5 — canvas + rail synchronization (NodeList removed in V1-SHELL-PARITY-1)", () => {
  it("canvas renders both pending nodes from graphSlice (single source of truth)", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    const canvas = screen.getByTestId("workflow-canvas");
    const canvasViews = within(canvas).getAllByTestId("workflow-node-view");
    expect(canvasViews).toHaveLength(2);
    // The legacy NodeList is no longer mounted; graphSlice is the
    // single source of truth and the canvas is the single view.
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(2);
  });

  it("clicking a canvas node opens the inspector rail with that node's draft", async () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    const canvas = screen.getByTestId("workflow-canvas");
    const githubNodeView = within(canvas)
      .getAllByTestId("workflow-node-view")
      .find((v) => v.textContent?.includes("GitHub"))!;
    const flowNode = githubNodeView.closest(".react-flow__node");
    fireEvent.click(flowNode!);

    // ConfigModalShell now mounts the GitHub action's rail.
    expect(useConfigSlice.getState().activeNodeId).toBe("act");
    await waitFor(() => {
      expect(
        screen.getByRole("complementary", { name: /node configuration/i }),
      ).toBeInTheDocument();
    });
  });

  it("opening a node via configSlice.openNode (slice-level) highlights it on the canvas (selection mirroring)", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    // Setup path the canvas click also uses internally.
    act(() => {
      useConfigSlice
        .getState()
        .openNode({ nodeId: "act", initialValues: { repository: "octocat/x" } });
    });

    const canvas = screen.getByTestId("workflow-canvas");
    const views = within(canvas).getAllByTestId("workflow-node-view");
    const active = views.find((v) => v.getAttribute("data-selected") === "true");
    expect(active).toBeDefined();
    expect(active!.textContent).toMatch(/GitHub/);
  });

  it("clicking a node on the canvas does NOT call updateWorkflow (no hidden auto-save)", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    const canvas = screen.getByTestId("workflow-canvas");
    const flowNode = within(canvas)
      .getAllByTestId("workflow-node-view")[0]!
      .closest(".react-flow__node");
    fireEvent.click(flowNode!);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("removing a node via graphSlice.removeNode (slice-level) re-renders the canvas with one fewer node", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    // The visible remove affordance landed via NodeList in earlier
    // slices; SHELL-PARITY-1 drops that mount. Removal in production
    // is via ReactFlow's keyboard-delete (which calls
    // graphSlice.removeNode under the hood); the slice action is the
    // single source of truth and is what we exercise here.
    act(() => {
      useGraphSlice.getState().removeNode("act");
    });

    const canvas = screen.getByTestId("workflow-canvas");
    const remaining = within(canvas).getAllByTestId("workflow-node-view");
    expect(remaining).toHaveLength(1);
    // Trigger node still there.
    expect(remaining[0]!.textContent).toMatch(/Slack/);
    // Graph state matches.
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });

  it("toolbar Save still calls updateWorkflow with the full pending definition (canvas didn't intercept it)", async () => {
    mockUpdateWorkflow.mockImplementation(async (_id, body) => ({
      ...baseWorkflow,
      draftDefinition: body.draftDefinition,
    }));
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    // Force dirty via a position change on a canvas node — simulates a drag.
    useGraphSlice
      .getState()
      .updateNodePosition("act", { x: 50, y: 250 });
    expect(useGraphSlice.getState().isDirty).toBe(true);

    const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
    // Toolbar Save is the one OUTSIDE any complementary (modal) region.
    const toolbarSave = allSaveButtons.find(
      (btn) => !btn.closest('[aria-label="Node configuration"]'),
    )!;
    await user.click(toolbarSave);
    await waitFor(() => {
      expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
    });
    const callBody = mockUpdateWorkflow.mock.calls[0]![1];
    const persistedAction = callBody.draftDefinition.nodes.find(
      (n: { id: string }) => n.id === "act",
    );
    expect(persistedAction.position).toEqual({ x: 50, y: 250 });
  });
});
