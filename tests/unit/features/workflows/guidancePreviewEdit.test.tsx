/**
 * Rail preview cleanup for an EDIT proposal (HERMES-AGENT-PREVIEW-DIFF-GRAPH). The rail EXPLAINS the
 * change in plain language only — never machine op counts, raw refs, editVersion, JSON, or a per-step
 * provider:type list. The canvas visualizes the diff; the rail summarizes it.
 */
import { render, screen } from "@testing-library/react";
import { GuidancePreviewSection } from "@/features/workflows/GuidanceSuggestionSections";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { DRAFT_PREVIEW_NOTICE } from "@/contracts/workflowPlanPreview";

const editPreview: DraftPreview = {
  version: 1,
  title: "Proposed change",
  summary: "Replace the Slack Send Channel Message step with a Gmail Send Email step",
  nodes: [
    { previewId: "t1", role: "trigger", provider: "native", type: "manual.run", label: "native:manual.run", purpose: "", notApplied: true },
    { previewId: "email-1", role: "action", provider: "gmail", type: "send_email", label: "gmail:send_email", purpose: "", missingInputs: ["to", "subject", "body"], notApplied: true },
  ],
  edges: [{ previewId: "e1", fromPreviewId: "t1", toPreviewId: "email-1", notApplied: true }],
  notice: DRAFT_PREVIEW_NOTICE,
  notApplied: true,
};

describe("GuidancePreviewSection — edit mode (human summary only)", () => {
  it("shows the human change summary + aggregated 'Still needs', and NO machine details", () => {
    render(<GuidancePreviewSection preview={editPreview} plan={null} isEdit />);
    expect(screen.getByTestId("workflow-guidance-preview-summary").textContent).toMatch(/Replace the Slack.*with a Gmail/i);
    expect(screen.getByTestId("workflow-guidance-preview-needs").textContent).toMatch(/Still needs:\s*to, subject, body/i);
    // No per-step provider:type list, no "Flow:" line.
    expect(screen.queryByTestId("workflow-guidance-preview-flow")).toBeNull();
    const rail = screen.getByTestId("workflow-guidance-preview").textContent ?? "";
    // No internal op counts / refs / provider:type codes / editVersion / JSON leak into the rail.
    for (const forbidden of ["removeNode", "addNode", "addEdge", "×", "editVersion", "node_", "gmail:send_email", "{"]) {
      expect(rail).not.toContain(forbidden);
    }
  });

  it("does NOT render a primary Apply in the rail (only an optional secondary 'Show on canvas')", () => {
    const onPreviewToCanvas = () => {};
    render(<GuidancePreviewSection preview={editPreview} plan={{ schemaVersion: 1, title: "", summary: "", steps: [], notApplied: true }} isEdit onPreviewToCanvas={onPreviewToCanvas} />);
    // The single PRIMARY apply lives in the canvas control bar; the rail control is the re-show only.
    expect(screen.queryByText(/^Apply preview$/i)).toBeNull();
    expect(screen.getByTestId("workflow-guidance-show-on-canvas")).toBeInTheDocument();
  });

  it("a non-edit (new-workflow) preview still shows the proposed-build step list", () => {
    render(<GuidancePreviewSection preview={editPreview} plan={null} />);
    expect(screen.queryByTestId("workflow-guidance-preview-summary")).toBeNull();
    expect(screen.getByTestId("workflow-guidance-preview-flow")).toBeInTheDocument();
  });
});
