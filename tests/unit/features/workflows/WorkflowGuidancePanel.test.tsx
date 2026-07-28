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

// REACT-AGENT-TEMPLATE-MATCH-3 — local overrides so the Preview→Use flow can be asserted.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
const mockUseTemplate = jest.fn();
class TemplateApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
jest.mock("@/lib/api/workflowTemplates", () => ({
  useTemplate: (...a: unknown[]) => mockUseTemplate(...a),
  TemplateApiError,
}));

import { WorkflowGuidancePanel } from "@/features/workflows/WorkflowGuidancePanel";

beforeEach(() => {
  mockRequest.mockReset();
  mockPush.mockReset();
  mockUseTemplate.mockReset();
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

  it("renders the draft-preview card with NO 'Show on canvas' button (auto-show replaced the manual push)", async () => {
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
    // Even when onPreviewToCanvas is provided, the section never renders a manual "Show on canvas".
    render(<WorkflowGuidancePanel accountId="acct-1" onPreviewToCanvas={onPreviewToCanvas} />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "help");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("workflow-guidance-preview");

    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Show on canvas$/)).not.toBeInTheDocument();
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

  /**
   * HERMES-AGENT-RAIL-CHAT-POLISH — the rail reads like a chat: the intro/help copy is the first React
   * message INSIDE the scrollable transcript (no sticky header), the user speaks in a distinct bubble,
   * and speaker styling is clear. No new chat framework — small presentational components only.
   */
  describe("chat UI polish", () => {
    it("renders the intro/help copy as the first React message INSIDE the scroll container (not a sticky header)", () => {
      render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
      const intro = screen.getByTestId("workflow-guidance-intro");
      // The intro reads as a React message…
      expect(intro).toHaveTextContent(/Describe what you want to automate/i);
      expect(intro.textContent ?? "").toContain("React:");
      // …and it lives inside the scrollable transcript with the rest of the messages (not a header block).
      const transcript = screen.getByTestId("workflow-guidance-messages");
      expect(transcript).toContainElement(intro);
      // It is NOT a heading/sticky top block.
      expect(screen.queryByRole("heading", { name: "Build with me" })).not.toBeInTheDocument();
      // The intro is display-only — it is not a real assistant turn (no result testid, no preview).
      expect(screen.queryByTestId("workflow-guidance-result")).not.toBeInTheDocument();
    });

    it("renders the intro alongside chat messages in the same scroll container as the conversation grows", async () => {
      const user = userEvent.setup();
      mockRequest.mockResolvedValue({ ok: true, guidanceText: "Sure — what should it do?", source: "hermes-agent", workflowPlan: null, previewDraft: null });
      render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
      await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "automate my leads{Enter}");
      await screen.findByText("Sure — what should it do?");
      const transcript = screen.getByTestId("workflow-guidance-messages");
      // The intro, the user bubble, and the reply all share the one scroll container.
      expect(transcript).toContainElement(screen.getByTestId("workflow-guidance-intro"));
      expect(transcript).toContainElement(screen.getByTestId("workflow-guidance-message-user"));
      expect(transcript).toContainElement(screen.getByTestId("workflow-guidance-result"));
    });

    it("renders user messages as a distinct bubble (not just a label) and wraps long / multiline text", async () => {
      const user = userEvent.setup();
      mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan: null, previewDraft: null });
      render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
      const multiline = "line one is fairly long and should wrap cleanly at narrow rail widths{Shift>}{Enter}{/Shift}line two";
      await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), multiline);
      await user.click(screen.getByTestId("workflow-guidance-submit"));

      const userMsg = await screen.findByTestId("workflow-guidance-message-user");
      // The bubble carries the message text with wrapping classes (multiline preserved + long text wraps).
      const bubble = userMsg.querySelector(".rounded-2xl");
      expect(bubble).not.toBeNull();
      expect(bubble!.className).toMatch(/whitespace-pre-wrap/);
      expect(bubble!.className).toMatch(/break-words/);
      expect(userMsg).toHaveTextContent("line one is fairly long");
      expect(userMsg).toHaveTextContent("line two");
      // The bubble uses a tokenized background (theme-driven), not a hardcoded hex.
      expect(bubble!.className).toContain("bg-[var(--builder-accent-soft)]");
      expect(bubble!.className).not.toMatch(/#[0-9a-f]{3,6}/i);
    });

    it("styles the React and You speaker labels with company accent tokens (light/dark via theme)", async () => {
      const user = userEvent.setup();
      mockRequest.mockResolvedValue({ ok: true, guidanceText: "On it.", source: "hermes-agent", workflowPlan: null, previewDraft: null });
      render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
      await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "do a thing{Enter}");
      await screen.findByText("On it.");
      // "React:" label uses the accent-strong token; "You" label uses the accent token — distinct, tokenized.
      const reactLabel = screen.getAllByText("React:")[0]!;
      expect(reactLabel.className).toContain("text-[var(--builder-accent-strong)]");
      const youLabel = screen.getByText("You");
      expect(youLabel.className).toContain("text-[var(--builder-accent)]");
      // Distinct styling — the two speaker labels are not the same token.
      expect(reactLabel.className).not.toBe(youLabel.className);
    });
  });

  // HERMES-AGENT-RAIL-PRODUCT-LABEL — the assistant speaker is the product name "React:", never the
  // internal runtime/provider name "Hermes". No internal name leaks into the chat transcript.
  it("labels assistant turns 'React:' and never exposes the internal 'Hermes' name", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "Which Slack channel should the reminder go to?", source: "hermes-agent", workflowPlan: null, previewDraft: null });
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "remind the team{Enter}");
    await screen.findByText("Which Slack channel should the reminder go to?");
    // "React:" labels appear (the intro message + the reply turn); never the internal "Hermes:" name.
    expect(screen.getAllByText("React:").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Hermes:")).not.toBeInTheDocument();
    // Defense in depth: the internal provider name never appears anywhere in the transcript.
    expect(screen.getByTestId("workflow-guidance-messages").textContent ?? "").not.toMatch(/hermes/i);
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

  it("HERMES-AGENT-WORKFLOW-EDITOR — sends the CURRENT local draft (stable ids + edges) so change requests are proposed against the live canvas", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan: null, previewDraft: null });
    const currentDraft = {
      nodes: [
        { id: "t1", kind: "trigger" as const, provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
        { id: "a1", kind: "action" as const, provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [{ id: "e1", from: "t1", to: "a1" }],
    };
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational getCurrentDraft={() => currentDraft} />);
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "change it to an email notification");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    const sent = mockRequest.mock.calls[0]![0];
    // The draft is sent with STABLE node ids + edges so React can reference "a1" unambiguously.
    expect(sent.currentDraft.nodes.map((n: { id: string }) => n.id)).toEqual(["t1", "a1"]);
    expect(sent.currentDraft.edges).toEqual([{ id: "e1", from: "t1", to: "a1" }]);
  });

  it("a follow-up preview AUTO-shows on the canvas and supersedes the prior one (REACT-LIVE-SKELETON)", async () => {
    const user = userEvent.setup();
    const onPreviewToCanvas = jest.fn();
    mockRequest
      .mockResolvedValueOnce({ ok: true, guidanceText: "first", source: "hermes-agent", workflowPlan: planFor("First"), previewDraft: previewFor("First") })
      .mockResolvedValueOnce({ ok: true, guidanceText: "second", source: "hermes-agent", workflowPlan: planFor("Second"), previewDraft: previewFor("Second") });
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational onPreviewToCanvas={onPreviewToCanvas} />);

    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "add slack");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    // Auto-shown on the canvas — NO extra click required.
    await waitFor(() => expect(onPreviewToCanvas).toHaveBeenCalledTimes(1));
    expect(onPreviewToCanvas.mock.calls[0]![0]).toMatchObject({ plan: { title: "First" } });
    // No manual "Show on canvas" — the preview auto-showed.
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).not.toBeInTheDocument();
    // REACT-AGENT-RAIL-NO-DUPLICATE-PREVIEW-1 — with a canvas wired, the canvas IS the presentation.
    expect(screen.queryByTestId("workflow-guidance-preview")).toBeNull();

    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "add delay");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    // The newer preview auto-supersedes (one auto-show per turn; latest wins downstream).
    await waitFor(() => expect(onPreviewToCanvas).toHaveBeenCalledTimes(2));
    expect(onPreviewToCanvas.mock.calls[1]![0]).toMatchObject({ plan: { title: "Second" }, preview: { title: "Second" } });
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).not.toBeInTheDocument();
  });

  it("REACT-LIVE-SKELETON — an honest source question + labeled starter skeleton both surface in the rail (no empty canvas)", async () => {
    // The screenshot fix: the reply is the actionable source question (not a vague warning) AND the
    // Slack-alert starter preview auto-shows on the canvas.
    const user = userEvent.setup();
    const onPreviewToCanvas = jest.fn();
    const starterPlan = {
      schemaVersion: 1,
      title: "Starter: Slack alert (choose your source)",
      summary: "A starter skeleton, not a finished monitor.",
      notApplied: true,
      steps: [
        { ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "Starter trigger" },
        { ref: "s1", role: "action", provider: "slack", type: "send_channel_message", purpose: "Send the alert" },
      ],
    };
    const starterPreview = {
      version: 1,
      title: "Starter: Slack alert (choose your source)",
      summary: "A starter skeleton, not a finished monitor.",
      notice: "Preview only — your workflow has not changed.",
      notApplied: true as const,
      nodes: [
        { previewId: "preview-step-1", role: "trigger" as const, provider: "native", type: "manual.run", label: "native:manual.run", purpose: "Starter trigger", notApplied: true as const },
        { previewId: "preview-step-2", role: "action" as const, provider: "slack", type: "send_channel_message", label: "slack:send_channel_message", purpose: "Send the alert", missingInputs: ["channel", "text"], notApplied: true as const },
      ],
      edges: [{ previewId: "preview-edge-1", fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2", notApplied: true as const }],
    };
    mockRequest.mockResolvedValueOnce({
      ok: true,
      guidanceText:
        "I can't watch that automatically yet — ChainReact doesn't have a trigger for that source. Where should React read this from — Stripe, HubSpot, Google Analytics, a webhook, or your app/database?",
      source: "hermes-agent",
      workflowPlan: starterPlan,
      previewDraft: starterPreview,
    });
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational onPreviewToCanvas={onPreviewToCanvas} />);
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "low usage, alert someone on slack");
    await user.click(screen.getByTestId("workflow-guidance-submit"));

    // The honest source question is shown as React's reply (safe reason in the rail).
    expect(await screen.findByText(/where should React read this from/i)).toBeInTheDocument();
    // The labeled starter skeleton auto-shows on the canvas — the canvas is no longer empty.
    await waitFor(() => expect(onPreviewToCanvas).toHaveBeenCalledTimes(1));
    expect(onPreviewToCanvas.mock.calls[0]![0].plan.title).toContain("Starter");
    expect(onPreviewToCanvas.mock.calls[0]![0].preview.title).toContain("Starter");
    // REACT-AGENT-RAIL-NO-DUPLICATE-PREVIEW-1 — the skeleton is shown on the canvas, so the rail does
    // NOT also restate it as a textual "Draft preview" card. The reply above is what the rail carries.
    expect(screen.queryByTestId("workflow-guidance-preview")).toBeNull();
  });

  // HERMES-AGENT-RAIL-NO-MANUAL-CANVAS-PUSH — a valid skeleton preview auto-shows on the canvas, so the
  // rail NEVER renders a manual "Show on canvas" button (in any signature/displayed state).
  it("never renders a 'Show on canvas' button for a skeleton preview (it auto-shows)", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "first", source: "hermes-agent", workflowPlan: planFor("First"), previewDraft: previewFor("First") });
    const onPreviewToCanvas = jest.fn();
    render(
      <WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational onPreviewToCanvas={onPreviewToCanvas} />,
    );
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "add slack");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    // The suggestion renders and auto-shows on the canvas…
    await screen.findByTestId("workflow-guidance-result");
    await waitFor(() => expect(onPreviewToCanvas).toHaveBeenCalled());
    // …but there is no manual "Show on canvas" control.
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Show on canvas$/)).not.toBeInTheDocument();
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

