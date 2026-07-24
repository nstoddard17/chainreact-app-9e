/**
 * DOC-FINAL-ACCEPTANCE-1 — center Document destructive-preview confirmation.
 *
 * A destructive proposal (removes steps/connections) must NOT apply on a single
 * click: the center Apply is visibly destructive and opens the shared
 * confirmation; Cancel leaves everything unchanged (no onApply, focus returns to
 * Apply); Confirm calls the SAME governed apply handler exactly once. A
 * non-destructive proposal keeps the normal one-click Apply. Rendering a preview
 * never mutates the graph or dirties it.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { WorkflowDefinition } from "@/contracts/workflow";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { DocumentView } from "@/features/workflow-builder/document/DocumentView";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { classifyDestructivePreview } from "@/core/workflows/destructivePreview";

const live: WorkflowDefinition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "A" }, position: { x: 0, y: 120 } },
    { id: "b", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "B" }, position: { x: 0, y: 240 } },
  ],
  edges: [
    { id: "e-ta", from: "t", to: "a" },
    { id: "e-ab", from: "a", to: "b" },
  ],
};

// Proposal that REMOVES step "b" → destructive.
const destructiveProposed: WorkflowDefinition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "A" }, position: { x: 0, y: 120 } },
  ],
  edges: [{ id: "e-ta", from: "t", to: "a" }],
};

// Proposal that only ADDS a step → non-destructive.
const additiveEditProposed: WorkflowDefinition = {
  nodes: [
    ...live.nodes,
    { id: "z", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 360 } },
  ],
  edges: [...live.edges, { id: "e-bz", from: "b", to: "z" }],
};

const basePreview: DraftPreview = {
  version: 1, title: "Remove a step", summary: "Removes the second Slack message.",
  notice: "Preview only — your workflow has not changed.", notApplied: true,
  nodes: [], edges: [],
};

function destructiveFor(proposed: WorkflowDefinition) {
  return classifyDestructivePreview({
    liveNodes: useGraphSlice.getState().pendingNodes,
    liveEdges: useGraphSlice.getState().pendingEdges,
    proposedDefinition: proposed,
  });
}

function renderView(
  proposed: WorkflowDefinition,
  handlers?: { onApply?: () => void; onDiscard?: () => void },
) {
  return render(
    <DocumentView
      onGuidedStopActive={() => {}}
      previewOverlay={{ preview: basePreview, proposedDefinition: proposed }}
      previewDestructive={destructiveFor(proposed)}
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

describe("center destructive preview — confirmation gate", () => {
  it("marks the preview destructive and does NOT apply on the first click", () => {
    const onApply = jest.fn();
    renderView(destructiveProposed, { onApply });

    const preview = screen.getByTestId("document-preview");
    expect(preview).toHaveAttribute("data-destructive", "true");
    const applyBtn = screen.getByTestId("document-preview-apply");
    expect(applyBtn).toHaveAttribute("data-destructive", "true");
    expect(applyBtn).toHaveTextContent("Apply removal");
    // Consequence stated in text.
    expect(screen.getByTestId("document-preview-destructive-note")).toHaveTextContent(/Removes 1 step/);

    fireEvent.click(applyBtn);
    // No apply yet — the confirmation is now shown instead.
    expect(onApply).not.toHaveBeenCalled();
    const confirm = screen.getByTestId("document-preview-destructive-confirm");
    expect(confirm).toHaveAttribute("role", "alertdialog");
    expect(confirm).toHaveAccessibleName("Apply destructive change?");
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("Cancel dismisses the confirmation and applies nothing", () => {
    const onApply = jest.fn();
    renderView(destructiveProposed, { onApply });
    fireEvent.click(screen.getByTestId("document-preview-apply"));
    fireEvent.click(screen.getByTestId("document-preview-destructive-cancel"));
    expect(onApply).not.toHaveBeenCalled();
    // Back to the preview with the Apply control available again.
    expect(screen.getByTestId("document-preview-apply")).toBeInTheDocument();
    expect(screen.queryByTestId("document-preview-destructive-confirm")).toBeNull();
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("Confirm calls the SAME governed apply handler exactly once", () => {
    const onApply = jest.fn();
    renderView(destructiveProposed, { onApply });
    fireEvent.click(screen.getByTestId("document-preview-apply"));
    fireEvent.click(screen.getByTestId("document-preview-destructive-accept"));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("a non-destructive edit keeps the normal one-click Apply", () => {
    const onApply = jest.fn();
    renderView(additiveEditProposed, { onApply });
    const preview = screen.getByTestId("document-preview");
    expect(preview).toHaveAttribute("data-destructive", "false");
    const applyBtn = screen.getByTestId("document-preview-apply");
    expect(applyBtn).toHaveTextContent("Apply to draft");
    fireEvent.click(applyBtn);
    // One click applies directly — no confirmation gate.
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("document-preview-destructive-confirm")).toBeNull();
  });
});
