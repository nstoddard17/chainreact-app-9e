/**
 * Rail treatment for a React Agent EDIT preview (HERMES-AGENT-RAIL-NO-MANUAL-CANVAS-PUSH).
 *
 * A valid edit auto-shows on the canvas as a diff graph and the top preview bar owns Apply/Discard, so
 * the rail is conversation/help only:
 *   - NO "Show on canvas" button in any state (auto-show replaced it).
 *   - a lightweight, humanized "Still needs" hint when fields are missing.
 *   - an actionable ERROR line (not a button) only when auto-show was attempted but the canvas still
 *     isn't showing the preview.
 *   - never the old bordered "Proposed change" card, and never internal ids/refs/JSON.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidanceEditPreviewHint, PREVIEW_AUTOSHOW_FAILED_MESSAGE } from "@/features/workflows/GuidanceSuggestionSections";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { DRAFT_PREVIEW_NOTICE } from "@/contracts/workflowPlanPreview";

const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/api/workflowTemplates", () => ({ useTemplate: jest.fn(), TemplateApiError: class extends Error {} }));

import { WorkflowGuidancePanel } from "@/features/workflows/WorkflowGuidancePanel";

const editPreview: DraftPreview = {
  version: 1,
  title: "Proposed change",
  summary: "Replace the Slack Send Channel Message step with a Gmail Send Email step",
  nodes: [
    { previewId: "t1", role: "trigger", provider: "native", type: "manual.run", label: "native:manual.run", purpose: "", notApplied: true },
    { previewId: "email-1", role: "action", provider: "gmail", type: "send_email", label: "gmail:send_email", purpose: "", missingInputs: ["to"], notApplied: true },
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

describe("GuidanceEditPreviewHint — no manual canvas-push control", () => {
  it("never renders a 'Show on canvas' button — in any state", () => {
    for (const props of [
      { isDisplayedOnCanvas: true },
      { isDisplayedOnCanvas: false },
      { isDisplayedOnCanvas: false, autoShowFailed: true },
    ] as const) {
      const { unmount } = render(<GuidanceEditPreviewHint preview={editPreview} {...props} />);
      expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
      expect(screen.queryByText(/^Show on canvas$/)).toBeNull();
      unmount();
    }
  });

  it("shows a humanized 'Still needs' hint while displayed (no error, no button, no bordered card)", () => {
    render(<GuidanceEditPreviewHint preview={editPreview} isDisplayedOnCanvas />);
    expect(screen.getByTestId("workflow-guidance-preview-needs")).toHaveTextContent("Still needs: To");
    expect(screen.queryByTestId("workflow-guidance-preview-error")).toBeNull();
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
    expect(screen.queryByTestId("workflow-guidance-preview")).toBeNull(); // no bordered "Proposed change" card
    // No internal ids / op names / provider:type / JSON.
    const text = screen.getByTestId("workflow-guidance-edit-hint").textContent ?? "";
    for (const forbidden of ["gmail:send_email", "removeNode", "addNode", "editVersion", "{", "and its edges are removed"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("renders an actionable error (not a button) when auto-show was attempted but the canvas isn't showing it", () => {
    render(<GuidanceEditPreviewHint preview={editPreview} isDisplayedOnCanvas={false} autoShowFailed />);
    expect(screen.getByTestId("workflow-guidance-preview-error")).toHaveTextContent(PREVIEW_AUTOSHOW_FAILED_MESSAGE);
    expect(screen.getByTestId("workflow-guidance-preview-error").textContent).toMatch(/Ask React to try again/i);
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
  });

  it("renders nothing when displayed with no missing inputs", () => {
    const clean: DraftPreview = { ...editPreview, nodes: editPreview.nodes.map((n) => ({ ...n, missingInputs: undefined })) };
    const { container } = render(<GuidanceEditPreviewHint preview={clean} isDisplayedOnCanvas />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WorkflowGuidancePanel — edit preview rail (auto-show, no manual button)", () => {
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
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "change slack message to gmail send email");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    return user;
  }

  it("EXACT screenshot state: active edit preview shows 'Still needs: To' + summary, NEVER 'Show on canvas'", async () => {
    await sendEdit({ isPreviewDisplayed: true, displayedPreviewSignature: null });
    expect(await screen.findByText(/I'll replace the Slack step with a Gmail Send Email step/i)).toBeInTheDocument();
    expect(screen.getByTestId("workflow-guidance-preview-needs")).toHaveTextContent("Still needs: To");
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
    expect(screen.queryByText(/^Show on canvas$/)).toBeNull();
    expect(screen.queryByTestId("workflow-guidance-preview")).toBeNull();
    // No internal ids/refs/JSON in the transcript.
    const transcript = screen.getByTestId("workflow-guidance-messages").textContent ?? "";
    expect(transcript).not.toMatch(/proposedDefinition|removeNode|editVersion|provider:|\{/i);
  });

  it("a valid edit still AUTO-SHOWS on the canvas (onPreviewToCanvas called with plan + preview + proposedDefinition)", async () => {
    const onPreviewToCanvas = jest.fn();
    await sendEdit({ onPreviewToCanvas, isPreviewDisplayed: true });
    await waitFor(() => expect(onPreviewToCanvas).toHaveBeenCalled());
    expect(onPreviewToCanvas.mock.calls[0]![0]).toMatchObject({ plan: editPlan, preview: editPreview, proposedDefinition });
    // …and there is no manual re-show button.
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
  });

  it("auto-show FAILURE → an actionable error line (not a button) when the canvas still isn't showing it", async () => {
    // onPreviewToCanvas is wired but does not flip isPreviewDisplayed (canvas didn't open) → failure.
    await sendEdit({ onPreviewToCanvas: jest.fn(), isPreviewDisplayed: false, displayedPreviewSignature: null });
    expect(await screen.findByTestId("workflow-guidance-preview-error")).toHaveTextContent(PREVIEW_AUTOSHOW_FAILED_MESSAGE);
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
  });
});
