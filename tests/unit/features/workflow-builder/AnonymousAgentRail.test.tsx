/**
 * REACT-LIVE-SKELETON-3 — the local-only rail's limited anonymous AI planning.
 *
 * Proves: a carried-over prompt auto-plans and auto-shows the preview on the canvas; follow-ups send
 * bounded recent turns; remaining attempts display; the limit response locks the composer + shows the
 * sign-up CTA; a no-plan reply renders the assistant message (no overlay); "Copy prompt" copies only
 * the safe prompt string.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGuidance = jest.fn();
jest.mock("@/lib/api/ai/anonymousGuidance", () => ({
  requestAnonymousGuidance: (...a: unknown[]) => mockGuidance(...a),
}));

import { AnonymousAgentRail } from "@/features/workflow-builder/panels/AnonymousAgentRail";

const PLAN = { schemaVersion: 1, title: "Manual → Slack", summary: "", notApplied: true, steps: [{ ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "" }] };
const PREVIEW = { version: 1, title: "Manual → Slack", summary: "", notice: "Preview only — your workflow has not changed.", notApplied: true as const, nodes: [], edges: [] };

function ok(extra: Record<string, unknown> = {}) {
  return { guidanceText: "Here's a plan.", workflowPlan: PLAN, previewDraft: PREVIEW, remainingAnonymousAttempts: 2, limitReached: false, ...extra };
}

beforeEach(() => {
  mockGuidance.mockReset().mockResolvedValue(ok());
});

describe("AnonymousAgentRail — limited anonymous AI planning", () => {
  it("auto-plans the carried-over prompt and auto-shows the preview on the canvas", async () => {
    const onShowPreview = jest.fn();
    render(<AnonymousAgentRail prompt="when a lead comes in, send a slack message" onShowPreview={onShowPreview} />);
    await waitFor(() => expect(onShowPreview).toHaveBeenCalledTimes(1));
    expect(onShowPreview.mock.calls[0]![0]).toMatchObject({ plan: { title: "Manual → Slack" }, preview: { title: "Manual → Slack" } });
    expect(mockGuidance).toHaveBeenCalledWith({ goalText: "when a lead comes in, send a slack message" });
    // Remaining attempts surface.
    expect(await screen.findByTestId("anonymous-agent-rail-remaining")).toHaveTextContent(/2 free preview/i);
  });

  it("sends bounded recent turns on a follow-up", async () => {
    const user = userEvent.setup();
    render(<AnonymousAgentRail prompt="plan a slack workflow" onShowPreview={jest.fn()} />);
    await waitFor(() => expect(mockGuidance).toHaveBeenCalledTimes(1));
    await user.type(screen.getByTestId("anonymous-agent-rail-prompt"), "actually use Mailchimp instead");
    await user.click(screen.getByTestId("anonymous-agent-rail-preview"));
    await waitFor(() => expect(mockGuidance).toHaveBeenCalledTimes(2));
    const secondCall = mockGuidance.mock.calls[1]![0];
    expect(secondCall.goalText).toBe("actually use Mailchimp instead");
    expect(Array.isArray(secondCall.recentTurns)).toBe(true);
    expect(secondCall.recentTurns.length).toBeGreaterThan(0);
  });

  it("locks the composer and shows the sign-up CTA when the anonymous limit is reached", async () => {
    mockGuidance.mockResolvedValue(ok({ workflowPlan: null, previewDraft: null, remainingAnonymousAttempts: 0, limitReached: true, guidanceText: "You've used the free previews." }));
    render(<AnonymousAgentRail prompt="plan it" onShowPreview={jest.fn()} />);
    expect(await screen.findByTestId("anonymous-agent-rail-limit")).toBeInTheDocument();
    // Composer is gone; the sign-up CTA points to the restore flow.
    expect(screen.queryByTestId("anonymous-agent-rail-prompt")).toBeNull();
    expect(screen.getByTestId("anonymous-agent-rail-signup")).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fstart%2Fcontinue&reason=ai",
    );
  });

  it("shows a safe 'temporarily unavailable' message (not the used-up copy) when planning is unavailable", async () => {
    mockGuidance.mockResolvedValue(
      ok({
        workflowPlan: null,
        previewDraft: null,
        remainingAnonymousAttempts: 0,
        limitReached: true,
        unavailable: true,
        guidanceText: "Free anonymous previews aren't available right now.",
      }),
    );
    render(<AnonymousAgentRail prompt="plan it" onShowPreview={jest.fn()} />);
    // Composer locks + sign-up CTA shows, exactly like the limit path...
    expect(await screen.findByTestId("anonymous-agent-rail-limit")).toBeInTheDocument();
    expect(screen.queryByTestId("anonymous-agent-rail-prompt")).toBeNull();
    expect(screen.getByTestId("anonymous-agent-rail-signup")).toBeInTheDocument();
    // ...but the message is the honest "unavailable" one, NOT "you've used your previews".
    const msg = screen.getByTestId("anonymous-agent-rail-unavailable");
    expect(msg).toHaveTextContent(/aren't available right now/i);
    expect(screen.queryByText(/used the free workflow previews/i)).toBeNull();
  });

  it("renders the assistant reply (and warnings) without an overlay when no plan is returned", async () => {
    mockGuidance.mockResolvedValue(ok({ workflowPlan: null, previewDraft: null, warnings: ["Mailchimp has no send-campaign action yet."], guidanceText: "I can tag but not send." }));
    const onShowPreview = jest.fn();
    render(<AnonymousAgentRail prompt="send a mailchimp campaign" onShowPreview={onShowPreview} />);
    await screen.findByTestId("anonymous-agent-rail-assistant");
    expect(screen.getByTestId("anonymous-agent-rail-warnings")).toHaveTextContent(/send-campaign/i);
    expect(onShowPreview).not.toHaveBeenCalled();
  });

  it("reports composer edits via onPromptChange", async () => {
    const user = userEvent.setup();
    const onPromptChange = jest.fn();
    render(<AnonymousAgentRail onPromptChange={onPromptChange} />);
    await user.type(screen.getByTestId("anonymous-agent-rail-prompt"), "abc");
    expect(onPromptChange).toHaveBeenLastCalledWith("abc");
    // No prompt → no auto-plan.
    expect(mockGuidance).not.toHaveBeenCalled();
  });

  it("copies only the safe prompt string", async () => {
    const user = userEvent.setup();
    render(<AnonymousAgentRail prompt="   Notify #wins on a 5-star review   " onShowPreview={jest.fn()} />);
    await user.click(screen.getByTestId("anonymous-agent-rail-copy"));
    expect(await navigator.clipboard.readText()).toBe("Notify #wins on a 5-star review");
  });
});