/**
 * BUILDER-AGENT-RAIL-CHECK-WORKFLOW-DETERMINISTIC — the "Check workflow" pill runs an INSTANT, LOCAL,
 * deterministic review built from `getCheckReviewContext`. It must NOT call `requestWorkflowGuidance` /
 * any LLM, must NOT consume credits, must NOT prefill the composer, and must NOT render raw JSON. The
 * only Check-workflow-related path that may call the governed guidance helper is the explicit, opt-in
 * "Ask React for deeper suggestions" follow-up.
 */
describe("WorkflowGuidancePanel — deterministic 'Check workflow' review", () => {
  const blockedContext = () => ({
    summary: "This workflow starts when you run it manually, then runs 1 step: Slack Send Channel Message.",
    blockingIssueCount: 2,
    issueMessages: ["Send Channel Message needs a Channel.", "Send Channel Message needs a Message."],
    issueCodes: ["missing_required_field"],
    setupTargets: [] as const,
  });

  function renderWithContext(getCtx: () => ReturnType<typeof blockedContext>) {
    return render(
      <WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational getCheckReviewContext={getCtx} />,
    );
  }

  it("renders a deterministic review immediately on click — no request, no LLM, no credit use, no prefill", async () => {
    const user = userEvent.setup();
    renderWithContext(blockedContext);
    const composer = screen.getByPlaceholderText(/Describe what to add or change/i) as HTMLTextAreaElement;

    await user.click(screen.getByTestId("agent-check-workflow"));

    // The review appears instantly in the transcript…
    const result = await screen.findByTestId("workflow-guidance-result");
    expect(result).toHaveTextContent("Status");
    // …WITHOUT calling the governed guidance helper (no LLM / no AI credits / no tasks)…
    expect(mockRequest).not.toHaveBeenCalled();
    // …and WITHOUT prefilling the composer.
    expect(composer.value).toBe("");
  });

  it("says NOT ready and lists the deterministic setup issues when blockers exist", async () => {
    const user = userEvent.setup();
    renderWithContext(blockedContext);
    await user.click(screen.getByTestId("agent-check-workflow"));

    const result = await screen.findByTestId("workflow-guidance-result");
    expect(result).toHaveTextContent("not ready to activate");
    expect(result).toHaveTextContent("Send Channel Message needs a Channel.");
    expect(result).toHaveTextContent("Send Channel Message needs a Message.");
    // Never claims valid/ready while there are blockers.
    expect(result.textContent ?? "").not.toMatch(/\bis (valid|ready)\b/i);
  });

  it("never renders raw JSON / fenced JSON / plan JSON (the review is composed locally)", async () => {
    const user = userEvent.setup();
    renderWithContext(blockedContext);
    await user.click(screen.getByTestId("agent-check-workflow"));

    const result = await screen.findByTestId("workflow-guidance-result");
    const text = result.textContent ?? "";
    expect(text).not.toContain('"nodes"');
    expect(text).not.toContain('"provider"');
    expect(text).not.toContain("```");
    expect(text).not.toMatch(/[{}[\]]/); // no JSON-ish brackets in a deterministic review
    expect(result).toHaveTextContent("Setup issues");
  });

  it("reports a clean workflow as having no blocking issues and does not say not-ready", async () => {
    const user = userEvent.setup();
    const cleanContext = () => ({
      summary: "This workflow starts when Gmail new email, then runs 1 step: Slack send message.",
      blockingIssueCount: 0,
      issueMessages: [] as string[],
      issueCodes: [] as string[],
      setupTargets: [] as const,
    });
    renderWithContext(cleanContext);
    await user.click(screen.getByTestId("agent-check-workflow"));

    const result = await screen.findByTestId("workflow-guidance-result");
    expect(result).toHaveTextContent("no blocking setup issues");
    expect(result.textContent ?? "").not.toContain("not ready to activate");
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("the optional 'Ask React for deeper suggestions' follow-up is the ONLY check path that calls the guidance helper", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "Add a delay before Slack.", source: "hermes-agent", workflowPlan: null, previewDraft: null });
    renderWithContext(blockedContext);

    // The deterministic review fires no request…
    await user.click(screen.getByTestId("agent-check-workflow"));
    await screen.findByTestId("workflow-guidance-result");
    expect(mockRequest).not.toHaveBeenCalled();

    // …only the explicit deeper-suggestions action does.
    await user.click(screen.getByTestId("agent-ask-deeper"));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    const arg = mockRequest.mock.calls[0]![0] as { goalText: string; workflowId: string };
    expect(arg.workflowId).toBe("wf-9");
    // It carries de-identified validation context (codes/counts only, no author labels/values).
    expect(arg.goalText).toContain("missing_required_field");
    expect(arg.goalText).not.toContain("Send Channel Message needs a Channel.");
    expect(await screen.findByText("Add a delay before Slack.")).toBeInTheDocument();
  });

  it("does nothing on click when no validation context is wired (no request, no review, no prefill)", async () => {
    const user = userEvent.setup();
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
    const composer = screen.getByPlaceholderText(/Describe what to add or change/i) as HTMLTextAreaElement;
    await user.click(screen.getByTestId("agent-check-workflow"));
    expect(mockRequest).not.toHaveBeenCalled();
    expect(screen.queryByTestId("workflow-guidance-result")).not.toBeInTheDocument();
    expect(composer.value).toBe("");
  });

  it("normal freeform chat still uses the governed guidance path", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan: null, previewDraft: null });
    renderWithContext(blockedContext);
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "add a slack message");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    expect(mockRequest).toHaveBeenCalledWith({ accountId: "acct-1", goalText: "add a slack message", workflowId: "wf-9" });
  });

  it("renders the inline setup slot under the review with the existing-node targets (still zero-credit)", async () => {
    const user = userEvent.setup();
    const renderCheckSetup = jest.fn((targets: readonly { nodeId: string }[]) => (
      <div data-testid="fake-setup-card">setup for {targets.map((t) => t.nodeId).join(",")}</div>
    ));
    const ctxWithTargets = () => ({
      summary: "This workflow starts when you run it manually, then runs 1 step: Slack Send Channel Message.",
      blockingIssueCount: 2,
      issueMessages: ["Send Channel Message needs a Channel.", "Send Channel Message needs a Message."],
      issueCodes: ["missing_required_field"],
      setupTargets: [
        { nodeId: "a1", provider: "slack", type: "send_channel_message", label: "Send Channel Message", missingFieldNames: ["channel", "text"] },
      ],
    });
    render(
      <WorkflowGuidancePanel
        accountId="acct-1"
        workflowId="wf-9"
        conversational
        getCheckReviewContext={ctxWithTargets}
        renderCheckSetup={renderCheckSetup}
      />,
    );
    await user.click(screen.getByTestId("agent-check-workflow"));

    // The slot is rendered under the review with the existing-node targets…
    expect(await screen.findByTestId("fake-setup-card")).toHaveTextContent("setup for a1");
    expect(renderCheckSetup).toHaveBeenCalledWith(ctxWithTargets().setupTargets);
    // …and the deterministic path stays zero-credit (no governed request).
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("does not render the setup slot when there are no inline-fixable targets", async () => {
    const user = userEvent.setup();
    const renderCheckSetup = jest.fn(() => <div data-testid="fake-setup-card" />);
    // blockedContext has setupTargets: [] → the slot must not be invoked.
    render(
      <WorkflowGuidancePanel
        accountId="acct-1"
        workflowId="wf-9"
        conversational
        getCheckReviewContext={blockedContext}
        renderCheckSetup={renderCheckSetup}
      />,
    );
    await user.click(screen.getByTestId("agent-check-workflow"));
    await screen.findByTestId("workflow-guidance-result");
    expect(renderCheckSetup).not.toHaveBeenCalled();
    expect(screen.queryByTestId("fake-setup-card")).toBeNull();
  });
});

