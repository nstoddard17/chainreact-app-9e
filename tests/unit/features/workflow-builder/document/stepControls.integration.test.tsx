/**
 * DOC-STEP-CONTROLS-1 — discoverable step management on the Document surface.
 *
 * Locks the behaviour this slice changed, over the REAL WorkflowBuilder in
 * Document view (same shared graphSlice, no second state container):
 *   - the marker rail carries ONLY the "When" marker / step numbers — the
 *     unlabeled select control that used to overlap it is gone, and workflow
 *     lifecycle (Draft / Active / Paused) stays in the builder header;
 *   - insertion affordances and the per-step overflow are ALWAYS rendered and
 *     never hover-gated (discoverable without hover), keyboard reachable, and
 *     carry accessible names;
 *   - grouping is presentation-only, is reached from the step overflow menu,
 *     names itself on creation, and EXISTING stored section data still loads,
 *     renders, collapses, renames, and ungroups without touching nodes/edges.
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
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...a: unknown[]) => mockFetchOptionsSource(...a),
  OptionsApiError: class extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));
const slack = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message.",
  category: "messaging",
  requiresIntegration: true,
  displayOrder: 10,
  fields: [
    { name: "channel", label: "Channel", type: "combobox", required: true, optionsSource: "slack:channels" },
    { name: "text", label: "Message", type: "textarea", required: true },
  ],
  outputs: [],
};
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [],
  listNativeTriggers: async () => [],
  listAiActions: async () => [],
  listProviderActions: async (p: string) => (p === "slack" ? [slack] : []),
  listProviderTriggers: async () => [],
  DiscoveryApiError: class extends Error {
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
import { NEW_GROUP_TITLE } from "@/features/workflow-builder/document/DocumentView";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";

const definition = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 0, y: 100 } },
    { id: "b", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 0, y: 200 } },
  ],
  edges: [
    { id: "e1", from: "t", to: "a" },
    { id: "e2", from: "a", to: "b" },
  ],
};
const workflow: WorkflowDetail = {
  id: "wf-steps", name: "Weekly analytics report", state: "draft", disabledReason: null, disabledContext: null,
  activeRevisionId: null, draftDefinition: definition, deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z",
};
const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    requiredFields: [{ name: "channel", label: "Channel" }, { name: "text", label: "Message" }],
  },
};
const summaryFieldsByType: NodeSummaryFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", fields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    fields: [
      { name: "channel", label: "Channel", type: "combobox", required: true, optionsSource: "slack:channels" },
      { name: "text", label: "Message", type: "textarea", required: true },
    ],
  },
};
const providers = [{ id: "hubspot", displayName: "HubSpot" }, { id: "slack", displayName: "Slack" }];

function renderDoc(def: WorkflowDetail["draftDefinition"] = definition) {
  window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
  return render(
    <WorkflowBuilder
      workflow={{ ...workflow, draftDefinition: def }}
      triggerProviders={providers}
      actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType}
      summaryFieldsByType={summaryFieldsByType}
      documentBuilderEnabled
    />,
  );
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockFetchOptionsSource.mockReset().mockResolvedValue({ options: [{ value: "C1", label: "#general" }] });
  window.localStorage.clear();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

const g = () => useGraphSlice.getState();
/** True when an element (or an ancestor) is only painted on hover. */
const isHoverGated = (el: HTMLElement | null): boolean => {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const cls = node.className;
    if (typeof cls === "string" && (/\bopacity-0\b/.test(cls) || /group-hover/.test(cls))) return true;
  }
  return false;
};

