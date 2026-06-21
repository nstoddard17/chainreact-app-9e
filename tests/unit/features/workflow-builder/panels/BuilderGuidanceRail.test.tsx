/**
 * BuilderGuidanceRail — the builder left rail is now the single Hermes guidance entry
 * (HERMES-AGENT-REPLACE-BUILDER-AI-PLAN).
 *
 * Proves the visible builder chat rail submits through the ACCOUNT workflow-guidance helper
 * (`requestWorkflowGuidance` → POST /api/accounts/[id]/ai/workflow-guidance) carrying the builder
 * workflowId, renders guidanceText, offers Show on canvas for a previewDraft, and gates safely to an
 * "unavailable" note when guidance is off / no account. It never touches the deprecated plan endpoint
 * (asserted structurally in builder-ai-rail-no-old-endpoint.test.ts).
 */
const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderGuidanceRail } from "@/features/workflow-builder/panels/BuilderGuidanceRail";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";

beforeEach(() => {
  mockRequest.mockReset();
});

describe("BuilderGuidanceRail — gating", () => {
  it("renders the guidance panel + chat input when enabled AND accountId is present", () => {
    render(<BuilderGuidanceRail accountId="acct-1" workflowId="wf-9" guidanceEnabled />);
    expect(screen.getByTestId("builder-guidance-rail")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-guidance-panel")).toBeInTheDocument();
    // HERMES-AGENT-BUILDER-RAIL-CHAT-AVAILABLE — the conversational chat composer must be present.
    expect(screen.getByTestId("workflow-guidance-submit")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe what to add or change/i)).toBeInTheDocument();
    expect(screen.queryByTestId("builder-guidance-rail-unavailable")).not.toBeInTheDocument();
  });

  it("HERMES-AGENT-BUILDER-RAIL-COPY-ACCURACY — uses accurate apply-preview copy, not 'workflow creation' disclaimers", () => {
    render(<BuilderGuidanceRail accountId="acct-1" workflowId="wf-9" guidanceEnabled />);
    // Stale/misleading disclaimers are gone.
    expect(screen.queryByText(/not automatic workflow creation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not workflow creation/i)).not.toBeInTheDocument();
    // New copy describes suggest → preview on canvas → apply to draft, and staying in control.
    const intro = screen.getByText(/I can suggest steps/i);
    expect(intro).toHaveTextContent(/preview on the canvas/i);
    expect(intro).toHaveTextContent(/add them to your draft when you choose Apply/i);
    expect(intro).toHaveTextContent(/stay in control before saving or activating/i);
  });

  it("shows a safe unavailable note (reason: guidance-disabled) when guidance is disabled", () => {
    render(<BuilderGuidanceRail accountId="acct-1" workflowId="wf-9" guidanceEnabled={false} />);
    expect(screen.queryByTestId("workflow-guidance-panel")).not.toBeInTheDocument();
    const note = screen.getByTestId("builder-guidance-rail-unavailable");
    expect(note).toBeInTheDocument();
    expect(note).toHaveAttribute("data-reason", "guidance-disabled");
  });

  it("shows the unavailable note (reason: no-account) when accountId is absent even if enabled", () => {
    render(<BuilderGuidanceRail workflowId="wf-9" guidanceEnabled />);
    expect(screen.queryByTestId("workflow-guidance-panel")).not.toBeInTheDocument();
    const note = screen.getByTestId("builder-guidance-rail-unavailable");
    expect(note).toBeInTheDocument();
    expect(note).toHaveAttribute("data-reason", "no-account");
  });
});