/**
 * BUILDER-AGENT-RAIL-CANVAS-PREVIEW-GUARD — AUTO-SHOW must not ghost duplicate nodes for a plan that
 * merely restates the current workflow. When a `getCurrentGraphShape` getter is wired, the canvas
 * auto-shows only a plan that meaningfully adds/changes structure; a same-shape plan stays in the rail
 * as text. There is no manual "Show on canvas" button in any case.
 */
describe("WorkflowGuidancePanel — auto-show eligibility guard", () => {
  const MANUAL = { provider: "native", type: "manual.run" };
  const SLACK = { provider: "slack", type: "send_channel_message" };

  function planFor(steps: { ref: string; role: string; provider: string; type: string }[]) {
    return { schemaVersion: 1, title: "P", summary: "", notApplied: true, steps: steps.map((s) => ({ ...s, purpose: "" })) };
  }
  function previewFor(nodes: { previewId: string; role: string; provider: string; type: string }[]) {
    return {
      version: 1,
      title: "P",
      summary: "",
      notice: "Preview only — your workflow has not changed.",
      notApplied: true as const,
      nodes: nodes.map((n) => ({ ...n, label: `${n.provider}:${n.type}`, purpose: "", notApplied: true as const })),
      edges: [],
    };
  }

  async function sendFreeform(opts: {
    workflowPlan: unknown;
    previewDraft: unknown;
    getCurrentGraphShape?: () => readonly { kind: string; provider: string; type: string }[];
    onPreviewToCanvas?: jest.Mock;
  }) {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "Here's a thought.", source: "hermes-agent", ...opts });
    render(
      <WorkflowGuidancePanel
        accountId="acct-1"
        workflowId="wf-9"
        conversational
        onPreviewToCanvas={opts.onPreviewToCanvas ?? jest.fn()}
        {...(opts.getCurrentGraphShape ? { getCurrentGraphShape: opts.getCurrentGraphShape } : {})}
      />,
    );
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "review my workflow");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    // Sync on the assistant turn itself. REACT-AGENT-RAIL-NO-DUPLICATE-PREVIEW-1 removed the textual
    // "Draft preview" card whenever a canvas is wired (which it always is here), so it is no longer a
    // usable settle signal — and every case below asserts canvas behavior, not rail prose.
    await screen.findByTestId("workflow-guidance-result");
    return user;
  }

  it("suppresses 'Show on canvas' when the plan restates the existing manual.run → Slack shape", async () => {
    const onPreviewToCanvas = jest.fn();
    await sendFreeform({
      workflowPlan: planFor([
        { ref: "s0", role: "trigger", ...MANUAL },
        { ref: "s1", role: "action", ...SLACK },
      ]),
      previewDraft: previewFor([
        { previewId: "p1", role: "trigger", ...MANUAL },
        { previewId: "p2", role: "action", ...SLACK },
      ]),
      getCurrentGraphShape: () => [
        { kind: "trigger", ...MANUAL },
        { kind: "action", ...SLACK },
      ],
      onPreviewToCanvas,
    });

    // Same-shape restatement → NOT auto-shown (would ghost duplicates), and never a manual button.
    expect(onPreviewToCanvas).not.toHaveBeenCalled();
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
    // The suggestion still reads in the rail as React's reply. REACT-AGENT-RAIL-NO-DUPLICATE-PREVIEW-1
    // — a same-shape restatement is by definition already on the canvas, so the rail does not repeat
    // it as a textual "Draft preview" card either.
    expect(screen.getByTestId("workflow-guidance-result")).toHaveTextContent("Here's a thought.");
    expect(screen.queryByTestId("workflow-guidance-preview")).toBeNull();
    // No raw JSON leaked into the rail.
    expect(screen.getByTestId("workflow-guidance-messages").textContent ?? "").not.toContain('"nodes"');
  });

  it("AUTO-SHOWS a genuinely additive plan (new step the graph lacks) — no manual button", async () => {
    const onPreviewToCanvas = jest.fn();
    await sendFreeform({
      workflowPlan: planFor([
        { ref: "s0", role: "trigger", ...MANUAL },
        { ref: "s1", role: "action", ...SLACK },
      ]),
      previewDraft: previewFor([
        { previewId: "p1", role: "trigger", ...MANUAL },
        { previewId: "p2", role: "action", ...SLACK },
      ]),
      // Current graph has only the trigger → the Slack action is genuinely new.
      getCurrentGraphShape: () => [{ kind: "trigger", ...MANUAL }],
      onPreviewToCanvas,
    });

    await waitFor(() => expect(onPreviewToCanvas).toHaveBeenCalled());
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
  });

  it("AUTO-SHOWS when no graph-shape getter is wired — no manual button", async () => {
    const onPreviewToCanvas = jest.fn();
    await sendFreeform({
      workflowPlan: planFor([{ ref: "s0", role: "trigger", ...MANUAL }]),
      previewDraft: previewFor([{ previewId: "p1", role: "trigger", ...MANUAL }]),
      // getCurrentGraphShape omitted → always auto-shows.
      onPreviewToCanvas,
    });
    await waitFor(() => expect(onPreviewToCanvas).toHaveBeenCalled());
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
  });

  it("does not affect the deterministic Check workflow review (which has no canvas preview)", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowGuidancePanel
        accountId="acct-1"
        workflowId="wf-9"
        conversational
        onPreviewToCanvas={jest.fn()}
        getCurrentGraphShape={() => [{ kind: "trigger", ...MANUAL }, { kind: "action", ...SLACK }]}
        getCheckReviewContext={() => ({
          summary: "This workflow starts when you run it manually, then runs 1 step: Slack Send Channel Message.",
          blockingIssueCount: 1,
          issueMessages: ["Send Channel Message needs a Message."],
          issueCodes: ["missing_required_field"],
          setupTargets: [],
        })}
      />,
    );
    await user.click(screen.getByTestId("agent-check-workflow"));
    const result = await screen.findByTestId("workflow-guidance-result");
    expect(result).toHaveTextContent("not ready to activate");
    expect(mockRequest).not.toHaveBeenCalled();
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
  });
});

