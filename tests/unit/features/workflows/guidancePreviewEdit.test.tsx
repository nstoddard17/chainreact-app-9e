/**
 * Rail treatment for a React Agent EDIT preview (HERMES-AGENT-RAIL-EDIT-PREVIEW-NO-CARD).
 *
 * The canvas now renders an edit preview directly as a diff graph, and the top preview control bar owns
 * Apply preview / Discard preview. So the rail must NOT duplicate the old bordered "Proposed change"
 * card or its primary "Show on canvas" control:
 *   - while the edit preview is displayed on the canvas → the rail shows the conversation summary ONLY;
 *   - once it's gone (auto-show failed / discarded / superseded) → a lightweight setup-hint + a
 *     SECONDARY "Show on canvas" recovery affordance is offered, still with no bordered card.
 *
 * New-workflow skeleton previews (no `proposedDefinition`) keep the full "Draft preview" card — that
 * path is unchanged and covered in `WorkflowGuidancePanel.test.tsx`.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidanceEditPreviewHint } from "@/features/workflows/GuidanceSuggestionSections";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { DRAFT_PREVIEW_NOTICE } from "@/contracts/workflowPlanPreview";

const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/api/workflowTemplates", () => ({ useTemplate: jest.fn(), TemplateApiError: class extends Error {} }));

import { WorkflowGuidancePanel } from "@/features/workflows/WorkflowGuidancePanel";
import { draftPreviewSignature } from "@/core/workflows/canvasPreviewEligibility";

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

const editPlan = {
  schemaVersion: 1,
  title: "Proposed change",
  summary: "",
  notApplied: true as const,
  steps: [
    { ref: "t1", role: "trigger" as const, provider: "native", type: "manual.run", purpose: "" },
    { ref: "email-1", role: "action" as const, provider: "gmail", type: "send_email", purpose: "" },
  ],
};
const proposedDefinition = {
  nodes: [
    { id: "t1", kind: "trigger" as const, provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
    { id: "email-1", kind: "action" as const, provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } },
  ],
  edges: [{ id: "e1", from: "t1", to: "email-1" }],
};

describe("GuidanceEditPreviewHint — lightweight rail treatment (no 'Proposed change' card)", () => {
  it("renders NOTHING while the edit preview is displayed on the canvas (conversation summary only)", () => {
    const { container } = render(
      <GuidanceEditPreviewHint preview={editPreview} plan={editPlan} isDisplayedOnCanvas onShowOnCanvas={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
    expect(screen.queryByTestId("workflow-guidance-preview-needs")).toBeNull();
  });

  it("when NOT displayed, offers a lightweight setup-hint + a SECONDARY 'Show on canvas' (no bordered card, no Apply)", () => {
    const onShowOnCanvas = jest.fn();
    render(
      <GuidanceEditPreviewHint preview={editPreview} plan={editPlan} isDisplayedOnCanvas={false} onShowOnCanvas={onShowOnCanvas} />,
    );
    // Field keys are HUMANIZED ("to" → "To"), never raw schema keys.
    expect(screen.getByTestId("workflow-guidance-preview-needs")).toHaveTextContent("Still needs: To, Subject, Body");
    expect(screen.getByTestId("workflow-guidance-show-on-canvas")).toBeInTheDocument();
    // No bordered "Proposed change" card, no per-step provider:type list / Flow line, no primary Apply.
    expect(screen.queryByTestId("workflow-guidance-preview")).toBeNull();
    expect(screen.queryByText(/^Proposed change$/)).toBeNull();
    expect(screen.queryByTestId("workflow-guidance-preview-flow")).toBeNull();
    expect(screen.queryByText(/^Apply preview$/i)).toBeNull();
    // No internal ids / edit-version / operation names / provider:type keys / raw JSON.
    const text = screen.getByTestId("workflow-guidance-edit-recovery").textContent ?? "";
    for (const forbidden of ["gmail:send_email", "removeNode", "addNode", "editVersion", "{", "and its edges are removed"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("renders nothing when not displayed, no missing inputs, and no re-show wired", () => {
    const cleanPreview: DraftPreview = { ...editPreview, nodes: editPreview.nodes.map((n) => ({ ...n, missingInputs: undefined })) };
    const { container } = render(<GuidanceEditPreviewHint preview={cleanPreview} plan={null} isDisplayedOnCanvas={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WorkflowGuidancePanel — edit preview rail (active vs recovery)", () => {
  beforeEach(() => mockRequest.mockReset());

  const editResponse = {
    ok: true,
    guidanceText: "I'll replace the Slack step with a Gmail Send Email step. Review the preview below, then choose Apply preview if it looks right.",
    source: "hermes-agent",
    workflowPlan: editPlan,
    previewDraft: editPreview,
    proposedDefinition,
  };

  async function sendEdit(extraProps: Record<string, unknown>) {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue(editResponse);
    render(
      <WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational onPreviewToCanvas={jest.fn()} {...extraProps} />,
    );
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "change it to email");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    return user;
  }

  it("active edit preview (signature matches) hides the 'Proposed change' card AND 'Show on canvas', keeping the conversation summary", async () => {
    await sendEdit({ displayedPreviewSignature: draftPreviewSignature(editPreview) });
    // The conversational assistant summary still renders.
    expect(await screen.findByText(/I'll replace the Slack step with a Gmail Send Email step/i)).toBeInTheDocument();
    // No bordered "Proposed change" card and no redundant primary "Show on canvas".
    expect(screen.queryByTestId("workflow-guidance-preview")).toBeNull();
    expect(screen.queryByText(/^Proposed change$/)).toBeNull();
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
  });

  it("recovery: when no preview is displayed, offers the secondary 'Show on canvas' with a humanized hint (still no card)", async () => {
    await sendEdit({ displayedPreviewSignature: null });
    expect(await screen.findByText(/I'll replace the Slack step with a Gmail Send Email step/i)).toBeInTheDocument();
    // Secondary re-show + lightweight, HUMANIZED setup hint, but never the bordered "Proposed change" card.
    expect(await screen.findByTestId("workflow-guidance-show-on-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-guidance-preview-needs")).toHaveTextContent("Still needs: To, Subject, Body");
    expect(screen.queryByTestId("workflow-guidance-preview")).toBeNull();
  });

  it("does NOT offer 'Show on canvas' when SOME preview is on the canvas (edits auto-show; recovery only when nothing is visible)", async () => {
    // A non-null displayed signature means a preview IS on the canvas — for an auto-shown edit that is
    // this edit, so the rail must not offer a redundant re-show even if signatures differ.
    await sendEdit({ displayedPreviewSignature: "some-other-displayed-preview" });
    expect(await screen.findByText(/I'll replace the Slack step with a Gmail Send Email step/i)).toBeInTheDocument();
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
    expect(screen.queryByTestId("workflow-guidance-edit-recovery")).toBeNull();
  });

  it("recovery 'Show on canvas' hands BOTH the validated plan and the display preview to the canvas overlay", async () => {
    const user = userEvent.setup();
    const onPreviewToCanvas = jest.fn();
    mockRequest.mockResolvedValue(editResponse);
    render(
      <WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational onPreviewToCanvas={onPreviewToCanvas} displayedPreviewSignature={null} />,
    );
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "change it to email");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    // (Auto-show may fire once on arrival; this asserts the MANUAL recovery re-show works.)
    await user.click(await screen.findByTestId("workflow-guidance-show-on-canvas"));
    await waitFor(() => expect(onPreviewToCanvas).toHaveBeenCalled());
    const lastCall = onPreviewToCanvas.mock.calls.at(-1)!;
    expect(lastCall[0]).toMatchObject({
      plan: editPlan,
      preview: editPreview,
      proposedDefinition,
    });
  });
});