describe("BuilderGuidanceRail — submit goes to the account workflow-guidance route", () => {
  it("submits goalText + workflowId + accountId through requestWorkflowGuidance and renders guidanceText", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Here is how to build it.",
      source: "hermes-agent",
      workflowPlan: null,
      previewDraft: null,
    });
    render(<BuilderGuidanceRail accountId="acct-1" workflowId="wf-9" guidanceEnabled />);

    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith({
        accountId: "acct-1",
        goalText: "follow up with leads",
        workflowId: "wf-9",
      }),
    );
    expect(await screen.findByTestId("workflow-guidance-result")).toHaveTextContent(
      "Here is how to build it.",
    );
  });

  it("offers Show on canvas for a previewDraft and forwards the validated plan + preview", async () => {
    const user = userEvent.setup();
    const onShowPreview = jest.fn();
    const workflowPlan = {
      schemaVersion: 1,
      title: "Lead follow-up",
      summary: "Watch then notify.",
      notApplied: true,
      steps: [
        { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" },
        { ref: "s1", role: "action", provider: "slack", type: "send_message", purpose: "notify" },
      ],
    };
    const previewDraft = {
      version: 1,
      title: "Lead follow-up",
      summary: "Watch then notify.",
      notice: "Preview only — your workflow has not changed.",
      notApplied: true,
      nodes: [
        { previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true },
        { previewId: "preview-step-2", role: "action", provider: "slack", type: "send_message", label: "slack:send_message", purpose: "notify", notApplied: true },
      ],
      edges: [{ previewId: "preview-edge-1", fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2", notApplied: true }],
    };
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan, previewDraft });

    render(
      <BuilderGuidanceRail accountId="acct-1" workflowId="wf-9" guidanceEnabled onShowPreview={onShowPreview} />,
    );
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await user.click(await screen.findByTestId("workflow-guidance-show-on-canvas"));

    expect(onShowPreview).toHaveBeenCalledTimes(1);
    expect(onShowPreview.mock.calls[0]![0]).toMatchObject({
      plan: { title: "Lead follow-up" },
      preview: { title: "Lead follow-up" },
    });
  });

  it("maps a route failure to safe copy (no internal detail)", async () => {
    const user = userEvent.setup();
    mockRequest.mockRejectedValue(new Error("503 from gateway"));
    render(<BuilderGuidanceRail accountId="acct-1" workflowId="wf-9" guidanceEnabled />);
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "do something");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    const err = await screen.findByTestId("workflow-guidance-error");
    expect(err.textContent ?? "").not.toMatch(/503|gateway/i);
  });
});

describe("BuilderGuidanceRail — guided setup card (HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX)", () => {
  const previewForSetup: DraftPreview = {
    version: 1,
    title: "Lead follow-up",
    summary: "Watch then notify.",
    notice: "Preview only — your workflow has not changed.",
    notApplied: true,
    nodes: [
      { previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true },
      { previewId: "preview-step-2", role: "action", provider: "slack", type: "send_message", label: "slack:send_message", purpose: "notify", missingInputs: ["text", "channel"], notApplied: true },
    ],
    edges: [{ previewId: "preview-edge-1", fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2", notApplied: true }],
  };
  const setupFieldsByType = {
    "slack:send_message": [{ name: "text", label: "Message", type: "textarea" as const, required: true }],
  };

  it("renders the setup card in the rail when a preview is shown (with the supported control)", () => {
    render(
      <BuilderGuidanceRail
        accountId="acct-1"
        workflowId="wf-9"
        guidanceEnabled
        previewForSetup={previewForSetup}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApplyPreview={() => {}}
      />,
    );
    expect(screen.getByTestId("builder-preview-setup-rail")).toBeInTheDocument();
    expect(screen.getByTestId("preview-setup-preview-step-2-text")).toBeInTheDocument();
    // The async `channel` field defers to a compact "choose after Apply" line (no fake dropdown).
    expect(screen.queryByTestId("preview-setup-preview-step-2-channel")).not.toBeInTheDocument();
    expect(screen.getByTestId("preview-setup-after-apply")).toHaveTextContent("channel");
    expect(screen.getByTestId("builder-preview-setup-apply")).toBeInTheDocument();
  });

  it("does NOT render the setup card when no preview is shown", () => {
    render(
      <BuilderGuidanceRail
        accountId="acct-1"
        workflowId="wf-9"
        guidanceEnabled
        previewForSetup={null}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApplyPreview={() => {}}
      />,
    );
    expect(screen.queryByTestId("builder-preview-setup-rail")).not.toBeInTheDocument();
  });
});

describe("BuilderGuidanceRail — conversational (multi-turn)", () => {
  it("renders multi-turn user + Hermes messages and a follow-up carries sanitized recentTurns", async () => {
    const user = userEvent.setup();
    mockRequest
      .mockResolvedValueOnce({ ok: true, guidanceText: "Add Slack after the trigger.", source: "hermes-agent", workflowPlan: null, previewDraft: null })
      .mockResolvedValueOnce({ ok: true, guidanceText: "Place a Delay before Slack.", source: "hermes-agent", workflowPlan: null, previewDraft: null });
    render(<BuilderGuidanceRail accountId="acct-1" workflowId="wf-9" guidanceEnabled />);

    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "Add a Slack message after manual run.");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    expect(await screen.findByText("Add Slack after the trigger.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "Add a delay before Slack.");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    expect(await screen.findByText("Place a Delay before Slack.")).toBeInTheDocument();

    // Follow-up still posts to the ACCOUNT workflow-guidance helper, now with recent conversation.
    expect(mockRequest).toHaveBeenNthCalledWith(2, {
      accountId: "acct-1",
      goalText: "Add a delay before Slack.",
      workflowId: "wf-9",
      recentTurns: [
        { role: "user", text: "Add a Slack message after manual run." },
        { role: "assistant", text: "Add Slack after the trigger." },
      ],
    });
    expect(screen.getAllByTestId("workflow-guidance-message-user")).toHaveLength(2);
  });
});