/**
 * 5.DUAL-BUILDER-1 CS-7 — the keyed/versioned `composerSeed` seeds the ONE
 * composer. A `restore` seed (ANON-BUILDER-2 anonymous-draft handoff) fills only
 * an empty composer and never auto-sends; an explicit Document `document-*` seed
 * replaces it, and a later version supersedes an earlier unsent one.
 */
describe("WorkflowGuidancePanel — conversational versioned composer seed", () => {
  it("fills an empty composer from a restore seed (no auto-send)", async () => {
    render(
      <WorkflowGuidancePanel
        accountId="acct-1"
        workflowId="wf-9"
        conversational
        composerSeed={{ value: "Notify #wins on a 5-star review", version: 1, source: "restore" }}
      />,
    );
    const composer = screen.getByPlaceholderText(/Describe what to add or change/i) as HTMLTextAreaElement;
    await waitFor(() => expect(composer.value).toBe("Notify #wins on a 5-star review"));
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("a restore seed does not overwrite what the user has already typed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />,
    );
    const composer = screen.getByPlaceholderText(/Describe what to add or change/i) as HTMLTextAreaElement;
    await user.type(composer, "my own text");
    rerender(
      <WorkflowGuidancePanel
        accountId="acct-1"
        workflowId="wf-9"
        conversational
        composerSeed={{ value: "seeded value", version: 2, source: "restore" }}
      />,
    );
    expect(composer.value).toBe("my own text");
  });

  it("an explicit Document seed replaces the composer, and a newer version supersedes the first unsent seed", async () => {
    const { rerender } = render(
      <WorkflowGuidancePanel
        accountId="acct-1"
        workflowId="wf-9"
        conversational
        composerSeed={{ value: "Add a step at the end. ", version: 1, source: "document-bar" }}
      />,
    );
    const composer = screen.getByPlaceholderText(/Describe what to add or change/i) as HTMLTextAreaElement;
    await waitFor(() => expect(composer.value).toBe("Add a step at the end. "));
    // A SECOND explicit Document request (new version) replaces the unsent first seed.
    rerender(
      <WorkflowGuidancePanel
        accountId="acct-1"
        workflowId="wf-9"
        conversational
        composerSeed={{ value: "Add a branch after step 2. ", version: 2, source: "document-insert" }}
      />,
    );
    await waitFor(() => expect(composer.value).toBe("Add a branch after step 2. "));
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("an unrelated re-render with the SAME seed version never re-seeds over user text", async () => {
    const user = userEvent.setup();
    const seed = { value: "Add a step. ", version: 5, source: "document-bar" as const };
    const { rerender } = render(
      <WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational composerSeed={seed} />,
    );
    const composer = screen.getByPlaceholderText(/Describe what to add or change/i) as HTMLTextAreaElement;
    await waitFor(() => expect(composer.value).toBe("Add a step. "));
    await user.clear(composer);
    await user.type(composer, "hand edited");
    // Re-render with the identical seed version (an unrelated parent render).
    rerender(
      <WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational composerSeed={seed} />,
    );
    expect(composer.value).toBe("hand edited");
  });
});

/**
 * REACT-LIVE-SKELETON — the rail behaves like a live builder copilot: when a valid plan arrives, the
 * canvas updates automatically (no hidden extra click). Auto-show is display-only — it never applies.
 */
describe("WorkflowGuidancePanel — auto-show preview on canvas", () => {
  it("auto-shows the preview as soon as a clear plan arrives (no extra click)", async () => {
    const user = userEvent.setup();
    const onPreviewToCanvas = jest.fn();
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Here's the shape.",
      source: "hermes-agent",
      workflowPlan: planFor("Auto"),
      previewDraft: previewFor("Auto"),
    });
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational onPreviewToCanvas={onPreviewToCanvas} />);
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "watch new gmail");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() => expect(onPreviewToCanvas).toHaveBeenCalledTimes(1));
    expect(onPreviewToCanvas.mock.calls[0]![0]).toMatchObject({ plan: { title: "Auto" }, preview: { title: "Auto" } });
  });

  it("does NOT auto-show a plan that only restates the current graph shape", async () => {
    const user = userEvent.setup();
    const onPreviewToCanvas = jest.fn();
    // Current graph already has the exact gmail:new_email trigger the plan proposes.
    const getCurrentGraphShape = () => [{ kind: "trigger", provider: "gmail", type: "new_email" }];
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Same shape.",
      source: "hermes-agent",
      workflowPlan: planFor("Same"),
      previewDraft: previewFor("Same"),
    });
    render(
      <WorkflowGuidancePanel
        accountId="acct-1"
        workflowId="wf-9"
        conversational
        onPreviewToCanvas={onPreviewToCanvas}
        getCurrentGraphShape={getCurrentGraphShape}
      />,
    );
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "watch new gmail");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("workflow-guidance-result");
    // No auto-show + no "Show on canvas" control for a same-shape restatement.
    expect(onPreviewToCanvas).not.toHaveBeenCalled();
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull();
  });

  it("a clarifying (no-plan) turn does not auto-show and renders no preview", async () => {
    const user = userEvent.setup();
    const onPreviewToCanvas = jest.fn();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "Which app?", source: "hermes-agent", workflowPlan: null, previewDraft: null });
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational onPreviewToCanvas={onPreviewToCanvas} />);
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "automate stuff");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("workflow-guidance-result");
    expect(onPreviewToCanvas).not.toHaveBeenCalled();
    expect(screen.queryByTestId("workflow-guidance-preview")).toBeNull();
  });

  it("missing config values do not block the preview (it still auto-shows)", async () => {
    const user = userEvent.setup();
    const onPreviewToCanvas = jest.fn();
    const preview = previewFor("WithReq");
    // A node that still needs config — the preview must appear anyway.
    const previewWithMissing = {
      ...preview,
      nodes: [{ ...preview.nodes[0]!, missingInputs: ["channel", "text"] }],
    };
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Shape is clear; finish the details.",
      source: "hermes-agent",
      workflowPlan: planFor("WithReq"),
      previewDraft: previewWithMissing,
    });
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational onPreviewToCanvas={onPreviewToCanvas} />);
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "send slack");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() => expect(onPreviewToCanvas).toHaveBeenCalledTimes(1));
    // The still-incomplete node reaches the canvas with its missing fields intact — the "Needs setup"
    // badge and the rail's setup card are what surface them, not a restated prose list.
    expect(onPreviewToCanvas.mock.calls[0]![0].preview.nodes[0].missingInputs).toEqual(["channel", "text"]);
  });

  it("surfaces a catalog-gap warning when no plan could be built", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Here's what I can and can't do.",
      source: "hermes-agent",
      workflowPlan: null,
      previewDraft: null,
      warnings: ["ChainReact's Mailchimp integration doesn't have a send-campaign action yet."],
    });
    render(<WorkflowGuidancePanel accountId="acct-1" workflowId="wf-9" conversational />);
    await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "mailchimp win-back email");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    expect(await screen.findByTestId("workflow-guidance-warnings")).toHaveTextContent(/send-campaign/i);
  });
});