describe("marker rail carries only reading-order markers", () => {
  it("renders no select/toggle control inside the sentence marker rail", () => {
    renderDoc();
    for (const nodeId of ["t", "a", "b"]) {
      const sentence = screen.getByTestId(`document-sentence-${nodeId}`);
      const rail = sentence.firstElementChild as HTMLElement;
      expect(rail.querySelectorAll("button, input, [role='checkbox'], [role='switch']")).toHaveLength(0);
    }
    // The whole Document surface has no switch/checkbox control at all.
    const view = screen.getByTestId("document-view");
    expect(view.querySelectorAll("[role='switch'], [role='checkbox'], input[type='checkbox']")).toHaveLength(0);
  });

  it("keeps the trigger and action markers on ONE fixed-width rail column (alignment)", () => {
    renderDoc();
    const railWidths = ["t", "a", "b"].map((id) => {
      const rail = screen.getByTestId(`document-sentence-${id}`).firstElementChild as HTMLElement;
      return rail.className;
    });
    // Same rail geometry class on every step, trigger included.
    expect(new Set(railWidths).size).toBe(1);
    expect(railWidths[0]).toContain("w-11");
  });

  it("leaves workflow-level Draft/Active/Paused control in the builder header", () => {
    renderDoc();
    // Draft workflow → the header lifecycle cluster offers Activate, and the
    // header states the REAL lifecycle state; the Document surface itself
    // exposes no lifecycle control.
    const header = screen.getByTestId("builder-header");
    expect(within(header).getByText("Activate")).toBeInTheDocument();
    const state = within(header).getByTestId("builder-header-workflow-state");
    expect(state).toHaveAttribute("data-workflow-state", "draft");
    expect(state).toHaveTextContent("draft");
    expect(within(screen.getByTestId("document-view")).queryByText(/Activate|Pause|Resume/)).toBeNull();
  });

  it("reflects a paused workflow's real state in the header (not a hard-coded 'draft')", () => {
    window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
    render(
      <WorkflowBuilder
        workflow={{ ...workflow, state: "paused" }}
        triggerProviders={providers}
        actionProviders={providers}
        requiredFieldsByType={requiredFieldsByType}
        summaryFieldsByType={summaryFieldsByType}
        documentBuilderEnabled
      />,
    );
    const header = screen.getByTestId("builder-header");
    const state = within(header).getByTestId("builder-header-workflow-state");
    expect(state).toHaveAttribute("data-workflow-state", "paused");
    expect(state).toHaveTextContent("paused");
    expect(within(header).getByText("Resume")).toBeInTheDocument();
  });

  it("exposes no per-step enable/disable control (V2 has no per-step disable)", () => {
    renderDoc();
    fireEvent.click(screen.getByTestId("document-step-menu-a"));
    const menu = screen.getByTestId("document-step-menu-a-menu");
    expect(within(menu).queryByText(/Disable|Enable/)).toBeNull();
  });
});

describe("step controls are discoverable without hover", () => {
  it("renders an always-visible overflow button with an accessible name on every step", () => {
    renderDoc();
    for (const [nodeId, name] of [["t", "the trigger"], ["a", "step 1"], ["b", "step 2"]] as const) {
      const button = screen.getByTestId(`document-step-menu-${nodeId}`);
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-label", `Actions for ${name}`);
      expect(button).toHaveAttribute("aria-haspopup", "menu");
      expect(isHoverGated(button)).toBe(false);
    }
  });

  it("renders an always-visible insertion affordance between the trigger and each action, and at the tail", () => {
    renderDoc();
    // Trigger → action 1, action 1 → action 2, and the tail after action 2.
    for (const testId of ["document-insert-after-t", "document-insert-after-a", "document-add-after-b"]) {
      const button = screen.getByTestId(testId);
      expect(button).toBeInTheDocument();
      expect(isHoverGated(button)).toBe(false);
    }
    // The label is present at all times (collapsed visually, not removed), so
    // the accessible name never depends on hover.
    expect(screen.getByTestId("document-insert-after-t")).toHaveAttribute("aria-label", "Add a step here");
    expect(screen.getByTestId("document-add-after-b")).toHaveAttribute("aria-label", "Add a step");
    expect(screen.getByTestId("document-add-after-b")).toHaveTextContent("Add a step");
  });

  it("keeps the sentence itself the primary way to configure a step", async () => {
    renderDoc();
    // The step TITLE inside the sentence is the configure target (no hover-only
    // "⚙ Configure step" button any more).
    const title = screen.getByTestId("document-configure-step-a");
    expect(title.tagName).toBe("BUTTON");
    expect(isHoverGated(title)).toBe(false);
    fireEvent.click(title);
    await screen.findByTestId("builder-right-drawer");
    expect(useConfigSlice.getState().activeNodeId).toBe("a");
  });
});

