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
    // HERMES-AGENT-BUILDER-RAIL-COPY-ACCURACY — dashboard stays single-shot guidance (no canvas
    // apply), so it must NOT use the stale "not automatic workflow creation" phrasing, but also must
    // not overpromise preview/apply (those live in the builder rail).
    expect(screen.getByText(/help you figure out the workflow/i)).toBeInTheDocument();
    expect(screen.queryByText(/not automatic workflow creation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not workflow creation/i)).not.toBeInTheDocument();
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

  it("offers 'Show on canvas' only when onPreviewToCanvas is provided, and calls it with {plan, preview}", async () => {
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
    const workflowPlan = { schemaVersion: 1, title: "P", summary: "", notApplied: true, steps: [{ ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" }] };
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "idea", source: "hermes-agent", workflowPlan, previewDraft });
    render(<WorkflowGuidancePanel accountId="acct-1" onPreviewToCanvas={onPreviewToCanvas} />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "help");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("workflow-guidance-preview");

    const showBtn = screen.getByTestId("workflow-guidance-show-on-canvas");
    expect(showBtn).toHaveTextContent("Show on canvas");
    await user.click(showBtn);
    // Carries BOTH the validated plan (apply source of truth) and the display preview.
    expect(onPreviewToCanvas).toHaveBeenCalledWith({ plan: workflowPlan, preview: previewDraft });
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

/**
 * HERMES-AGENT-BUILDER-RAIL-CHAT-MODE — the `conversational` mode (builder rail). Session-scoped chat
 * over the SAME governed helper: multi-turn messages, follow-ups carry sanitized recent conversation,
 * new previews supersede the prior pending one, and apply/save is never touched by the panel.
 */
function planFor(title: string) {
  return {
    schemaVersion: 1,
    title,
    summary: "",
    notApplied: true,
    steps: [{ ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" }],
  };
}
function previewFor(title: string) {
  return {
    version: 1,
    title,
    summary: "",
    notice: "Preview only — your workflow has not changed.",
    notApplied: true as const,
    nodes: [
      { previewId: "preview-step-1", role: "trigger" as const, provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true as const },
    ],
    edges: [],
  };
}

describe("WorkflowGuidancePanel — conversational (builder rail chat mode)", () => {
  it("renders a message list + bottom send input, no single-shot 'Get guidance' form", () => {
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
    expect(screen.getByTestId("workflow-guidance-messages")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe what to add or change/i)).toBeInTheDocument();
    expect(screen.getByTestId("workflow-guidance-submit")).toHaveTextContent("Send");
  });

  // HERMES-AGENT-BUILDER-RAIL-ENTER-TO-SEND — Enter sends, Shift+Enter newlines, guards empty/loading.
  describe("Enter-to-send composer", () => {
    it("Enter submits the message once (no newline)", async () => {
      const user = userEvent.setup();
      mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan: null, previewDraft: null });
      render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
      await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "add slack{Enter}");
      await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
      expect(mockRequest).toHaveBeenCalledWith({ accountId: "acct-1", goalText: "add slack", workflowId: "wf-9" });
    });

    it("Shift+Enter inserts a newline and does NOT submit", async () => {
      const user = userEvent.setup();
      render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
      const ta = screen.getByPlaceholderText(/Describe what to add or change/i) as HTMLTextAreaElement;
      await user.type(ta, "line1{Shift>}{Enter}{/Shift}line2");
      expect(mockRequest).not.toHaveBeenCalled();
      expect(ta.value).toBe("line1\nline2");
    });

    it("Enter on whitespace-only input does not submit", async () => {
      const user = userEvent.setup();
      render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
      await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "   {Enter}");
      expect(mockRequest).not.toHaveBeenCalled();
    });

    it("Enter while a request is in flight does not double-submit", async () => {
      const user = userEvent.setup();
      let resolve!: (v: unknown) => void;
      mockRequest.mockReturnValue(new Promise((r) => { resolve = r; }));
      render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
      const ta = screen.getByPlaceholderText(/Describe what to add or change/i);
      await user.type(ta, "first{Enter}");
      await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
      // Composer is disabled while loading; a further type+Enter must not fire a second request.
      await user.type(ta, "second{Enter}");
      expect(mockRequest).toHaveBeenCalledTimes(1);
      resolve({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan: null, previewDraft: null });
      await waitFor(() => expect(screen.getByText("ok")).toBeInTheDocument());
    });

    it("a follow-up sent via Enter still carries sanitized recentTurns", async () => {
      const user = userEvent.setup();
      mockRequest
        .mockResolvedValueOnce({ ok: true, guidanceText: "Add Slack after the trigger.", source: "hermes-agent", workflowPlan: null, previewDraft: null })
        .mockResolvedValueOnce({ ok: true, guidanceText: "Place a Delay before Slack.", source: "hermes-agent", workflowPlan: null, previewDraft: null });
      render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
      const ta = () => screen.getByPlaceholderText(/Describe what to add or change/i);
      await user.type(ta(), "Add a Slack message after manual run.{Enter}");
      await screen.findByText("Add Slack after the trigger.");
      await user.type(ta(), "Add a delay before Slack.{Enter}");
      await waitFor(() =>
        expect(mockRequest).toHaveBeenNthCalledWith(2, {
          accountId: "acct-1",
          goalText: "Add a delay before Slack.",
          workflowId: "wf-9",
          recentTurns: [
            { role: "user", text: "Add a Slack message after manual run." },
            { role: "assistant", text: "Add Slack after the trigger." },
          ],
        }),
      );
    });
  });

  it("renders multi-turn user + Hermes messages and a second submit carries sanitized recentTurns", async () => {
    const user = userEvent.setup();
    mockRequest
      .mockResolvedValueOnce({ ok: true, guidanceText: "Add the Slack step after the trigger.", source: "hermes-agent", workflowPlan: null, previewDraft: null })
      .mockResolvedValueOnce({ ok: true, guidanceText: "Okay, place a Delay node before the Slack step.", source: "hermes-agent", workflowPlan: null, previewDraft: null });
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);

    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "Add a Slack message after manual run.");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    expect(await screen.findByText("Add the Slack step after the trigger.")).toBeInTheDocument();
    // First turn: no recentTurns (byte-identical to single-shot payload).
    expect(mockRequest).toHaveBeenNthCalledWith(1, {
      accountId: "acct-1",
      goalText: "Add a Slack message after manual run.",
      workflowId: "wf-9",
    });

    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "Add a delay before Slack.");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    expect(await screen.findByText("Okay, place a Delay node before the Slack step.")).toBeInTheDocument();
    // Second turn: prior user + assistant turns sent as recentTurns (plain text only).
    expect(mockRequest).toHaveBeenNthCalledWith(2, {
      accountId: "acct-1",
      goalText: "Add a delay before Slack.",
      workflowId: "wf-9",
      recentTurns: [
        { role: "user", text: "Add a Slack message after manual run." },
        { role: "assistant", text: "Add the Slack step after the trigger." },
      ],
    });
    // Both user turns remain in the transcript.
    expect(screen.getAllByTestId("workflow-guidance-message-user")).toHaveLength(2);
  });

  it("a follow-up preview supersedes the prior pending one (only the latest is actionable)", async () => {
    const user = userEvent.setup();
    const onPreviewToCanvas = jest.fn();
    mockRequest
      .mockResolvedValueOnce({ ok: true, guidanceText: "first", source: "hermes-agent", workflowPlan: planFor("First"), previewDraft: previewFor("First") })
      .mockResolvedValueOnce({ ok: true, guidanceText: "second", source: "hermes-agent", workflowPlan: planFor("Second"), previewDraft: previewFor("Second") });
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational onPreviewToCanvas={onPreviewToCanvas} />);

    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "add slack");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("workflow-guidance-preview");
    expect(screen.getAllByTestId("workflow-guidance-show-on-canvas")).toHaveLength(1);

    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "add delay");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() => expect(screen.getByTestId("workflow-guidance-preview")).toHaveTextContent("Second"));
    // Still exactly ONE actionable preview — the newest replaces the prior pending one.
    expect(screen.getAllByTestId("workflow-guidance-show-on-canvas")).toHaveLength(1);

    await user.click(screen.getByTestId("workflow-guidance-show-on-canvas"));
    expect(onPreviewToCanvas).toHaveBeenCalledTimes(1);
    expect(onPreviewToCanvas.mock.calls[0]![0]).toMatchObject({ plan: { title: "Second" }, preview: { title: "Second" } });
  });

  it("an error turn is appended but the prior chat history is preserved", async () => {
    const user = userEvent.setup();
    mockRequest
      .mockResolvedValueOnce({ ok: true, guidanceText: "Here is guidance.", source: "hermes-agent", workflowPlan: null, previewDraft: null })
      .mockRejectedValueOnce(new Error("503 SECRET gateway detail"));
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);

    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "first");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByText("Here is guidance.");

    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "second");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    const err = await screen.findByTestId("workflow-guidance-error");
    expect(err.textContent ?? "").not.toMatch(/503|gateway|SECRET/i);
    // Chat history kept: the earlier Hermes turn and both user turns are still present.
    expect(screen.getByText("Here is guidance.")).toBeInTheDocument();
    expect(screen.getAllByTestId("workflow-guidance-message-user")).toHaveLength(2);
  });
});