describe("WorkflowGuidancePanel — official template match (REACT-AGENT-TEMPLATE-MATCH-2)", () => {
  const HIGH_MATCH = {
    templateId: "c0ffee00-0000-4000-8000-00000000004e",
    name: "Support escalation from email",
    description: "Open a HubSpot ticket, Trello card, and Slack alert.",
    score: 20,
    confidence: "high" as const,
    reasons: ["Matches the Gmail new labeled email trigger"],
    isOfficial: true as const,
    providers: ["gmail", "hubspot", "slack"],
    providerLabels: ["Gmail", "HubSpot", "Slack"],
    triggerKind: "app" as const,
    category: "sales-crm",
    categoryLabel: "Sales & CRM",
    nodeCount: 5,
    stepCount: 4,
    steps: [{ kind: "action" as const, provider: "hubspot", type: "create_ticket", label: "HubSpot: Create ticket" }],
  };

  it("renders the match card when the response includes officialTemplateMatches", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "I found an official template that already matches this workflow.",
      source: "official_template_match",
      workflowPlan: null,
      previewDraft: null,
      officialTemplateMatches: [HIGH_MATCH],
    });
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "support email to HubSpot ticket and Slack");
    await user.click(screen.getByTestId("workflow-guidance-submit"));

    await waitFor(() => expect(screen.getByTestId("guidance-template-match")).toBeInTheDocument());
    expect(screen.getByText("Support escalation from email")).toBeInTheDocument();
    // recommendation-only: no auto-create control
    expect(screen.queryByText(/use template|create workflow|apply/i)).not.toBeInTheDocument();
    // no raw variable syntax leaks into the UI
    expect(document.body.textContent ?? "").not.toContain("{{");
  });

  it("renders no match card when the response omits officialTemplateMatches (unchanged behavior)", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "What app do your leads live in?", source: "hermes-agent", workflowPlan: null });
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "help me follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() => expect(screen.getByTestId("workflow-guidance-result")).toBeInTheDocument());
    expect(screen.queryByTestId("guidance-template-match")).not.toBeInTheDocument();
  });
});

