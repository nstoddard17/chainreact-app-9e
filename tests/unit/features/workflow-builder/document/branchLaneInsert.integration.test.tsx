/**
 * Branch-lane insertion — Document integration (5.DUAL-BUILDER-1 / CS-2B).
 *
 * Drives the real UI: the lane affordance only appears on healthy editable
 * lanes, opens the SHARED action picker, inserts through the shared path, and
 * shows up immediately in both surfaces with shared dirty/history — persisting
 * only through the existing Save.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: unknown }) => children,
  };
});

const slackAction = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message to a Slack channel.",
  category: "messaging",
  requiresIntegration: true,
  displayOrder: 10,
  fields: [{ name: "text", label: "Message", type: "textarea", required: true }],
  outputs: [],
};

const ifThenMeta = {
  key: "native:if_then_condition",
  provider: "native",
  type: "if_then_condition",
  displayName: "If/Then Condition",
  description: "Split the workflow.",
  category: "logic",
  requiresIntegration: false,
  displayOrder: 1,
  fields: [],
  outputs: [],
};

jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [ifThenMeta],
  listNativeTriggers: async () => [],
  // AI-PROVIDER-4 CS-4 — the ActionPicker calls `useAiActions(true)`; empty is
  // the honest default (server returns none while the AI processor is off).
  listAiActions: async () => [],
  listProviderActions: async (provider: string) => (provider === "slack" ? [slackAction] : []),
  listProviderTriggers: async () => [],
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
import { __BUILDER_VIEW_PREF_BASE_KEY__ } from "@/features/workflow-builder/document/documentViewPref";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";

const definition = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    {
      id: "if",
      kind: "action" as const,
      provider: "native",
      type: "if_then_condition",
      config: { input: "{{trigger.amount}}", operator: "greater_than", value: "100", onFalse: "branch" },
      position: { x: 0, y: 120 },
    },
    { id: "hot", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "hot" }, position: { x: -160, y: 240 } },
    { id: "cold", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "cold" }, position: { x: 160, y: 240 } },
  ],
  edges: [
    { id: "e-t", from: "t", to: "if" },
    { id: "e-true", from: "if", to: "hot", label: "true" },
    { id: "e-false", from: "if", to: "cold", label: "false" },
  ],
};

/** A fork whose FALSE route is unwired → warning lane, not insertable. */
const wiringGapDefinition = {
  nodes: definition.nodes.filter((n) => n.id !== "cold"),
  edges: definition.edges.filter((e) => e.id !== "e-false"),
};

const workflow: WorkflowDetail = {
  id: "wf-cs2b",
  name: "CS2B",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: definition,
  deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "native:if_then_condition": { displayName: "If/Then Condition", requiredFields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    requiredFields: [{ name: "text", label: "Message" }],
  },
};

const summaryFieldsByType: NodeSummaryFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", fields: [] },
  "native:if_then_condition": { displayName: "If/Then Condition", fields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    fields: [{ name: "text", label: "Message", type: "textarea", required: true }],
  },
};

const providers = [
  { id: "hubspot", displayName: "HubSpot" },
  { id: "slack", displayName: "Slack" },
];

function renderBuilder(opts?: {
  documentBuilderEnabled?: boolean;
  draftDefinition?: WorkflowDetail["draftDefinition"];
  startInDocument?: boolean;
}) {
  if (opts?.startInDocument !== false) {
    window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
  }
  return render(
    <WorkflowBuilder
      workflow={{ ...workflow, draftDefinition: opts?.draftDefinition ?? definition }}
      triggerProviders={providers}
      actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType}
      summaryFieldsByType={summaryFieldsByType}
      canUseAdvancedBranching
      {...(opts?.documentBuilderEnabled === false ? {} : { documentBuilderEnabled: true })}
    />,
  );
}

