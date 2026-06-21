/**
 * Tests for features/workflow-builder/WorkflowBuilder.
 *
 * Integration-flavored: render the shell with the real graph slice and the
 * mocked typed client. Verify hydration, the add → save round-trip, and the
 * dirty / saved indicator.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

// Slice 4.BUILDER-V1-SHELL-PARITY-1 — LifecycleActions (lifted into
// BuilderHeader) calls `useRouter`. The full app-router mock isn't
// required for these tests — only `refresh()` is invoked, and only
// on a successful lifecycle action.
const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

// Slice 4.BUILDER-ADD-FLOW-1 — ReactFlow's EdgeLabelRenderer mounts a
// portal that jsdom can't initialize without real canvas dimensions.
// Replace it with a passthrough so the WorkflowEdge plus-button
// surfaces in the test DOM. Every other ReactFlow primitive stays real.
jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: unknown }) => children,
  };
});

const mockListNativeActions = jest.fn<Promise<readonly unknown[]>, []>(
  async () => [],
);
const mockListNativeTriggers = jest.fn<Promise<readonly unknown[]>, []>(
  async () => [],
);
const mockListProviderActions = jest.fn<
  Promise<readonly unknown[]>,
  [string]
>(async (_provider: string) => []);
const mockListProviderTriggers = jest.fn<
  Promise<readonly TriggerMeta[]>,
  [string]
>(async (_provider: string) => []);
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

import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { TriggerMeta } from "@/contracts/triggerMeta";

const baseWorkflow: WorkflowDetail = {
  id: "wf-1",
  name: "Test",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-05-06T00:00:00Z",
  updatedAt: "2026-05-06T00:00:00Z",
};

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "slack", displayName: "Slack" }];

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
  useRunSlice.getState().reset();
});

// Slice 3.10 — the picker now uses a drill-in for provider triggers.
// These tests need at least one provider trigger meta to pick.
const slackTriggerMeta = {
  key: "slack:slack.message.channel",
  provider: "slack",
  type: "slack.message.channel",
  displayName: "Slack Message",
  description: "Slack message in a channel.",
  category: "messaging" as const,
  activation: "webhook" as const,
  requiresIntegration: true,
  fields: [],
  payloadShape: [],
  displayOrder: 10,
};

describe("WorkflowBuilder", () => {
  it("hydrates the slice on mount and shows the canvas empty-state overlay when no nodes", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    expect(useGraphSlice.getState().workflowId).toBe("wf-1");
    expect(useGraphSlice.getState().isHydrated).toBe(true);
    // Slice 4.BUILDER-V1-SHELL-PARITY-1 — the below-canvas NodeList
    // mount that previously rendered "Empty workflow. Add a trigger
    // to get started." is gone. The empty-state CTA inside the canvas
    // ("Choose a trigger") is now the only empty-state surface.
    expect(screen.getByTestId("empty-canvas-state")).toBeInTheDocument();
    expect(screen.queryByText(/empty workflow/i)).toBeNull();
  });

  // Slice 4.BUILDER-ADD-FLOW-1 — the empty-canvas-state CTA now opens
  // the new AddNodePanel modal directly (the CANVAS-1 ref bridge is gone).
  it("the empty-canvas-state 'Choose a trigger' CTA opens the AddNodePanel modal", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    // Empty state overlay is present because pendingNodes is empty.
    expect(screen.getByTestId("empty-canvas-state")).toBeInTheDocument();
    // Modal not yet open.
    expect(screen.queryByTestId("add-node-panel")).toBeNull();
    // Click the CTA inside the empty state.
    const cta = within(screen.getByTestId("empty-canvas-state")).getByRole(
      "button",
      { name: /choose a trigger/i },
    );
    await user.click(cta);
    expect(screen.getByTestId("add-node-panel")).toBeInTheDocument();
    // Modal is in trigger mode → TriggerPicker is mounted inside.
    expect(
      screen.getByRole("button", { name: /browse slack triggers/i }),
    ).toBeInTheDocument();
  });

  // Reusable helper: open AddNodePanel, drill into Slack, pick the test trigger.
  // Replaces the pre-ADD-FLOW path through the inline AddNodeMenu.
  async function pickSlackTrigger(user: ReturnType<typeof userEvent.setup>) {
    mockListProviderTriggers.mockResolvedValueOnce([slackTriggerMeta]);
    const cta = within(screen.getByTestId("empty-canvas-state")).getByRole(
      "button",
      { name: /choose a trigger/i },
    );
    await user.click(cta);
    await user.click(
      screen.getByRole("button", { name: /browse slack triggers/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("Slack Message")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Slack Message"));
  }

  it("Save is disabled when the slice is clean; enables once the user edits", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    await pickSlackTrigger(user);
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it("Save dispatches updateWorkflow with the pending definition and shows 'Saved.'", async () => {
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
    await pickSlackTrigger(user);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockUpdateWorkflow).toHaveBeenCalledWith(
        "wf-1",
        expect.objectContaining({
          draftDefinition: expect.objectContaining({
            nodes: expect.arrayContaining([
              expect.objectContaining({ kind: "trigger", provider: "slack" }),
            ]),
          }),
        }),
      );
    });
    expect(await screen.findByText(/saved\./i)).toBeInTheDocument();
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("surfaces a save error inline and keeps pending edits", async () => {
    mockUpdateWorkflow.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await pickSlackTrigger(user);
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/failed to save/i);
    expect(useGraphSlice.getState().isDirty).toBe(true);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
  });

  // ─── BUILDER-CANVAS-ERGONOMICS-FIX-1 — branch-aware "Add action" CTA ───
  const linearWorkflow: WorkflowDetail = {
    ...baseWorkflow,
    draftDefinition: {
      nodes: [
        { id: "t1", kind: "trigger", provider: "slack", type: "m", config: {}, position: { x: 0, y: 0 } },
        { id: "a", kind: "action", provider: "slack", type: "x", config: {}, position: { x: 0, y: 120 } },
      ],
      edges: [{ id: "e1", from: "t1", to: "a" }],
    },
  };
  const branchWorkflow: WorkflowDetail = {
    ...baseWorkflow,
    draftDefinition: {
      nodes: [
        { id: "t1", kind: "trigger", provider: "slack", type: "m", config: {}, position: { x: 0, y: 0 } },
        { id: "a", kind: "action", provider: "slack", type: "x", config: {}, position: { x: 0, y: 120 } },
        { id: "b", kind: "action", provider: "gmail", type: "x", config: {}, position: { x: 320, y: 120 } },
      ],
      edges: [
        { id: "e1", from: "t1", to: "a" },
        { id: "e2", from: "t1", to: "b" },
      ],
    },
  };

  it("the global 'Add action' CTA is ENABLED for a single-tail linear chain", () => {
    render(
      <WorkflowBuilder workflow={linearWorkflow} triggerProviders={triggerProviders} actionProviders={actionProviders} />,
    );
    const cta = screen.getByTestId("canvas-add-action-button");
    expect(cta).toBeEnabled();
  });

  it("the global 'Add action' CTA is DISABLED with a branch-redirect tooltip when there are multiple tails", () => {
    render(
      <WorkflowBuilder workflow={branchWorkflow} triggerProviders={triggerProviders} actionProviders={actionProviders} />,
    );
    const cta = screen.getByTestId("canvas-add-action-button");
    expect(cta).toBeDisabled();
    expect(cta.getAttribute("title")).toMatch(/use the \+ on the step/i);
    // No raw ids in the redirect copy.
    expect(cta.getAttribute("title")).not.toMatch(/t1|wf-1/);
  });

  // Slice 4.BUILDER-APPLY-HYDRATE-RACE-1 — a stale prop re-render (same id,
  // older revision) must NOT clobber a freshly-applied graph. The hydrate
  // effect re-fires (draftDefinition ref changed) but the graphSlice revision
  // guard ignores the older revision; the id-keyed reset effect does not re-run.
  it("a stale prop re-render after a React Agent apply does NOT reset the canvas", () => {
    const stale: WorkflowDetail = {
      ...baseWorkflow,
      updatedAt: "2026-05-06T00:00:00Z",
      draftDefinition: { nodes: [], edges: [] },
    };
    const { rerender } = render(
      <WorkflowBuilder
        workflow={stale}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
    // Simulate the React Agent apply → onApplied hydrate of the NEW (non-empty)
    // draft carrying the post-apply revision.
    act(() => {
      useGraphSlice.getState().hydrate(
        "wf-1",
        {
          nodes: [
            {
              id: "t",
              kind: "trigger",
              provider: "gmail",
              type: "new_email",
              config: {},
              position: { x: 0, y: 0 },
            },
          ],
          edges: [],
        },
        "2026-05-06T00:05:00Z",
      );
    });
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
    // A late prop render re-fires the hydrate effect with the STALE empty draft
    // (older updatedAt, new object reference for the same workflow id).
    rerender(
      <WorkflowBuilder
        workflow={{ ...stale, draftDefinition: { nodes: [], edges: [] } }}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    // The applied graph survives — the stale hydrate was ignored.
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
    expect(useGraphSlice.getState().savedNodes).toHaveLength(1);
  });

  it("resets the slice on unmount so a stale graph never leaks into the next workflow", () => {
    const { unmount } = render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    unmount();
    const s = useGraphSlice.getState();
    expect(s.workflowId).toBeNull();
    expect(s.pendingNodes).toEqual([]);
    expect(s.isHydrated).toBe(false);
  });

  // Slice 4.BUILDER-ADD-FLOW-1 — the "+ Add action" canvas-actions
  // button is gated by hasTrigger. Once a trigger exists, the
  // AddNodePanel opens in action mode and picking appends a node to
  // the end of the chain via `addActionFromMeta`.
  it("+ Add action canvas button gates on hasTrigger and appends an action via AddNodePanel", async () => {
    const user = userEvent.setup();
    const httpAction = {
      key: "native:http.request",
      provider: "native",
      type: "http.request",
      displayName: "HTTP Request",
      description: "Make an HTTP request.",
      fields: [],
      payloadShape: [],
      category: "data",
      requiresIntegration: false,
      hasSideEffects: true,
      destructive: false,
      riskLevel: "medium",
      displayOrder: 10,
    };
    mockListNativeActions.mockResolvedValue([httpAction]);
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    // No trigger yet — Add action is disabled.
    expect(
      screen.getByRole("button", { name: /\+ add action/i }),
    ).toBeDisabled();
    // Add a trigger through the empty-state CTA.
    await pickSlackTrigger(user);
    // Add action is enabled. Click it → AddNodePanel opens in action mode.
    const addActionBtn = screen.getByRole("button", {
      name: /\+ add action/i,
    });
    expect(addActionBtn).toBeEnabled();
    await user.click(addActionBtn);
    expect(
      screen.getByRole("heading", { name: /choose an action/i }),
    ).toBeInTheDocument();
    // Pick the native action.
    await waitFor(() => screen.getByText("HTTP Request"));
    await user.click(screen.getByText("HTTP Request"));
    // Panel closes; the action is appended after the trigger.
    expect(screen.queryByTestId("add-node-panel")).toBeNull();
    const nodes = useGraphSlice.getState().pendingNodes;
    expect(nodes).toHaveLength(2);
    expect(nodes[1]!.type).toBe("http.request");
  });

  // Slice 4.BUILDER-TRIGGER-RECOVERY-1 — a workflow that lost its trigger
  // (or never had one) but still has actions must surface a recovery CTA so
  // the user is never stranded. The CTA opens the same trigger picker the
  // empty-state uses; picking a trigger restores a runnable chain WITHOUT
  // discarding the existing actions.
  describe("Slice 4.BUILDER-TRIGGER-RECOVERY-1 — no-trigger recovery", () => {
    const actionOnlyWorkflow: WorkflowDetail = {
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          {
            id: "a1",
            kind: "action",
            provider: "slack",
            type: "send_message",
            config: {},
            position: { x: 0, y: 120 },
          },
        ],
        edges: [],
      },
    };

    it("renders the recovery banner (not the empty-state card) when actions exist but no trigger", () => {
      render(
        <WorkflowBuilder
          workflow={actionOnlyWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(
        screen.getByTestId("no-trigger-recovery-banner"),
      ).toBeInTheDocument();
      // Not the full empty-state card — the user's action is still on canvas.
      expect(screen.queryByTestId("empty-canvas-state")).toBeNull();
    });

    it("recovery CTA opens the AddNodePanel in trigger mode", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={actionOnlyWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(screen.queryByTestId("add-node-panel")).toBeNull();
      await user.click(screen.getByTestId("recovery-choose-trigger"));
      expect(screen.getByTestId("add-node-panel")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /browse slack triggers/i }),
      ).toBeInTheDocument();
    });

    it("picking a trigger from the recovery CTA adds it, preserves the action, and auto-connects", async () => {
      mockListProviderTriggers.mockResolvedValueOnce([slackTriggerMeta]);
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={actionOnlyWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      await user.click(screen.getByTestId("recovery-choose-trigger"));
      await user.click(
        screen.getByRole("button", { name: /browse slack triggers/i }),
      );
      await waitFor(() => {
        expect(screen.getByText("Slack Message")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Slack Message"));

      const s = useGraphSlice.getState();
      // Trigger added, existing action preserved.
      expect(s.pendingNodes).toHaveLength(2);
      const trigger = s.pendingNodes.find((n) => n.kind === "trigger");
      expect(trigger).toBeDefined();
      expect(s.pendingNodes.some((n) => n.id === "a1")).toBe(true);
      // Auto-connected: trigger → a1 (the sole root action).
      expect(s.pendingEdges).toHaveLength(1);
      expect(s.pendingEdges[0]).toMatchObject({ from: trigger!.id, to: "a1" });
      // Recovery banner is gone now that a trigger exists.
      expect(screen.queryByTestId("no-trigger-recovery-banner")).toBeNull();
    });

    it("deleting the trigger while actions remain surfaces the recovery banner", () => {
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      // Build a trigger → action chain through the slice. addAction wires the
      // edge from the last node (the trigger) to the new action automatically.
      act(() => {
        useGraphSlice.getState().addTrigger({ provider: "slack" });
        useGraphSlice
          .getState()
          .addAction({ provider: "github", type: "add_comment" });
      });
      // No recovery banner while the trigger exists.
      expect(screen.queryByTestId("no-trigger-recovery-banner")).toBeNull();
      // Delete the trigger (safe delete path) — the action survives.
      act(() => {
        const trigId = useGraphSlice
          .getState()
          .pendingNodes.find((n) => n.kind === "trigger")!.id;
        useGraphSlice.getState().deleteNodeAndRewire(trigId);
      });
      // The action remains but the trigger is gone → recovery banner appears.
      expect(
        useGraphSlice.getState().pendingNodes.some((n) => n.kind === "action"),
      ).toBe(true);
      expect(
        useGraphSlice.getState().pendingNodes.some((n) => n.kind === "trigger"),
      ).toBe(false);
      expect(
        screen.getByTestId("no-trigger-recovery-banner"),
      ).toBeInTheDocument();
    });

    it("the no_trigger validation issue exposes a 'Choose trigger' action that opens the picker", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={actionOnlyWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      // Open the validation drawer via the header pill.
      await user.click(screen.getByTestId("builder-header-validation-pill"));
      const chooseTrigger = screen.getByTestId("validation-choose-trigger");
      expect(chooseTrigger).toBeInTheDocument();
      await user.click(chooseTrigger);
      expect(screen.getByTestId("add-node-panel")).toBeInTheDocument();
    });
  });

  // Slice 4.BUILDER-INSPECTOR-1 — drawer mount / close round-trip.
  it("opening a node mounts the BuilderRightDrawer with NodeInspectorPanel inside", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    // No drawer until a node is opened.
    expect(screen.queryByTestId("builder-right-drawer")).toBeNull();
    // Open one through the slice (same path canvas + NodeList both use).
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const triggerNodeId = useGraphSlice.getState().pendingNodes[0]!.id;
    act(() => {
      useConfigSlice
        .getState()
        .openNode({ nodeId: triggerNodeId, initialValues: {} });
    });
    expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
    expect(screen.getByTestId("node-inspector-panel")).toBeInTheDocument();
  });

  it("drawer close button drops activeNodeId AND unmounts the drawer (lock-step contract)", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const triggerNodeId = useGraphSlice.getState().pendingNodes[0]!.id;
    act(() => {
      useConfigSlice
        .getState()
        .openNode({ nodeId: triggerNodeId, initialValues: {} });
    });
    expect(useConfigSlice.getState().activeNodeId).toBe(triggerNodeId);
    expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close drawer/i }));
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
    expect(screen.queryByTestId("builder-right-drawer")).toBeNull();
  });

  // Slice 4.BUILDER-RUN-PANEL-1 — drawer auto-opens in results mode
  // when a new runId hits the runSlice. Verified through the public
  // `startTracking` action that the run controls call after a
  // successful runNowWorkflow.
  it("dispatching a run auto-opens the BuilderRightDrawer in results mode (Run results drawer)", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    // No drawer initially (no run, no selected node).
    expect(screen.queryByTestId("builder-right-drawer")).toBeNull();
    // Dispatch a run by feeding the slice the same signal Run Manually
    // produces — this is the public contract HeaderRunControls calls.
    act(() => {
      useRunSlice
        .getState()
        .startTracking({ workflowId: "wf-1", runId: "run-1" });
    });
    const drawer = screen.getByTestId("builder-right-drawer");
    expect(drawer).toBeInTheDocument();
    expect(drawer.getAttribute("aria-label")).toMatch(/run results/i);
  });

  // Drawer mode switches from inspector → results when a run dispatches
  // mid-edit, and from results → inspector when the user clicks a node
  // afterward. Both directions use the transition refs to avoid effect
  // fights.
  it("drawer mode switches inspector ↔ results based on user-initiated transitions", () => {
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    // Open inspector first.
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const triggerId = useGraphSlice.getState().pendingNodes[0]!.id;
    act(() => {
      useConfigSlice
        .getState()
        .openNode({ nodeId: triggerId, initialValues: {} });
    });
    expect(
      screen.getByTestId("builder-right-drawer").getAttribute("aria-label"),
    ).toMatch(/node configuration/i);
    // Run dispatches → drawer flips to results.
    act(() => {
      useRunSlice
        .getState()
        .startTracking({ workflowId: "wf-1", runId: "run-1" });
    });
    expect(
      screen.getByTestId("builder-right-drawer").getAttribute("aria-label"),
    ).toMatch(/run results/i);
    // Selecting a different node → drawer flips back to inspector.
    useGraphSlice
      .getState()
      .addAction({ provider: "slack", type: "slack.send_message" });
    const actionId = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.kind === "action")!.id;
    act(() => {
      useConfigSlice
        .getState()
        .openNode({ nodeId: actionId, initialValues: {} });
    });
    expect(
      screen.getByTestId("builder-right-drawer").getAttribute("aria-label"),
    ).toMatch(/node configuration/i);
  });

  // Closing the drawer in results mode must NOT clear runSlice — the
  // user might re-open to inspect the same run later.
  it("closing the results drawer does NOT clear runSlice", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    act(() => {
      useRunSlice
        .getState()
        .startTracking({ workflowId: "wf-1", runId: "run-1" });
    });
    expect(useRunSlice.getState().runId).toBe("run-1");
    await user.click(screen.getByRole("button", { name: /close drawer/i }));
    expect(screen.queryByTestId("builder-right-drawer")).toBeNull();
    // runSlice state is preserved.
    expect(useRunSlice.getState().runId).toBe("run-1");
    expect(useRunSlice.getState().workflowId).toBe("wf-1");
  });

  // No duplicate run-controls in the page — only the header set is
  // rendered. The old below-canvas RunNowPanel mount is gone. Slack
  // Message is an automated (webhook) trigger, so we expect the
  // automated panel variant + exactly one Test Workflow button.
  it("renders run-controls exactly once in the header and never below the canvas", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await pickSlackTrigger(user);
    expect(
      screen.getAllByTestId("run-controls-panel-automated"),
    ).toHaveLength(1);
    expect(
      screen.getAllByTestId("run-controls-test-button"),
    ).toHaveLength(1);
    // Manual panel + Run Manually button are NOT rendered for an
    // automated workflow.
    expect(
      screen.queryByTestId("run-controls-panel-manual"),
    ).toBeNull();
    expect(
      screen.queryByTestId("run-controls-run-manually-button"),
    ).toBeNull();
  });

  it("resets configSlice on unmount so stale per-node drafts don't leak", () => {
    const { unmount } = render(
      <WorkflowBuilder
        workflow={baseWorkflow}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: "fake", initialValues: { x: 1 } });
    expect(useConfigSlice.getState().drafts.fake).toBeDefined();
    unmount();
    expect(useConfigSlice.getState().drafts).toEqual({});
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
  });

  // Slice 4.BUILDER-LEFT-AGENT-1 — React Agent left rail mount + state.
  describe("Slice 4.BUILDER-LEFT-AGENT-1 — React Agent left rail", () => {
    beforeEach(() => {
      // Ensure each test starts with the rail expanded (clear any leftover
      // persisted state from earlier suites).
      window.localStorage.clear();
    });

    it("mounts the builder guidance rail inside the left rail by default on desktop", () => {
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      const rail = screen.getByTestId("builder-left-agent-rail");
      expect(rail).toBeInTheDocument();
      const panel = screen.getByTestId("builder-guidance-rail");
      expect(panel).toBeInTheDocument();
      expect(rail.contains(panel)).toBe(true);
    });

    it("renders the builder guidance rail exactly once (no duplicate below-canvas mount)", () => {
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(screen.getAllByTestId("builder-guidance-rail")).toHaveLength(1);
    });

    // Slice 4.BUILDER-DESIGN-PARITY-1 — collapsed rail now renders a 40px
    // vertical spine (rotated label + expand button) rather than fully
    // vacating the layout column. The critical invariant — BuilderAiPanel
    // (and its state / effects) must NOT mount while collapsed — is
    // preserved and asserted below. Rail presence is now identified by
    // `data-collapsed="true"`.
    it("header toggle collapses the rail (guidance rail unmounts; spine remains)", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(screen.getByTestId("builder-left-agent-rail")).toBeInTheDocument();
      expect(screen.getByTestId("builder-guidance-rail")).toBeInTheDocument();
      await user.click(
        screen.getByTestId("builder-header-left-rail-toggle"),
      );
      expect(
        screen
          .getByTestId("builder-left-agent-rail")
          .getAttribute("data-collapsed"),
      ).toBe("true");
      // The panel disappears with the rail — its state / effects don't
      // run while collapsed. This is the load-bearing invariant.
      expect(screen.queryByTestId("builder-guidance-rail")).toBeNull();
    });

    it("in-rail × button collapses the rail (alternative to the header toggle)", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(
        screen
          .getByTestId("builder-left-agent-rail")
          .getAttribute("data-collapsed"),
      ).toBe("false");
      await user.click(
        screen.getByTestId("builder-left-agent-rail-collapse"),
      );
      expect(
        screen
          .getByTestId("builder-left-agent-rail")
          .getAttribute("data-collapsed"),
      ).toBe("true");
      expect(screen.queryByTestId("builder-guidance-rail")).toBeNull();
    });

    it("header toggle is bidirectional — clicking again restores the rail", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      const toggle = screen.getByTestId("builder-header-left-rail-toggle");
      // Collapse.
      await user.click(toggle);
      expect(
        screen
          .getByTestId("builder-left-agent-rail")
          .getAttribute("data-collapsed"),
      ).toBe("true");
      // Re-expand.
      await user.click(toggle);
      expect(
        screen
          .getByTestId("builder-left-agent-rail")
          .getAttribute("data-collapsed"),
      ).toBe("false");
      expect(screen.getByTestId("builder-guidance-rail")).toBeInTheDocument();
    });

    it("collapsed state persists to localStorage so a refreshed page stays collapsed", async () => {
      const user = userEvent.setup();
      const first = render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      await user.click(
        screen.getByTestId("builder-header-left-rail-toggle"),
      );
      expect(
        screen
          .getByTestId("builder-left-agent-rail")
          .getAttribute("data-collapsed"),
      ).toBe("true");
      first.unmount();

      // Re-mount (simulates a navigation / refresh).
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(
        screen
          .getByTestId("builder-left-agent-rail")
          .getAttribute("data-collapsed"),
      ).toBe("true");
      expect(screen.queryByTestId("builder-guidance-rail")).toBeNull();
    });

    // Independence — drawer state and rail state never affect each other.
    it("opening a node inspector does NOT affect the left rail", () => {
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      const railBefore = screen.getByTestId("builder-left-agent-rail");
      expect(railBefore).toBeInTheDocument();
      useGraphSlice.getState().addTrigger({ provider: "slack" });
      const triggerId = useGraphSlice.getState().pendingNodes[0]!.id;
      act(() => {
        useConfigSlice
          .getState()
          .openNode({ nodeId: triggerId, initialValues: {} });
      });
      // Drawer mounted + rail still mounted simultaneously.
      expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
      expect(screen.getByTestId("builder-left-agent-rail")).toBeInTheDocument();
    });

    it("dispatching a run does NOT affect the left rail", () => {
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(screen.getByTestId("builder-left-agent-rail")).toBeInTheDocument();
      act(() => {
        useRunSlice
          .getState()
          .startTracking({ workflowId: "wf-1", runId: "run-1" });
      });
      // Drawer in results mode + rail still mounted.
      expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
      expect(screen.getByTestId("builder-left-agent-rail")).toBeInTheDocument();
    });

    it("collapsing the rail does NOT close an open right drawer", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      useGraphSlice.getState().addTrigger({ provider: "slack" });
      const triggerId = useGraphSlice.getState().pendingNodes[0]!.id;
      act(() => {
        useConfigSlice
          .getState()
          .openNode({ nodeId: triggerId, initialValues: {} });
      });
      expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
      await user.click(
        screen.getByTestId("builder-header-left-rail-toggle"),
      );
      // Rail collapsed to spine, drawer still open.
      expect(
        screen
          .getByTestId("builder-left-agent-rail")
          .getAttribute("data-collapsed"),
      ).toBe("true");
      expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
    });

    it("closing the right drawer does NOT collapse the left rail", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      useGraphSlice.getState().addTrigger({ provider: "slack" });
      const triggerId = useGraphSlice.getState().pendingNodes[0]!.id;
      act(() => {
        useConfigSlice
          .getState()
          .openNode({ nodeId: triggerId, initialValues: {} });
      });
      expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
      expect(screen.getByTestId("builder-left-agent-rail")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /close drawer/i }));
      // Drawer gone, rail still mounted.
      expect(screen.queryByTestId("builder-right-drawer")).toBeNull();
      expect(screen.getByTestId("builder-left-agent-rail")).toBeInTheDocument();
    });
  });

  // Slice 4.BUILDER-VALIDATION-1 — header pill + validation drawer mode.
  describe("Slice 4.BUILDER-VALIDATION-1 — validation summary", () => {
    it("renders the header validation pill with an issue count for an empty workflow", () => {
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      const pill = screen.getByTestId("builder-header-validation-pill");
      expect(pill).toBeInTheDocument();
      // Empty workflow → 1 error (no_trigger).
      expect(pill.getAttribute("data-state")).toBe("error");
      expect(pill.getAttribute("data-error-count")).toBe("1");
    });

    it("clicking the pill opens the right drawer in validation mode", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(screen.queryByTestId("builder-right-drawer")).toBeNull();
      await user.click(screen.getByTestId("builder-header-validation-pill"));
      const drawer = screen.getByTestId("builder-right-drawer");
      expect(drawer).toBeInTheDocument();
      expect(drawer.getAttribute("aria-label")).toMatch(/validation/i);
      expect(
        screen.getByTestId("validation-summary"),
      ).toBeInTheDocument();
    });

    it("opening validation drawer does NOT mutate graphSlice", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      const nodesBefore = useGraphSlice.getState().pendingNodes;
      const dirtyBefore = useGraphSlice.getState().isDirty;
      await user.click(screen.getByTestId("builder-header-validation-pill"));
      expect(useGraphSlice.getState().pendingNodes).toBe(nodesBefore);
      expect(useGraphSlice.getState().isDirty).toBe(dirtyBefore);
    });

    it("closing the validation drawer leaves graphSlice + activeNodeId untouched", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      await user.click(screen.getByTestId("builder-header-validation-pill"));
      expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
      // configSlice.activeNodeId must stay null since validation isn't
      // a node-selection mode.
      expect(useConfigSlice.getState().activeNodeId).toBeNull();
      await user.click(screen.getByRole("button", { name: /close drawer/i }));
      expect(screen.queryByTestId("builder-right-drawer")).toBeNull();
      expect(useConfigSlice.getState().activeNodeId).toBeNull();
    });

    it("clicking a node-bearing issue switches the drawer from validation → inspector", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      // Set up: trigger + unconfigured action so we have a clickable issue.
      act(() => {
        useGraphSlice.getState().addTrigger({ provider: "slack" });
        useGraphSlice.getState().addAction({ provider: "slack" });
      });
      const actionId = useGraphSlice
        .getState()
        .pendingNodes.find((n) => n.kind === "action")!.id;

      await user.click(screen.getByTestId("builder-header-validation-pill"));
      const drawerEl = screen.getByTestId("builder-right-drawer");
      expect(drawerEl.getAttribute("aria-label")).toMatch(/validation/i);
      // Click the action-node issue. The drawer mode flips to
      // inspector via the same transition-ref machinery that the
      // canvas click uses.
      const issueBtn = screen
        .getAllByTestId("validation-summary-issue")
        .find((el) => el.getAttribute("data-node-id") === actionId);
      expect(issueBtn).toBeDefined();
      await user.click(issueBtn!);
      expect(
        screen
          .getByTestId("builder-right-drawer")
          .getAttribute("aria-label"),
      ).toMatch(/node configuration/i);
      expect(useConfigSlice.getState().activeNodeId).toBe(actionId);
    });

    it("dispatching a run switches the drawer from validation → results", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      await user.click(screen.getByTestId("builder-header-validation-pill"));
      expect(
        screen
          .getByTestId("builder-right-drawer")
          .getAttribute("aria-label"),
      ).toMatch(/validation/i);
      act(() => {
        useRunSlice
          .getState()
          .startTracking({ workflowId: "wf-1", runId: "run-1" });
      });
      expect(
        screen
          .getByTestId("builder-right-drawer")
          .getAttribute("aria-label"),
      ).toMatch(/run results/i);
    });

    it("opening validation drawer does NOT collapse the left React Agent rail", async () => {
      const user = userEvent.setup();
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(screen.getByTestId("builder-left-agent-rail")).toBeInTheDocument();
      await user.click(screen.getByTestId("builder-header-validation-pill"));
      expect(screen.getByTestId("builder-left-agent-rail")).toBeInTheDocument();
      expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
    });
  });

  // Slice 4.BUILDER-V1-SHELL-PARITY-1 — full-bleed workspace.
  describe("Slice 4.BUILDER-V1-SHELL-PARITY-1 — full-bleed workspace", () => {
    it("renders the BuilderShell as the only top-level workspace wrapper (no centered detail-page block above it)", () => {
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      const shell = screen.getByTestId("builder-shell");
      expect(shell).toBeInTheDocument();
      // BuilderShell owns the workspace row.
      expect(
        screen.getByTestId("builder-workspace-row"),
      ).toBeInTheDocument();
      // Center workspace column landmark.
      expect(
        screen.getByTestId("builder-center-workspace"),
      ).toBeInTheDocument();
    });

    it("does NOT mount the legacy below-canvas NodeList (Empty workflow text gone)", () => {
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(screen.queryByText(/empty workflow/i)).toBeNull();
      expect(
        screen.queryByRole("list", { name: /workflow nodes/i }),
      ).toBeNull();
    });

    it("mounts LifecycleActions inside the BuilderHeader (lifted from the page header)", () => {
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      const header = screen.getByRole("banner", {
        name: /workflow builder header/i,
      });
      // The draft workflow's only lifecycle action is "Activate".
      const activate = within(header).getByRole("button", {
        name: /^activate$/i,
      });
      expect(activate).toBeInTheDocument();
    });

    it("renders exactly one Save button (no duplicate from the old page-header / WorkflowEditForm)", () => {
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(
        screen.getAllByRole("button", { name: /^save$/i }),
      ).toHaveLength(1);
    });

    it("canvas container drops the fixed 560px height and uses a flexible min-h floor instead", () => {
      render(
        <WorkflowBuilder
          workflow={baseWorkflow}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      const canvas = screen.getByTestId("workflow-canvas");
      // Pre-parity: `style="height: 560px"`. Post-parity: no fixed
      // height in inline style; the Tailwind class chain provides
      // `h-full min-h-[560px] flex-1` so the canvas grows into the
      // workspace.
      expect(canvas.style.height).toBe("");
      expect(canvas.className).toMatch(/min-h-\[560px\]/);
      expect(canvas.className).toMatch(/flex-1/);
    });
  });

  // WF-RUNPERM follow-up — WorkflowBuilder derives the header's run/edit gate
  // from the server-computed `viewerCanRunEdit` boolean and threads it to the
  // run controls. A manual-trigger workflow surfaces the Run/Test buttons.
  describe("WF-RUNPERM private-credential run gating (header derivation)", () => {
    const manualWorkflow: WorkflowDetail = {
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          {
            id: "t1",
            kind: "trigger",
            provider: "native",
            type: "manual.run",
            config: {},
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
    };

    it("viewerCanRunEdit === false disables the header Run/Test buttons with the safe copy", () => {
      render(
        <WorkflowBuilder
          workflow={{ ...manualWorkflow, viewerCanRunEdit: false }}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(
        screen.getByTestId("run-controls-run-manually-button"),
      ).toBeDisabled();
      expect(screen.getByTestId("run-controls-test-button")).toBeDisabled();
      expect(
        screen.getByTestId("run-controls-private-credential-status"),
      ).toHaveTextContent(/duplicate it to use your own connection/i);
    });

    it("viewerCanRunEdit === true keeps the header Run Manually button enabled", () => {
      render(
        <WorkflowBuilder
          workflow={{ ...manualWorkflow, viewerCanRunEdit: true }}
          triggerProviders={triggerProviders}
          actionProviders={actionProviders}
        />,
      );
      expect(
        screen.getByTestId("run-controls-run-manually-button"),
      ).not.toBeDisabled();
      expect(
        screen.queryByTestId("run-controls-private-credential-status"),
      ).toBeNull();
    });
  });
});