describe("step overflow menu — keyboard + commands", () => {
  it("opens with ArrowDown, roves with arrows, and closes with Escape", () => {
    renderDoc();
    const trigger = screen.getByTestId("document-step-menu-a");
    expect(screen.queryByTestId("document-step-menu-a-menu")).toBeNull();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = screen.getByTestId("document-step-menu-a-menu");
    expect(menu).toHaveAttribute("role", "menu");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTestId("document-step-configure-a"));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(screen.getByTestId("document-step-delete-a"));

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByTestId("document-step-menu-a-menu")).toBeNull();
  });

  it("marks Select step as a checkable menu item and toggles the shared selection", () => {
    renderDoc();
    fireEvent.click(screen.getByTestId("document-step-menu-a"));
    const select = screen.getByTestId("document-select-a");
    expect(select).toHaveAttribute("role", "menuitemcheckbox");
    expect(select).toHaveAttribute("aria-checked", "false");
    fireEvent.click(select);
    expect(screen.getByTestId("document-selection-count")).toHaveTextContent("1 selected");

    fireEvent.click(screen.getByTestId("document-step-menu-a"));
    expect(screen.getByTestId("document-select-a")).toHaveAttribute("aria-checked", "true");
  });

  it("duplicates a step through the canonical command without saving", async () => {
    renderDoc();
    fireEvent.click(screen.getByTestId("document-step-menu-a"));
    fireEvent.click(screen.getByTestId("document-step-duplicate-a"));
    await waitFor(() => expect(g().pendingNodes).toHaveLength(4));
    expect(g().isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("moves a step through the canonical swap command (topology, not presentation)", async () => {
    renderDoc();
    fireEvent.click(screen.getByTestId("document-step-menu-a"));
    fireEvent.click(screen.getByTestId("document-step-move-later-a"));
    await waitFor(() => {
      const order = g().pendingEdges.find((e) => e.from === "t");
      expect(order?.to).toBe("b");
    });
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("refuses to duplicate the trigger with plain-language copy (no throw)", () => {
    renderDoc();
    fireEvent.click(screen.getByTestId("document-step-menu-t"));
    // The trigger's menu never offers duplicate/move at all.
    expect(screen.queryByTestId("document-step-duplicate-t")).toBeNull();
    expect(screen.queryByTestId("document-step-move-earlier-t")).toBeNull();
  });

  it("confirms before a destructive delete and leaves the graph alone on cancel", () => {
    renderDoc();
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    const before = g().pendingNodes;
    fireEvent.click(screen.getByTestId("document-step-menu-a"));
    fireEvent.click(screen.getByTestId("document-step-delete-a"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(g().pendingNodes).toBe(before);
    confirmSpy.mockRestore();
  });
});

describe("grouping (presentation-only) replaces the old Section affordance", () => {
  it("offers no '+ Section' rail affordance any more", () => {
    renderDoc();
    const view = screen.getByTestId("document-view");
    expect(within(view).queryByText("＋ Section")).toBeNull();
    expect(within(view).queryByText(/New section/)).toBeNull();
  });

  it("creating a group names itself, explains it is organizational, and never touches nodes/edges", () => {
    renderDoc();
    const nodesRef = g().pendingNodes;
    const edgesRef = g().pendingEdges;
    fireEvent.click(screen.getByTestId("document-step-menu-a"));
    fireEvent.click(screen.getByTestId("document-wrap-section-a"));

    const id = g().pendingPresentation!.sections[0]!.id;
    expect(g().pendingPresentation!.sections[0]!.title).toBe(NEW_GROUP_TITLE);
    // Opens straight into naming — never an unexplained default card.
    const input = screen.getByTestId(`document-section-title-input-${id}`);
    expect(input).toHaveValue(NEW_GROUP_TITLE);
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Weekly reporting" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(g().pendingPresentation!.sections[0]!.title).toBe("Weekly reporting");

    // The standing "organization, not execution" explanation is visible.
    expect(screen.getByTestId(`document-section-note-${id}`)).toHaveTextContent(
      /doesn’t change the order your steps run in/,
    );
    // Execution data is untouched; nothing was saved.
    expect(g().pendingNodes).toBe(nodesRef);
    expect(g().pendingEdges).toBe(edgesRef);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("a grouped step can be moved back out from its own overflow menu", () => {
    renderDoc();
    fireEvent.click(screen.getByTestId("document-step-menu-a"));
    fireEvent.click(screen.getByTestId("document-wrap-section-a"));
    const id = g().pendingPresentation!.sections[0]!.id;
    fireEvent.keyDown(screen.getByTestId(`document-section-title-input-${id}`), { key: "Escape" });

    fireEvent.click(screen.getByTestId("document-step-menu-a"));
    fireEvent.click(screen.getByTestId("document-step-remove-from-group-a"));
    expect(g().pendingPresentation).toBeNull();
    expect(g().pendingNodes.map((n) => n.id)).toEqual(["t", "a", "b"]);
  });
});

describe("existing stored section data keeps working (no migration required)", () => {
  const withSection = {
    ...definition,
    presentation: {
      version: 1 as const,
      sections: [{ id: "sec-legacy", title: "Qualify & route", nodeIds: ["a", "b"] }],
    },
  };

  it("loads a legacy presentation block and renders it as a labelled group", () => {
    renderDoc(withSection);
    expect(g().pendingPresentation!.sections[0]!.title).toBe("Qualify & route");
    const header = screen.getByTestId("document-section-sec-legacy");
    expect(within(header).getByTestId("document-section-title-sec-legacy")).toHaveTextContent("Qualify & route");
    // Labelled as a GROUP, with the organizational explanation.
    expect(within(header).getByText("Group")).toBeInTheDocument();
    expect(within(header).getByTestId("document-section-note-sec-legacy")).toBeInTheDocument();
    // Its member steps still render inside it.
    expect(within(header).getByTestId("document-sentence-a")).toBeInTheDocument();
    expect(within(header).getByTestId("document-sentence-b")).toBeInTheDocument();
  });

  it("collapse / expand and ungroup keep every executable step exactly where it was", () => {
    renderDoc(withSection);
    const nodesRef = g().pendingNodes;
    fireEvent.click(screen.getByTestId("document-section-collapse-sec-legacy"));
    expect(g().pendingPresentation!.sections[0]!.collapsed).toBe(true);
    expect(screen.queryByTestId("document-sentence-a")).toBeNull();
    expect(screen.getByTestId("document-section-collapse-sec-legacy")).toHaveAttribute(
      "aria-label",
      "Expand group Qualify & route",
    );

    fireEvent.click(screen.getByTestId("document-section-collapse-sec-legacy"));
    fireEvent.click(screen.getByTestId("document-section-menu-sec-legacy"));
    fireEvent.click(screen.getByTestId("document-section-ungroup-sec-legacy"));
    expect(g().pendingPresentation).toBeNull();
    expect(g().pendingNodes).toBe(nodesRef);
    expect(g().pendingEdges.map((e) => `${e.from}->${e.to}`)).toEqual(["t->a", "a->b"]);
  });
});