async function pickSlackAction() {
  const picker = await screen.findByTestId("add-node-panel");
  fireEvent.click(await within(picker).findByText("Slack"));
  fireEvent.click(await within(picker).findByText("Send Channel Message"));
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

describe("lane affordance visibility", () => {
  it("appears on both healthy labeled lanes", () => {
    renderBuilder();
    expect(screen.getByTestId("document-lane-insert-if-true")).toBeInTheDocument();
    expect(screen.getByTestId("document-lane-insert-if-false")).toBeInTheDocument();
  });

  it("is absent on a warning lane (unwired route) while the fork stays readable", () => {
    renderBuilder({ draftDefinition: wiringGapDefinition });
    // The fork is still rendered (CS-2 warning-lane behavior preserved).
    expect(screen.getByTestId("document-fork-if")).toBeInTheDocument();
    expect(screen.getByTestId("document-lane-warning-if-false")).toBeInTheDocument();
    // ...but the broken lane offers no insertion point.
    expect(screen.queryByTestId("document-lane-insert-if-false")).toBeNull();
    // The healthy lane still does.
    expect(screen.getByTestId("document-lane-insert-if-true")).toBeInTheDocument();
  });

  it("is absent entirely when the flag is off (no Document surface)", () => {
    renderBuilder({ documentBuilderEnabled: false });
    expect(screen.queryByTestId("document-view")).toBeNull();
    expect(screen.queryByTestId("document-lane-insert-if-true")).toBeNull();
    expect(screen.queryByTestId("builder-view-toggle")).toBeNull();
  });
});

describe("inserting in a lane", () => {
  it("inserts at the start of the TRUE lane and shows it in that lane immediately", async () => {
    renderBuilder();
    fireEvent.click(screen.getByTestId("document-lane-insert-if-true"));
    await pickSlackAction();

    await waitFor(() => expect(useGraphSlice.getState().pendingNodes).toHaveLength(5));
    const { pendingNodes, pendingEdges } = useGraphSlice.getState();
    const added = pendingNodes.find((n) => !["t", "if", "hot", "cold"].includes(n.id))!;

    // Canonical topology: label upstream, continuation unlabeled.
    expect(pendingEdges.find((e) => e.from === "if" && e.to === added.id)?.label).toBe("true");
    expect(pendingEdges.find((e) => e.from === added.id && e.to === "hot")?.label).toBeUndefined();
    // The other lane is untouched.
    expect(pendingEdges.find((e) => e.id === "e-false")).toMatchObject({
      from: "if",
      to: "cold",
      label: "false",
    });

    // Rendered inside the TRUE lane, before the original step.
    const lane = screen.getByTestId("document-fork-lane-if-true");
    const sentences = within(lane).getAllByTestId(/^document-sentence-/);
    expect(sentences[0]).toHaveAttribute("data-testid", `document-sentence-${added.id}`);
    expect(within(lane).getByTestId("document-sentence-hot")).toBeInTheDocument();
    // Not in the other lane.
    const otherLane = screen.getByTestId("document-fork-lane-if-false");
    expect(within(otherLane).queryByTestId(`document-sentence-${added.id}`)).toBeNull();

    // Dirty, but nothing persisted.
    expect(useGraphSlice.getState().isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("the Visual Builder sees the same graph without saving, and history is shared", async () => {
    renderBuilder();
    fireEvent.click(screen.getByTestId("document-lane-insert-if-true"));
    await pickSlackAction();
    await waitFor(() => expect(useGraphSlice.getState().pendingNodes).toHaveLength(5));

    const graphInDocument = {
      nodes: useGraphSlice.getState().pendingNodes,
      edges: useGraphSlice.getState().pendingEdges,
    };
    const historyDepth = useGraphSlice.getState().past.length;

    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));

    // Same store, no re-hydrate, no save.
    expect(useGraphSlice.getState().pendingNodes).toBe(graphInDocument.nodes);
    expect(useGraphSlice.getState().pendingEdges).toBe(graphInDocument.edges);
    expect(useGraphSlice.getState().past.length).toBe(historyDepth);
    expect(useGraphSlice.getState().isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("saves the canonical labeled topology through the existing updateWorkflow path", async () => {
    renderBuilder();
    fireEvent.click(screen.getByTestId("document-lane-insert-if-true"));
    await pickSlackAction();
    await waitFor(() => expect(useGraphSlice.getState().pendingNodes).toHaveLength(5));

    fireEvent.click(screen.getByTestId("builder-header-save-button"));
    await waitFor(() => expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1));

    const [id, payload] = mockUpdateWorkflow.mock.calls[0]!;
    expect(id).toBe("wf-cs2b");
    const def = (payload as { draftDefinition: typeof definition }).draftDefinition;
    expect(Object.keys(def)).toEqual(["nodes", "edges"]);
    const added = def.nodes.find((n) => !["t", "if", "hot", "cold"].includes(n.id))!;
    expect(def.edges.find((e) => e.from === "if" && e.to === added.id)?.label).toBe("true");
    expect(def.edges.find((e) => e.from === added.id && e.to === "hot")?.label).toBeUndefined();
    expect(def.edges.find((e) => e.from === "if" && e.to === "cold")?.label).toBe("false");
  });

  it("re-opening the saved definition in the Document shows the same lane order", async () => {
    renderBuilder();
    fireEvent.click(screen.getByTestId("document-lane-insert-if-true"));
    await pickSlackAction();
    await waitFor(() => expect(useGraphSlice.getState().pendingNodes).toHaveLength(5));
    const savedDefinition = {
      nodes: [...useGraphSlice.getState().pendingNodes],
      edges: [...useGraphSlice.getState().pendingEdges],
    };
    const addedId = savedDefinition.nodes.find((n) => !["t", "if", "hot", "cold"].includes(n.id))!.id;

    // Simulate a reload: fresh mount hydrated from the persisted definition.
    act(() => {
      useGraphSlice.getState().reset();
      useConfigSlice.getState().reset();
    });
    screen.getByTestId("document-view"); // still mounted
    act(() => {
      useGraphSlice.getState().hydrate("wf-cs2b", savedDefinition, "2026-07-02T00:00:00Z");
    });

    const lane = screen.getByTestId("document-fork-lane-if-true");
    const sentences = within(lane).getAllByTestId(/^document-sentence-/);
    expect(sentences[0]).toHaveAttribute("data-testid", `document-sentence-${addedId}`);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("picking a BRANCH action from a lane insertion point creates a nested branch (CS-5)", async () => {
    // CS-5 supersedes the CS-2 refusal: a branch pick at a safe lane-start
    // insertion point now authors a NESTED fork through the canonical commands.
    renderBuilder();

    fireEvent.click(screen.getByTestId("document-lane-insert-if-true"));
    const picker = await screen.findByTestId("add-node-panel");
    fireEvent.click(await within(picker).findByText("If/Then Condition"));

    // A nested If/Then is inserted between the fork and the lane's first node.
    await waitFor(() => {
      const ifThens = useGraphSlice
        .getState()
        .pendingNodes.filter((n) => n.type === "if_then_condition");
      expect(ifThens).toHaveLength(2);
    });
    const edges = useGraphSlice.getState().pendingEdges;
    // if --[true]--> NESTED (the original if→hot edge is replaced) …
    const trueEdge = edges.find((e) => e.from === "if" && e.label === "true")!;
    const nestedId = trueEdge.to;
    expect(nestedId).not.toBe("hot");
    // … and NESTED wires both true/false to the preserved downstream (rejoin).
    expect(
      edges.filter((e) => e.from === nestedId && e.to === "hot").map((e) => e.label).sort(),
    ).toEqual(["false", "true"]);
    // Local edit only — dirty flips, but the Save button stays the sole persist.
    expect(useGraphSlice.getState().isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
