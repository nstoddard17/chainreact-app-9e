/**
 * Document Builder — React Agent surface contract (DOC-REACT-AGENT-1,
 * superseding DOC-RAIL-LAYOUT-1's collapsed-rail model).
 *
 * Drives the REAL builder and proves: Document mode renders NO vertical React
 * Agent rail (no spine, no gutter) because the bottom workspace is the single
 * entry point; Visual keeps its existing persisted rail behavior untouched; the
 * bottom composer stays available and submitting expands the workspace through
 * the SAME conversation; collapsing keeps the transcript; switching modes loses
 * neither the conversation nor a pending proposal; step context reaches the
 * existing agent flow; and none of it mutates, dirties, or saves the workflow.
 * Flag OFF stays byte-identical to today's builder.
 *
 * The AI network boundary is the only thing mocked — the conversation, the
 * proposal payloads and the builder stores are all real.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return { ...actual, updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args) };
});
const mockRequestGuidance = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  __esModule: true,
  requestWorkflowGuidance: (...args: unknown[]) => mockRequestGuidance(...args),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }));
jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return { ...actual, EdgeLabelRenderer: ({ children }: { children: unknown }) => children };
});
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [],
  listAiActions: () => Promise.resolve([]),
  listNativeTriggers: async () => [],
  listProviderActions: async () => [],
  listProviderTriggers: async () => [],
  DiscoveryApiError: class DiscoveryApiError extends Error { code = "UNKNOWN"; status = 500; },
}));

import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __LEFT_AGENT_RAIL_STORAGE_KEY__ } from "@/features/workflow-builder/hooks/useLeftAgentRail";
import { __BUILDER_VIEW_PREF_BASE_KEY__ } from "@/features/workflow-builder/document/documentViewPref";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";

const blank = { nodes: [], edges: [] };
const linear = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "A" }, position: { x: 0, y: 120 } },
    { id: "b", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "B" }, position: { x: 0, y: 240 } },
  ],
  edges: [
    { id: "e-ta", from: "t", to: "a" },
    { id: "e-ab", from: "a", to: "b" },
  ],
};

const workflow: WorkflowDetail = {
  id: "wf-rail-1", name: "Rail layout", state: "draft", disabledReason: null, disabledContext: null,
  activeRevisionId: null, draftDefinition: blank, deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z",
};

const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "slack:send_channel_message": { displayName: "Send Channel Message", requiredFields: [{ name: "text", label: "Message" }] },
};
const summaryFieldsByType: NodeSummaryFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", fields: [] },
  "slack:send_channel_message": { displayName: "Send Channel Message", fields: [{ name: "text", label: "Message", type: "textarea", required: true }] },
};
const providers = [{ id: "hubspot", displayName: "HubSpot" }, { id: "slack", displayName: "Slack" }];

function renderBuilder(opts: {
  definition?: WorkflowDetail["draftDefinition"];
  documentBuilderEnabled?: boolean;
  startInDocument?: boolean;
} = {}) {
  if (opts.startInDocument) {
    window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
  }
  return render(
    <WorkflowBuilder
      workflow={{ ...workflow, draftDefinition: opts.definition ?? linear }}
      triggerProviders={providers}
      actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType}
      summaryFieldsByType={summaryFieldsByType}
      canUseAdvancedBranching
      accountId="acct-1"
      guidanceEnabled
      documentBuilderEnabled={opts.documentBuilderEnabled ?? true}
    />,
  );
}

const rail = () => screen.getByTestId("builder-left-agent-rail");
const REPLY = "Here is what I would change.";
const goalTextOf = (call: number): string =>
  String((mockRequestGuidance.mock.calls[call]![0] as { goalText: string }).goalText);

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRequestGuidance.mockReset();
  mockRequestGuidance.mockResolvedValue({
    ok: true,
    guidanceText: REPLY,
    workflowPlan: null,
    previewDraft: null,
  });
  window.localStorage.clear();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("Document mode hides the vertical React Agent rail (DOC-REACT-AGENT-1)", () => {
  it("renders NO rail in Document mode and no empty gutter, but keeps it in Visual", () => {
    renderBuilder();
    // Visual (flag on, nothing persisted): rail present and expanded.
    expect(rail()).toHaveAttribute("data-collapsed", "false");

    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    expect(screen.getByTestId("document-view")).toBeInTheDocument();
    // Not collapsed — absent entirely (no spine, no reserved column).
    expect(screen.queryByTestId("builder-left-agent-rail")).toBeNull();
    expect(screen.queryByTestId("builder-left-agent-rail-expand")).toBeNull();
    const row = screen.getByTestId("builder-workspace-row");
    expect(row.querySelector('[data-testid="builder-left-agent-rail"]')).toBeNull();

    // Back to Visual → the rail returns with its own state.
    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    expect(rail()).toHaveAttribute("data-collapsed", "false");
  });

  it("a builder that OPENS in Document mode renders no rail", () => {
    renderBuilder({ startInDocument: true });
    expect(screen.getByTestId("document-view")).toBeInTheDocument();
    expect(screen.queryByTestId("builder-left-agent-rail")).toBeNull();
  });

  it("Visual rail behavior + persistence are unchanged by a Document round-trip", () => {
    renderBuilder();
    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    expect(window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__)).toBeNull();

    // An explicit Visual collapse still persists, as before.
    fireEvent.click(screen.getByTestId("builder-left-agent-rail-collapse"));
    expect(rail()).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__)).toBe("true");
  });

  it("a persisted collapsed Visual preference survives the Document round-trip", () => {
    window.localStorage.setItem(__LEFT_AGENT_RAIL_STORAGE_KEY__, "true");
    renderBuilder();
    expect(rail()).toHaveAttribute("data-collapsed", "true");
    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    expect(rail()).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__)).toBe("true");
  });

  it("flag OFF renders today's builder — no Document surface, rail behavior unchanged", () => {
    renderBuilder({ documentBuilderEnabled: false });
    expect(screen.queryByTestId("builder-view-toggle")).toBeNull();
    expect(screen.queryByTestId("document-view")).toBeNull();
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    fireEvent.click(screen.getByTestId("builder-left-agent-rail-collapse"));
    expect(rail()).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__)).toBe("true");
  });
});

describe("the bottom workspace is the ONE agent entry point (DOC-REACT-AGENT-1)", () => {
  it("keeps the composer available and expands the workspace on submit", async () => {
    renderBuilder({ startInDocument: true });
    const nodesBefore = useGraphSlice.getState().pendingNodes;
    // Compact by default: composer visible, workspace collapsed.
    expect(screen.getByTestId("document-ask-react-input")).toBeInTheDocument();
    expect(screen.getByTestId("document-agent-workspace")).toHaveAttribute("data-expanded", "false");

    fireEvent.change(screen.getByTestId("document-ask-react-input"), {
      target: { value: "Add a follow-up email step" },
    });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));

    // Expanded workspace, ONE conversation, request sent through the shared path.
    expect(screen.getByTestId("document-agent-workspace")).toHaveAttribute("data-expanded", "true");
    expect(screen.getByTestId("document-agent-transcript")).toBeInTheDocument();
    expect(screen.getAllByTestId("builder-guidance-rail")).toHaveLength(1);
    await waitFor(() => expect(mockRequestGuidance).toHaveBeenCalledTimes(1));
    expect(goalTextOf(0)).toContain("Add a follow-up email step");
    // The composer is still there for a follow-up while expanded.
    expect(screen.getByTestId("document-ask-react-input")).toBeInTheDocument();
    // Nothing mutated, nothing dirty, nothing saved.
    expect(useGraphSlice.getState().pendingNodes).toBe(nodesBefore);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("collapsing returns the compact composer WITHOUT losing the conversation", async () => {
    renderBuilder({ startInDocument: true });
    fireEvent.change(screen.getByTestId("document-ask-react-input"), { target: { value: "Explain this" } });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    await screen.findByText(REPLY);

    fireEvent.click(screen.getByTestId("document-agent-collapse"));
    expect(screen.getByTestId("document-agent-workspace")).toHaveAttribute("data-expanded", "false");
    expect(screen.queryByTestId("document-agent-transcript")).toBeNull();
    expect(screen.getByTestId("document-ask-react-input")).toBeInTheDocument();

    // Re-opening shows the SAME transcript (no second conversation, no re-send).
    fireEvent.click(screen.getByTestId("document-agent-expand"));
    await screen.findByText(REPLY);
    expect(mockRequestGuidance).toHaveBeenCalledTimes(1);
  });

  it("switching Visual and Document keeps the conversation and never re-sends", async () => {
    renderBuilder({ startInDocument: true });
    fireEvent.change(screen.getByTestId("document-ask-react-input"), { target: { value: "Keep me" } });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    await screen.findByText(REPLY);

    // → Visual: the same transcript renders in the rail.
    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    expect(rail()).toBeInTheDocument();
    await screen.findByText(REPLY);

    // → Document: the workspace comes back ALREADY expanded (its state is owned
    // by the builder too), showing the same transcript, with no second request.
    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    expect(screen.getByTestId("document-agent-workspace")).toHaveAttribute("data-expanded", "true");
    await screen.findByText(REPLY);
    expect(mockRequestGuidance).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("builder-guidance-rail")).toHaveLength(1);
  });

  it("the insertion-menu Ask React prefills the ONE bottom composer (never auto-sends)", () => {
    renderBuilder({ startInDocument: true });
    fireEvent.click(screen.getByTestId("document-add-after-b"));
    fireEvent.click(screen.getByTestId("document-add-after-b-askreact"));
    const input = screen.getByTestId("document-ask-react-input") as HTMLInputElement;
    expect(input.value).toContain("at the end of the workflow");
    expect(mockRequestGuidance).not.toHaveBeenCalled();
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("passes the focused step as context and scopes the request to it", async () => {
    renderBuilder({ startInDocument: true });
    // Focus a step through the EXISTING selection control (the step overflow menu).
    fireEvent.click(screen.getByTestId("document-step-menu-a"));
    fireEvent.click(screen.getByTestId("document-select-a"));
    expect(screen.getByTestId("document-agent-context")).toHaveAttribute("data-context-kind", "step");

    fireEvent.change(screen.getByTestId("document-ask-react-input"), { target: { value: "make it shorter" } });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    await waitFor(() => expect(mockRequestGuidance).toHaveBeenCalledTimes(1));
    expect(goalTextOf(0)).toContain("Send Channel Message");
    expect(goalTextOf(0)).toContain("make it shorter");

    // The context is clearable back to the whole workflow.
    fireEvent.click(screen.getByTestId("document-agent-context-clear"));
    expect(screen.getByTestId("document-agent-context")).toHaveAttribute("data-context-kind", "workflow");
  });
});

describe("panel conflicts stay deterministic (DOC-REACT-AGENT-1)", () => {
  it("the Whole Workflow map still opens as a right-side sheet with the workspace expanded", async () => {
    renderBuilder({ startInDocument: true });
    fireEvent.change(screen.getByTestId("document-ask-react-input"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    await waitFor(() => expect(mockRequestGuidance).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("document-open-map-button"));
    expect(screen.getByTestId("document-whole-workflow-map")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("document-map-close"));
    expect(screen.queryByTestId("document-whole-workflow-map")).toBeNull();
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("map → Configure step closes the map before the inspector drawer opens (no overlap)", () => {
    renderBuilder({ startInDocument: true });
    fireEvent.click(screen.getByTestId("document-open-map-button"));
    expect(screen.getByTestId("document-map-row-a")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("document-map-close"));

    act(() => {
      useConfigSlice.getState().openNode({ nodeId: "a", initialValues: { text: "A" } });
    });
    expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
    expect(screen.queryByTestId("document-whole-workflow-map")).toBeNull();
  });
});

describe("graph/config/undo/preview state across the agent surface (unchanged contract)", () => {
  it("expanding/collapsing the workspace and switching views never touch graph refs, drafts, dirty, or history", async () => {
    renderBuilder({ startInDocument: true });
    act(() => {
      useGraphSlice.getState().updateNodeConfig("a", { text: "edited" });
      useConfigSlice.getState().openNode({ nodeId: "b", initialValues: { text: "B" } });
      useConfigSlice.getState().updateField({ nodeId: "b", name: "text", value: "draft-edit" });
    });
    const g = useGraphSlice.getState();
    const nodesRef = g.pendingNodes;
    const pastLen = g.past.length;
    expect(g.isDirty).toBe(true);

    fireEvent.change(screen.getByTestId("document-ask-react-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    await waitFor(() => expect(mockRequestGuidance).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("document-agent-collapse"));
    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));

    const after = useGraphSlice.getState();
    expect(after.pendingNodes).toBe(nodesRef);
    expect(after.past.length).toBe(pastLen);
    expect(after.isDirty).toBe(true);
    expect(useConfigSlice.getState().drafts["b"]?.values.text).toBe("draft-edit");
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("agent references reach into the document (DOC-REACT-AGENT-1)", () => {
  it("a proposal names the affected sentence, and clicking it focuses that sentence", async () => {
    // A real EDIT proposal through the existing guidance payload → the builder's
    // existing preview overlay → the Document's existing preview projection.
    const proposedDefinition = {
      nodes: [
        linear.nodes[0]!,
        { ...linear.nodes[1]!, config: { text: "updated" } },
        linear.nodes[2]!,
      ],
      edges: linear.edges,
    };
    mockRequestGuidance.mockResolvedValue({
      ok: true,
      guidanceText: "I will update the Slack message.",
      source: "hermes-agent",
      workflowPlan: {
        schemaVersion: 1,
        title: "Proposed change",
        summary: "",
        notApplied: true as const,
        steps: [
          { ref: "t", role: "trigger" as const, provider: "hubspot", type: "new_contact", purpose: "" },
          { ref: "a", role: "action" as const, provider: "slack", type: "send_channel_message", purpose: "" },
        ],
      },
      previewDraft: {
        title: "Proposed change",
        summary: "Update the first Slack message",
        nodes: [
          { previewId: "t", role: "trigger", provider: "hubspot", type: "new_contact", label: "hubspot:new_contact", purpose: "", notApplied: true },
          { previewId: "a", role: "action", provider: "slack", type: "send_channel_message", label: "slack:send_channel_message", purpose: "", notApplied: true },
        ],
        edges: [{ previewId: "e1", fromPreviewId: "t", toPreviewId: "a", notApplied: true }],
        notApplied: true,
      },
      proposedDefinition,
    });
    renderBuilder({ startInDocument: true });
    fireEvent.change(screen.getByTestId("document-ask-react-input"), {
      target: { value: "shorten the first Slack message" },
    });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    await waitFor(() => expect(mockRequestGuidance).toHaveBeenCalledTimes(1));

    // The workspace names the sentence that would change — not just prose.
    const ref = await screen.findByTestId("document-agent-change-a");
    expect(ref).toHaveAttribute("data-change-status", "changed");
    expect(screen.getByTestId("document-agent-changes")).toHaveTextContent("Send Channel Message");

    // Clicking it focuses that sentence temporarily, WITHOUT selecting it.
    fireEvent.click(ref);
    const block = screen.getByTestId("document-sentence-a").closest("[data-agent-focus]");
    expect(block).not.toBeNull();
    expect(block).not.toHaveAttribute("data-document-selected");
    // Applying stays explicit — nothing was mutated by rendering the proposal.
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBe("A");
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
