/**
 * CS-5 branch authoring — Document integration (5.DUAL-BUILDER-1).
 *
 * Drives the REAL builder UI: creating a branch from a safe Document location
 * through the SHARED picker, wiring an empty lane's first step, and the
 * lane-aware Guided Stop (breadcrumb + sibling-lane chips). Every gesture flows
 * through the canonical graphSlice/config paths — no Document-only save path.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return { ...actual, updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args) };
});
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }));
jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return { ...actual, EdgeLabelRenderer: ({ children }: { children: unknown }) => children };
});

const slackAction = {
  key: "slack:send_channel_message", provider: "slack", type: "send_channel_message",
  displayName: "Send Channel Message", description: "Post a message.", category: "messaging",
  requiresIntegration: true, displayOrder: 10,
  fields: [{ name: "text", label: "Message", type: "textarea", required: true }], outputs: [],
};
const ifThenMeta = {
  key: "native:if_then_condition", provider: "native", type: "if_then_condition",
  displayName: "If/Then Condition", description: "Split the workflow.", category: "logic",
  requiresIntegration: false, displayOrder: 1, fields: [], outputs: [],
};

jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [ifThenMeta],
  listNativeTriggers: async () => [],
  listProviderActions: async (provider: string) => (provider === "slack" ? [slackAction] : []),
  listProviderTriggers: async () => [],
  DiscoveryApiError: class DiscoveryApiError extends Error { code = "UNKNOWN"; status = 500; },
}));

import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import { __BUILDER_VIEW_PREF_BASE_KEY__ } from "@/features/workflow-builder/document/documentViewPref";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";

const linear = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "hi" }, position: { x: 0, y: 120 } },
  ],
  edges: [{ id: "e-ta", from: "t", to: "a" }],
};

const nested = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "if", kind: "action" as const, provider: "native", type: "if_then_condition", config: { input: "{{t.x}}", operator: "is_truthy", onFalse: "branch" }, position: { x: 0, y: 120 } },
    { id: "deep", kind: "action" as const, provider: "slack", type: "send_channel_message", config: {}, position: { x: -100, y: 240 } },
    { id: "other", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "no" }, position: { x: 100, y: 240 } },
  ],
  edges: [
    { id: "e-t", from: "t", to: "if" },
    { id: "e-true", from: "if", to: "deep", label: "true" },
    { id: "e-false", from: "if", to: "other", label: "false" },
  ],
};

const workflow: WorkflowDetail = {
  id: "wf-cs5", name: "CS5", state: "draft", disabledReason: null, disabledContext: null,
  activeRevisionId: null, draftDefinition: linear, deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z",
};

const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "native:if_then_condition": { displayName: "If/Then Condition", requiredFields: [] },
  "slack:send_channel_message": { displayName: "Send Channel Message", requiredFields: [{ name: "text", label: "Message" }] },
};
const summaryFieldsByType: NodeSummaryFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", fields: [] },
  "native:if_then_condition": { displayName: "If/Then Condition", fields: [] },
  "slack:send_channel_message": { displayName: "Send Channel Message", fields: [{ name: "text", label: "Message", type: "textarea", required: true }] },
};
const providers = [{ id: "hubspot", displayName: "HubSpot" }, { id: "slack", displayName: "Slack" }];

function renderBuilder(opts?: { draftDefinition?: WorkflowDetail["draftDefinition"]; entitled?: boolean }) {
  window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
  return render(
    <WorkflowBuilder
      workflow={{ ...workflow, draftDefinition: opts?.draftDefinition ?? linear }}
      triggerProviders={providers}
      actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType}
      summaryFieldsByType={summaryFieldsByType}
      canUseAdvancedBranching={opts?.entitled ?? true}
      documentBuilderEnabled
    />,
  );
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockUpdateWorkflow.mockResolvedValue({ ...workflow, updatedAt: "2026-07-02T00:00:00Z" });
  window.localStorage.clear();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("creating an If/Then branch from a safe Document location", () => {
  it("appends an If/Then at the linear tail and renders the fork with empty-lane warnings", async () => {
    renderBuilder();
    // CS-6 — the "+" opens the Step / Branch / Section / Ask React menu; Branch →
    // If/Then creates the fork through the canonical CS-5 command (no picker).
    fireEvent.click(await screen.findByTestId("document-add-after-a"));
    fireEvent.click(await screen.findByTestId("document-add-after-a-branch"));
    fireEvent.click(await screen.findByTestId("document-add-after-a-ifthen"));

    // A fork appears; both lanes are empty (missing_branch_edge warnings).
    await waitFor(() => {
      const ifNode = useGraphSlice.getState().pendingNodes.find((n) => n.type === "if_then_condition");
      expect(ifNode).toBeDefined();
    });
    const ifNode = useGraphSlice.getState().pendingNodes.find((n) => n.type === "if_then_condition")!;
    expect(await screen.findByTestId(`document-fork-${ifNode.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`document-lane-warning-${ifNode.id}-true`)).toBeInTheDocument();
    expect(screen.getByTestId(`document-lane-warning-${ifNode.id}-false`)).toBeInTheDocument();
    // The empty missing lane offers an in-place "Add a step".
    expect(screen.getByTestId(`document-lane-add-step-${ifNode.id}-true`)).toBeInTheDocument();
    expect(useGraphSlice.getState().isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("wires a normal action into an empty lane through the shared picker", async () => {
    renderBuilder();
    fireEvent.click(await screen.findByTestId("document-add-after-a"));
    fireEvent.click(await screen.findByTestId("document-add-after-a-branch"));
    fireEvent.click(await screen.findByTestId("document-add-after-a-ifthen"));
    const ifNode = await waitFor(() => {
      const n = useGraphSlice.getState().pendingNodes.find((x) => x.type === "if_then_condition");
      expect(n).toBeDefined();
      return n!;
    });

    fireEvent.click(screen.getByTestId(`document-lane-add-step-${ifNode.id}-true`));
    const picker = await screen.findByTestId("add-node-panel");
    fireEvent.click(await within(picker).findByText("Slack"));
    fireEvent.click(await within(picker).findByText("Send Channel Message"));

    // The new step is wired with the 'true' route label; the lane is no longer empty.
    await waitFor(() => {
      const wired = useGraphSlice.getState().pendingEdges.some((e) => e.from === ifNode.id && e.label === "true");
      expect(wired).toBe(true);
    });
    expect(screen.queryByTestId(`document-lane-warning-${ifNode.id}-true`)).toBeNull();
  });
});

describe("lane-aware Guided Stop", () => {
  it("shows breadcrumb ancestry and sibling-lane chips when editing a value inside a lane", async () => {
    renderBuilder({ draftDefinition: nested });
    // 'deep' has an empty required 'text' → a blank chip inside the TRUE lane.
    fireEvent.click(await screen.findByTestId("document-blank-chip-deep-text"));

    const context = await screen.findByTestId("guided-stop-lane-context");
    expect(within(context).getByTestId("guided-stop-breadcrumb").textContent ?? "").toMatch(/If yes/i);
    // Sibling chips include both lanes; the active one is flagged.
    expect(screen.getByTestId("guided-stop-sibling-true")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("guided-stop-sibling-false")).toHaveAttribute("data-active", "false");
    // Switching a lane is focus-only — it never mutates the graph.
    const before = useGraphSlice.getState().pendingEdges;
    fireEvent.click(screen.getByTestId("guided-stop-sibling-false"));
    expect(useGraphSlice.getState().pendingEdges).toBe(before);
  });
});
