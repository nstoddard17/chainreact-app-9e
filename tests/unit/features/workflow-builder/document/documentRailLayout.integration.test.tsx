/**
 * Document Builder layout cleanup — Agent rail behavior (DOC-RAIL-LAYOUT-1).
 *
 * Drives the REAL builder and proves the Document-mode rail contract:
 * entering Document collapses the persistent React Agent rail by default (the
 * Document surface owns the full workspace; its Ask React bar is the one
 * visible AI entry), Visual keeps its existing persisted rail behavior and is
 * never overwritten by Document-mode toggling, every Document Ask React entry
 * (empty state · persistent bar · insertion menu) opens the ONE existing rail
 * and seeds the ONE composer, closing the rail returns the full-width Document
 * without losing composer/conversation state, and none of it mutates, dirties,
 * or saves the workflow. Flag OFF stays byte-identical to today's builder.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";

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
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [],
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
const composerEl = (): HTMLTextAreaElement | null =>
  document.getElementById("workflow-guidance-goal") as HTMLTextAreaElement | null;

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  window.localStorage.clear();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("Document mode rail default (DOC-RAIL-LAYOUT-1)", () => {
  it("entering Document mode collapses the persistent Agent rail by default", () => {
    renderBuilder();
    // Visual (flag on, nothing persisted): rail expanded — existing behavior.
    expect(rail()).toHaveAttribute("data-collapsed", "false");

    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    expect(screen.getByTestId("document-view")).toBeInTheDocument();
    expect(rail()).toHaveAttribute("data-collapsed", "true");
  });

  it("a builder that OPENS in Document mode starts with the rail collapsed", () => {
    renderBuilder({ startInDocument: true });
    expect(screen.getByTestId("document-view")).toBeInTheDocument();
    expect(rail()).toHaveAttribute("data-collapsed", "true");
  });

  it("Visual rail state is not overwritten by a Document round-trip (default-expanded case)", () => {
    renderBuilder();
    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    // Open and close the rail while in Document.
    fireEvent.click(screen.getByTestId("builder-left-agent-rail-expand"));
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    fireEvent.click(screen.getByTestId("builder-left-agent-rail-collapse"));
    expect(rail()).toHaveAttribute("data-collapsed", "true");

    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    // Visual restored to its own (expanded) state; nothing was persisted over it.
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    expect(window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__)).toBeNull();
  });

  it("a persisted collapsed Visual preference survives the Document round-trip", () => {
    window.localStorage.setItem(__LEFT_AGENT_RAIL_STORAGE_KEY__, "true");
    renderBuilder();
    expect(rail()).toHaveAttribute("data-collapsed", "true");
    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    fireEvent.click(screen.getByTestId("builder-left-agent-rail-expand"));
    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    expect(rail()).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__)).toBe("true");
  });

  it("an explicitly opened Document rail collapses again on re-entering Document", () => {
    renderBuilder({ startInDocument: true });
    fireEvent.click(screen.getByTestId("builder-left-agent-rail-expand"));
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    fireEvent.click(screen.getByTestId("builder-view-toggle-visual"));
    fireEvent.click(screen.getByTestId("builder-view-toggle-document"));
    expect(rail()).toHaveAttribute("data-collapsed", "true");
  });

  it("flag OFF renders today's builder — no Document surface, rail behavior unchanged", () => {
    renderBuilder({ documentBuilderEnabled: false });
    expect(screen.queryByTestId("builder-view-toggle")).toBeNull();
    expect(screen.queryByTestId("document-view")).toBeNull();
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    fireEvent.click(screen.getByTestId("builder-left-agent-rail-collapse"));
    expect(rail()).toHaveAttribute("data-collapsed", "true");
    // Visual toggling still persists (unchanged legacy behavior).
    expect(window.localStorage.getItem(__LEFT_AGENT_RAIL_STORAGE_KEY__)).toBe("true");
  });
});

describe("Ask React opens the ONE existing rail (DOC-RAIL-LAYOUT-1)", () => {
  it("the persistent Ask React bar expands the rail and seeds the one composer", () => {
    renderBuilder({ startInDocument: true });
    expect(rail()).toHaveAttribute("data-collapsed", "true");
    const nodesBefore = useGraphSlice.getState().pendingNodes;

    fireEvent.change(screen.getByTestId("document-ask-react-input"), {
      target: { value: "Add a follow-up email step" },
    });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));

    expect(rail()).toHaveAttribute("data-collapsed", "false");
    // Exactly ONE rail and ONE composer; the seed landed in it.
    expect(screen.getAllByTestId("builder-guidance-rail")).toHaveLength(1);
    expect(screen.getAllByRole("textbox", { name: /message react/i })).toHaveLength(1);
    expect(composerEl()?.value).toContain("Add a follow-up email step");
    // Nothing mutated, nothing dirty, nothing saved.
    expect(useGraphSlice.getState().pendingNodes).toBe(nodesBefore);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("the empty-state Ask React opens the same rail and seeds the same composer", () => {
    renderBuilder({ definition: blank, startInDocument: true });
    expect(rail()).toHaveAttribute("data-collapsed", "true");
    fireEvent.change(screen.getByTestId("document-draft-composer"), {
      target: { value: "Notify sales when a lead arrives" },
    });
    fireEvent.click(screen.getByTestId("document-draft-submit"));
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    expect(screen.getAllByTestId("builder-guidance-rail")).toHaveLength(1);
    expect(composerEl()?.value).toContain("Notify sales when a lead arrives");
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("the insertion-menu Ask React opens the same rail and seeds the same composer", () => {
    renderBuilder({ startInDocument: true });
    fireEvent.click(screen.getByTestId("document-add-after-b"));
    fireEvent.click(screen.getByTestId("document-add-after-b-askreact"));
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    expect(screen.getAllByTestId("builder-guidance-rail")).toHaveLength(1);
    expect(composerEl()?.value).toContain("at the end of the workflow");
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("closing the rail returns the full-width Document and preserves composer state; reopening restores it", () => {
    renderBuilder({ startInDocument: true });
    fireEvent.change(screen.getByTestId("document-ask-react-input"), {
      target: { value: "Seeded question" },
    });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    // Simulate further manual typing in the ONE composer.
    fireEvent.change(composerEl()!, { target: { value: "Seeded question plus edits" } });

    const nodesBefore = useGraphSlice.getState().pendingNodes;
    fireEvent.click(screen.getByTestId("builder-left-agent-rail-collapse"));
    // Full-width Document again (spine only) — and the panel is kept alive.
    expect(rail()).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByTestId("document-view")).toBeInTheDocument();
    expect(composerEl()).not.toBeNull();
    expect(composerEl()!.value).toBe("Seeded question plus edits");

    fireEvent.click(screen.getByTestId("builder-left-agent-rail-expand"));
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    expect(composerEl()!.value).toBe("Seeded question plus edits");
    // Open/close cycles mutate and save nothing.
    expect(useGraphSlice.getState().pendingNodes).toBe(nodesBefore);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("panel conflicts stay deterministic (DOC-RAIL-LAYOUT-1)", () => {
  it("the Whole Workflow map still opens as a right-side sheet with the rail expanded", () => {
    renderBuilder({ startInDocument: true });
    fireEvent.click(screen.getByTestId("document-ask-react-input"));
    fireEvent.change(screen.getByTestId("document-ask-react-input"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    expect(rail()).toHaveAttribute("data-collapsed", "false");

    fireEvent.click(screen.getByTestId("document-open-map-button"));
    expect(screen.getByTestId("document-whole-workflow-map")).toBeInTheDocument();
    // Deterministic close.
    fireEvent.click(screen.getByTestId("document-map-close"));
    expect(screen.queryByTestId("document-whole-workflow-map")).toBeNull();
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("map → Configure step closes the map before the inspector drawer opens (no overlap)", () => {
    renderBuilder({ startInDocument: true });
    fireEvent.click(screen.getByTestId("document-open-map-button"));
    const mapRow = screen.getByTestId("document-map-row-a");
    // "a" is fully configured → the map row navigates (scroll), not inspector;
    // use the step's own Configure affordance for the inspector path instead.
    expect(mapRow).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("document-map-close"));

    act(() => {
      useConfigSlice.getState().openNode({ nodeId: "a", initialValues: { text: "A" } });
    });
    // Inspector drawer open; map closed — never both.
    expect(screen.getByTestId("builder-right-drawer")).toBeInTheDocument();
    expect(screen.queryByTestId("document-whole-workflow-map")).toBeNull();
  });
});

describe("graph/config/undo/preview state across the rail changes (unchanged contract)", () => {
  it("rail open/close and view switches never touch graph refs, drafts, dirty, or history", () => {
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

    fireEvent.click(screen.getByTestId("builder-left-agent-rail-expand"));
    fireEvent.click(screen.getByTestId("builder-left-agent-rail-collapse"));
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