describe("WorkflowGuidancePanel — Preview → Use flow (REACT-AGENT-TEMPLATE-MATCH-3)", () => {
  const MATCH = {
    templateId: "c0ffee00-0000-4000-8000-00000000004e",
    name: "Support escalation from email",
    description: "Open a HubSpot ticket and Slack alert.",
    score: 20,
    confidence: "high" as const,
    reasons: ["Matches the Gmail new labeled email trigger"],
    isOfficial: true as const,
    providers: ["gmail", "hubspot", "slack"],
    providerLabels: ["Gmail", "HubSpot", "Slack"],
    triggerKind: "app" as const,
    category: "sales-crm",
    categoryLabel: "Sales & CRM",
    nodeCount: 5,
    stepCount: 4,
    steps: [{ kind: "action" as const, provider: "hubspot", type: "create_ticket", label: "HubSpot: Create ticket" }],
  };

  async function openCardAndPreview() {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "I found an official template that already matches this workflow.",
      source: "official_template_match",
      workflowPlan: null,
      previewDraft: null,
      officialTemplateMatches: [MATCH],
    });
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "support email to HubSpot ticket and Slack");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() => expect(screen.getByTestId("guidance-template-preview-cta")).toBeInTheDocument());
    return user;
  }

  it("clicking Preview opens the confirmation dialog and creates NOTHING", async () => {
    const user = await openCardAndPreview();
    await user.click(screen.getByTestId("guidance-template-preview-cta"));
    expect(screen.getByTestId("guidance-template-preview-dialog")).toBeInTheDocument();
    expect(mockUseTemplate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("final 'Use this template' calls the existing use route once and navigates", async () => {
    const user = await openCardAndPreview();
    mockUseTemplate.mockResolvedValue({ workflowId: "wf-77", name: "Support escalation from email" });
    await user.click(screen.getByTestId("guidance-template-preview-cta"));
    await user.click(screen.getByTestId("guidance-template-preview-use"));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/workflows/wf-77?created=1"));
    expect(mockUseTemplate).toHaveBeenCalledTimes(1);
    expect(mockUseTemplate).toHaveBeenCalledWith("c0ffee00-0000-4000-8000-00000000004e", { targetAccountId: "acct-1" });
  });

  it("Cancel closes the dialog and creates nothing", async () => {
    const user = await openCardAndPreview();
    await user.click(screen.getByTestId("guidance-template-preview-cta"));
    await user.click(screen.getByTestId("guidance-template-preview-cancel"));
    await waitFor(() => expect(screen.queryByTestId("guidance-template-preview-dialog")).not.toBeInTheDocument());
    expect(mockUseTemplate).not.toHaveBeenCalled();
  });

  it("error path shows safe copy and creates/navigates nothing", async () => {
    const user = await openCardAndPreview();
    mockUseTemplate.mockRejectedValue(new TemplateApiError("Template no longer exists.", "TEMPLATE_NOT_FOUND", 404));
    await user.click(screen.getByTestId("guidance-template-preview-cta"));
    await user.click(screen.getByTestId("guidance-template-preview-use"));
    await waitFor(() => expect(screen.getByTestId("guidance-template-preview-error")).toHaveTextContent("Template no longer exists."));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
