/**
 * React Agent EDIT-preview rail — calm, conversation-only (HERMES-AGENT-RAIL-CALM).
 *
 * A valid edit auto-shows on the canvas (diff graph) and the top preview bar owns Apply/Discard; setup
 * requirements surface on the canvas node / config panel / guided-setup card. So for an edit turn the
 * rail shows ONLY the conversational assistant summary:
 *   - NO "I couldn't show that preview…" auto-show error (there's no reliable failure signal).
 *   - NO orphaned "Still needs" line under the assistant message.
 *   - NO "Show on canvas" button.
 *   - never internal ids / refs / provider:type / editVersion / operation names / JSON.
 * Invalid/unsupported proposals and clarification turns still render their safe text.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const EDIT_SUMMARY =
  "I'll replace the Slack Send Channel Message step with a Gmail Send Email step. Review the preview below, then choose Apply preview if it looks right.";
const editResponse = { ok: true, guidanceText: EDIT_SUMMARY, source: "hermes-agent", workflowPlan: editPlan, previewDraft: editPreview, proposedDefinition };

async function send(goal: string, extraProps: Record<string, unknown> = {}) {
  const user = userEvent.setup();
  render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational onPreviewToCanvas={jest.fn()} {...extraProps} />);
  await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), goal);
  await user.click(screen.getByTestId("workflow-guidance-submit"));
  return user;
}

describe("WorkflowGuidancePanel — edit-preview rail is calm (summary only)", () => {
  beforeEach(() => mockRequest.mockReset());

  it("EXACT screenshot state: shows the assistant summary, and NO auto-show error / orphaned 'Still needs' / button", async () => {
    mockRequest.mockResolvedValue(editResponse);
    await send("change the send channel message to a gmail send email");
    // Assistant summary stays.
    expect(await screen.findByText(/I'll replace the Slack Send Channel Message step with a Gmail Send Email step/i)).toBeInTheDocument();
    // No scary auto-show failure line.
    expect(screen.queryByTestId("workflow-guidance-preview-error")).toBeNull();
    expect(screen.queryByText(/couldn't show that preview/i)).toBeNull();
    // No orphaned setup line under the assistant message.
    expect(screen.queryByTestId("workflow-guidance-preview-needs")).toBeNull();
    expect(screen.queryByText(/^Still needs:/i)).toBeNull();
    // No manual canvas-push button.
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
    expect(screen.queryByText(/^Show on canvas$/)).toBeNull();
    // No bordered "Proposed change" card.
    expect(screen.queryByTestId("workflow-guidance-preview")).toBeNull();
    // No internal ids / refs / provider:type / editVersion / op names / JSON in the transcript.
    const transcript = screen.getByTestId("workflow-guidance-messages").textContent ?? "";
    expect(transcript).not.toMatch(/proposedDefinition|removeNode|addNode|editVersion|provider:|email-1|\{/i);
  });

  it("a valid edit still AUTO-SHOWS on the canvas (onPreviewToCanvas with plan + preview + proposedDefinition)", async () => {
    const onPreviewToCanvas = jest.fn();
    mockRequest.mockResolvedValue(editResponse);
    await send("change slack to gmail", { onPreviewToCanvas });
    await waitFor(() => expect(onPreviewToCanvas).toHaveBeenCalled());
    expect(onPreviewToCanvas.mock.calls[0]![0]).toMatchObject({ plan: editPlan, preview: editPreview, proposedDefinition });
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
  });

  it("an INVALID / unsupported proposal still renders a safe actionable message (no preview, no button)", async () => {
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "I can't do that — ChainReact doesn't have an email send action for that provider yet.",
      source: "hermes-agent",
      workflowPlan: null,
      previewDraft: null,
    });
    await send("change slack to a carrier-pigeon notification");
    expect(await screen.findByText(/ChainReact doesn't have an email send action/i)).toBeInTheDocument();
    expect(screen.queryByTestId("workflow-guidance-preview-error")).toBeNull();
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
  });

  it("a CLARIFICATION-only turn still renders the question", async () => {
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Which Slack step should I change to email?",
      source: "hermes-agent",
      workflowPlan: null,
      previewDraft: null,
    });
    await send("change the notification to email");
    expect(await screen.findByText(/Which Slack step should I change to email\?/i)).toBeInTheDocument();
    expect(screen.queryByTestId("workflow-guidance-preview-needs")).toBeNull();
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
  });
});
