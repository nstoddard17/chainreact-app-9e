/**
 * Document React-Agent preview RENDER (5.DUAL-BUILDER-1 / CS-6).
 *
 * The ghost preview is READ-ONLY: rendering it never mutates graphSlice, never
 * marks dirty, never saves. Apply / Reject route through the injected canonical
 * handlers (owned by useBuilderPreview). Proves additive ghosts render, an edit
 * proposal shows tracked changes, and Apply/Reject call the right handler.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { WorkflowDefinition } from "@/contracts/workflow";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { DocumentView } from "@/features/workflow-builder/document/DocumentView";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

const live: WorkflowDefinition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "hi" }, position: { x: 0, y: 120 } },
  ],
  edges: [{ id: "e1", from: "t", to: "a" }],
};

const additivePreview: DraftPreview = {
  version: 1, title: "Notify sales", summary: "Add a Slack notification.",
  notice: "Preview only — your workflow has not changed.", notApplied: true,
  nodes: [
    { previewId: "p1", role: "action", provider: "slack", type: "send_channel_message", label: "Slack", purpose: "Notify sales", notApplied: true },
  ],
  edges: [],
};

function renderView(previewOverlay: { preview: DraftPreview; proposedDefinition?: WorkflowDefinition } | null, handlers?: { onApply?: () => void; onDiscard?: () => void }) {
  return render(
    <DocumentView
      onGuidedStopActive={() => {}}
      previewOverlay={previewOverlay}
      onApplyPreview={handlers?.onApply ?? (() => {})}
      onDiscardPreview={handlers?.onDiscard ?? (() => {})}
    />,
  );
}

beforeEach(() => {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf", live);
});

describe("ghost preview render", () => {
  it("renders additive ghost steps and the not-changed notice WITHOUT mutating the graph", () => {
    const before = useGraphSlice.getState().pendingNodes;
    renderView({ preview: additivePreview });
    expect(screen.getByTestId("document-preview")).toHaveAttribute("data-preview-kind", "additive");
    expect(screen.getByTestId("document-preview-ghost-p1")).toHaveTextContent("Notify sales");
    expect(screen.getByTestId("document-preview-notice")).toHaveTextContent("has not changed");
    // Rendering the preview mutated nothing.
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("Apply calls the canonical apply handler; Reject calls discard", () => {
    const onApply = jest.fn();
    const onDiscard = jest.fn();
    renderView({ preview: additivePreview }, { onApply, onDiscard });
    fireEvent.click(screen.getByTestId("document-preview-apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("document-preview-reject"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    // Neither handler is invoked implicitly by rendering.
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("renders an edit proposal as tracked changes (added / changed / removed)", () => {
    const proposed: WorkflowDefinition = {
      nodes: [
        { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
        // 'a' changed; 'z' added; original 'a' stays (modified), nothing removed here.
        { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "CHANGED" }, position: { x: 0, y: 120 } },
        { id: "z", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 240 } },
      ],
      edges: [
        { id: "e1", from: "t", to: "a" },
        { id: "e2", from: "a", to: "z" },
      ],
    };
    renderView({ preview: { ...additivePreview, nodes: [], edges: [] }, proposedDefinition: proposed });
    expect(screen.getByTestId("document-preview")).toHaveAttribute("data-preview-kind", "edit");
    expect(screen.getByTestId("document-preview-row-a")).toHaveAttribute("data-status", "modified");
    expect(screen.getByTestId("document-preview-row-z")).toHaveAttribute("data-status", "added");
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("shows no preview and the normal Document when there is no overlay", () => {
    renderView(null);
    expect(screen.queryByTestId("document-preview")).toBeNull();
    expect(screen.getByTestId("document-view")).toBeInTheDocument();
  });
});
