/**
 * WorkflowGuidancePanel — advisory "Build with me" UI (HERMES-AGENT-GUIDANCE-UI).
 * Proves: renders the entry point; submit disabled for an empty prompt; a successful response shows
 * guidanceText under "Guidance"; failures show ONLY safe copy (no internal detail); loading state;
 * the browser calls the ChainReact route helper (not the gateway/OpenAI/Nous/private Hermes); an
 * optional workflowId is forwarded; no workflow-mutation API is touched.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));

import { WorkflowGuidancePanel } from "@/features/workflows/WorkflowGuidancePanel";

beforeEach(() => {
  mockRequest.mockReset();
});

describe("WorkflowGuidancePanel — entry point", () => {
  it("renders the 'Build with me' entry, advisory copy, textarea + submit", () => {
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    expect(screen.getByRole("heading", { name: "Build with me" })).toBeInTheDocument();
    expect(screen.getByText(/guidance, not automatic workflow creation/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Example: When a new lead comes in/i)).toBeInTheDocument();
    expect(screen.getByTestId("workflow-guidance-submit")).toBeInTheDocument();
  });

  it("submit is disabled until a non-blank goal is typed", async () => {
    const user = userEvent.setup();
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    const submit = screen.getByTestId("workflow-guidance-submit");
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/Example:/i), "   ");
    expect(submit).toBeDisabled(); // whitespace-only stays disabled
    await user.type(screen.getByPlaceholderText(/Example:/i), "remind me to follow up with leads");
    expect(submit).toBeEnabled();
  });
});

describe("WorkflowGuidancePanel — request + render", () => {
  it("success → calls the route helper with {accountId, goalText} and renders guidanceText under 'Guidance'", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "What app do your leads live in?", source: "hermes-agent", workflowPlan: null });
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "help me follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));

    await waitFor(() => expect(screen.getByTestId("workflow-guidance-result")).toBeInTheDocument());
    expect(screen.getByText("What app do your leads live in?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Guidance" })).toBeInTheDocument();
    expect(mockRequest).toHaveBeenCalledWith({ accountId: "acct-1", goalText: "help me follow up with leads" });
  });

  it("forwards an optional workflowId from props (builder context)", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan: null });
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "do a thing");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith({ accountId: "acct-1", goalText: "do a thing", workflowId: "wf-9" }));
  });

  it("ok:false (unavailable) → shows the safe 'temporarily unavailable' copy, NO internal detail", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: false, code: "GUIDANCE_UNAVAILABLE", message: "INTERNAL downstream 502 detail" });
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "vague goal");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    const err = await screen.findByTestId("workflow-guidance-error");
    expect(err).toHaveTextContent("AI workflow guidance is temporarily unavailable.");
    expect(err).not.toHaveTextContent("INTERNAL downstream 502 detail");
    expect(screen.queryByTestId("workflow-guidance-result")).not.toBeInTheDocument();
  });

  it("a thrown transport error → shows safe copy, never an internal message", async () => {
    const user = userEvent.setup();
    mockRequest.mockRejectedValue(new Error("AI request failed (HTTP 500): SECRET-INTERNAL"));
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "vague goal");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    const err = await screen.findByTestId("workflow-guidance-error");
    expect(err).toHaveTextContent("AI workflow guidance is temporarily unavailable.");
    expect(err).not.toHaveTextContent("SECRET-INTERNAL");
  });

  it("renders a REVIEW-ONLY 'Suggested plan' section when a workflowPlan is returned", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Here's the idea.",
      source: "hermes-agent",
      workflowPlan: {
        schemaVersion: 1,
        title: "Lead follow-up",
        summary: "Watch then notify.",
        notApplied: true,
        steps: [
          { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch inbox" },
          { ref: "s1", role: "action", provider: "slack", type: "send_message", purpose: "notify me" },
        ],
      },
    });
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));

    const planEl = await screen.findByTestId("workflow-guidance-plan");
    expect(screen.getByRole("heading", { name: "Suggested plan" })).toBeInTheDocument();
    // Copy must make clear nothing changed.
    expect(screen.getByTestId("workflow-guidance-plan-disclaimer")).toHaveTextContent(
      "Review only — this has not changed your workflow.",
    );
    expect(planEl).toHaveTextContent("gmail:new_email");
    expect(planEl).toHaveTextContent("slack:send_message");
    // No actionable apply/create/add/run controls in this slice.
    expect(screen.queryByRole("button", { name: /create|apply|add node|run/i })).not.toBeInTheDocument();
  });

  it("renders a PREVIEW-ONLY 'Draft preview' section when a previewDraft is returned", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Here's the idea.",
      source: "hermes-agent",
      workflowPlan: {
        schemaVersion: 1,
        title: "Lead follow-up",
        summary: "Watch then notify.",
        notApplied: true,
        steps: [{ ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" }],
      },
      previewDraft: {
        version: 1,
        title: "Lead follow-up",
        summary: "Watch then notify.",
        notice: "Preview only — your workflow has not changed.",
        notApplied: true,
        nodes: [
          { previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true },
          { previewId: "preview-step-2", role: "action", provider: "slack", type: "send_message", label: "slack:send_message", purpose: "notify", missingInputs: ["channel"], notApplied: true },
        ],
        edges: [{ previewId: "preview-edge-1", fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2", notApplied: true }],
      },
    });
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));

    const previewEl = await screen.findByTestId("workflow-guidance-preview");
    expect(screen.getByRole("heading", { name: "Draft preview" })).toBeInTheDocument();
    // Copy must make clear the workflow has not changed.
    expect(screen.getByTestId("workflow-guidance-preview-notice")).toHaveTextContent(
      "Preview only — your workflow has not changed.",
    );
    expect(previewEl).toHaveTextContent("gmail:new_email");
    expect(previewEl).toHaveTextContent("slack:send_message");
    expect(previewEl).toHaveTextContent("Still needs: channel"); // missing info, not config
    expect(screen.getByTestId("workflow-guidance-preview-flow")).toHaveTextContent(
      "Flow: gmail:new_email → slack:send_message",
    );
    // The text-only "Suggested plan" section is suppressed when a richer preview exists (no dup).
    expect(screen.queryByTestId("workflow-guidance-plan")).not.toBeInTheDocument();
    // No actionable controls in this slice.
    expect(screen.queryByRole("button", { name: /create|apply|add node|use this|run/i })).not.toBeInTheDocument();
  });

  it("offers 'Show on canvas' only when onPreviewToCanvas is provided, and calls it with the preview", async () => {
    const user = userEvent.setup();
    const onPreviewToCanvas = jest.fn();
    const previewDraft = {
      version: 1,
      title: "P",
      summary: "",
      notice: "Preview only — your workflow has not changed.",
      notApplied: true as const,
      nodes: [{ previewId: "preview-step-1", role: "trigger" as const, provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true as const }],
      edges: [],
    };
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "idea", source: "hermes-agent", workflowPlan: { schemaVersion: 1, title: "P", summary: "", notApplied: true, steps: [{ ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" }] }, previewDraft });
    render(<WorkflowGuidancePanel accountId="acct-1" onPreviewToCanvas={onPreviewToCanvas} />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "help");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("workflow-guidance-preview");

    const showBtn = screen.getByTestId("workflow-guidance-show-on-canvas");
    expect(showBtn).toHaveTextContent("Show on canvas");
    await user.click(showBtn);
    expect(onPreviewToCanvas).toHaveBeenCalledWith(previewDraft);
  });

  it("does NOT offer 'Show on canvas' when no onPreviewToCanvas prop (e.g. dashboard, no canvas)", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "idea",
      source: "hermes-agent",
      workflowPlan: { schemaVersion: 1, title: "P", summary: "", notApplied: true, steps: [{ ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" }] },
      previewDraft: {
        version: 1, title: "P", summary: "", notice: "Preview only — your workflow has not changed.", notApplied: true,
        nodes: [{ previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true }],
        edges: [],
      },
    });
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "help");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("workflow-guidance-preview");
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).not.toBeInTheDocument();
  });

  it("does NOT render a 'Suggested plan' section when workflowPlan is null (prose-only)", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "Just connect Gmail.", source: "hermes-agent", workflowPlan: null });
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "help");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() => expect(screen.getByTestId("workflow-guidance-result")).toBeInTheDocument());
    expect(screen.queryByTestId("workflow-guidance-plan")).not.toBeInTheDocument();
  });

  it("shows a loading state while the request is in flight (submit disabled, 'Thinking…')", async () => {
    const user = userEvent.setup();
    let resolve!: (v: unknown) => void;
    mockRequest.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "vague goal");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    expect(screen.getByTestId("workflow-guidance-submit")).toBeDisabled();
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    resolve({ ok: true, guidanceText: "done", source: "hermes-agent", workflowPlan: null });
    await waitFor(() => expect(screen.getByTestId("workflow-guidance-result")).toBeInTheDocument());
  });
});
