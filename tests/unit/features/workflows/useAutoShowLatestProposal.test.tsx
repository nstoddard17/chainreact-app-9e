/**
 * REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1 — same-turn canvas delivery of agent proposals.
 *
 * The production defect: the auto-show effect lived inside the guidance panel, so a proposal that
 * arrived while the panel was UNMOUNTED (collapsed Document workspace, mode switch) was held in the
 * conversation and flushed onto the canvas only when the panel next mounted — which, in Document
 * mode, is the moment the user submits their NEXT message. The invariant pinned here: the hook is
 * hosted at the builder level, so a proposal renders during the turn that produced it whether or
 * not any panel is mounted, a handled turn can never resurface later, and restored history never
 * auto-shows.
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));

import {
  useAutoShowLatestProposal,
  type AgentProposalCanvasPayload,
} from "@/features/workflows/useAutoShowLatestProposal";
import {
  useGuidanceConversation,
  type GuidanceChatMessage,
} from "@/features/workflows/useGuidanceConversation";
import type { CanvasPreviewGraphNode } from "@/core/workflows/canvasPreviewEligibility";

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
      {
        previewId: "preview-step-1",
        role: "trigger" as const,
        provider: "gmail",
        type: "new_email",
        label: "gmail:new_email",
        purpose: "watch",
        notApplied: true as const,
      },
    ],
    edges: [],
  };
}

/** Hook-only host: messages come in as props — no panel involved at all. */
function HookHost(props: {
  messages: readonly GuidanceChatMessage[];
  onPreviewToCanvas: (p: AgentProposalCanvasPayload) => void;
  getCurrentGraphShape?: () => readonly CanvasPreviewGraphNode[];
}) {
  useAutoShowLatestProposal({
    messages: props.messages,
    onPreviewToCanvas: props.onPreviewToCanvas,
    ...(props.getCurrentGraphShape ? { getCurrentGraphShape: props.getCurrentGraphShape } : {}),
  });
  return null;
}

function assistantTurn(id: string, title: string, restored = false): GuidanceChatMessage {
  return {
    id,
    role: "assistant",
    text: title,
    plan: planFor(title) as never,
    preview: previewFor(title) as never,
    ...(restored ? { restored: true } : {}),
  } as GuidanceChatMessage;
}

describe("useAutoShowLatestProposal — hook contract", () => {
  it("shows the latest non-restored assistant proposal exactly once", () => {
    const onPreview = jest.fn();
    const messages = [assistantTurn("m1", "First")];
    const { rerender } = render(<HookHost messages={messages} onPreviewToCanvas={onPreview} />);
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview.mock.calls[0]![0]).toMatchObject({ plan: { title: "First" } });
    // Re-render with the same messages → no duplicate show.
    rerender(<HookHost messages={messages} onPreviewToCanvas={onPreview} />);
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("a newer proposal supersedes; the older one never re-fires", () => {
    const onPreview = jest.fn();
    const first = [assistantTurn("m1", "First")];
    const { rerender } = render(<HookHost messages={first} onPreviewToCanvas={onPreview} />);
    rerender(
      <HookHost messages={[...first, assistantTurn("m2", "Second")]} onPreviewToCanvas={onPreview} />,
    );
    expect(onPreview).toHaveBeenCalledTimes(2);
    expect(onPreview.mock.calls[1]![0]).toMatchObject({ plan: { title: "Second" } });
  });

  it("REGRESSION: a not-meaningful turn is marked HANDLED — later graph drift cannot resurrect it", () => {
    const onPreview = jest.fn();
    // The current graph already contains exactly the plan's shape → not meaningful → skipped.
    const sameShape: CanvasPreviewGraphNode[] = [
      { kind: "trigger", provider: "gmail", type: "new_email" } as CanvasPreviewGraphNode,
    ];
    const messages = [assistantTurn("m1", "Same shape")];
    const { rerender } = render(
      <HookHost messages={messages} onPreviewToCanvas={onPreview} getCurrentGraphShape={() => sameShape} />,
    );
    expect(onPreview).not.toHaveBeenCalled();
    // The graph later changes (user deletes the node). The OLD turn must stay skipped — it may
    // never pop onto the canvas as if a later turn produced it.
    rerender(
      <HookHost messages={messages} onPreviewToCanvas={onPreview} getCurrentGraphShape={() => []} />,
    );
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("restored (persisted-history) turns never auto-show", () => {
    const onPreview = jest.fn();
    render(
      <HookHost messages={[assistantTurn("m1", "Old session", true)]} onPreviewToCanvas={onPreview} />,
    );
    expect(onPreview).not.toHaveBeenCalled();
  });
});

/**
 * The production scenario end-to-end: the conversation is builder-owned; the transcript panel is
 * UNMOUNTED (collapsed Document workspace) when the response lands. The proposal must reach the
 * canvas in that same turn — no later message, expand, or remount required.
 */
function CollapsedWorkspaceHarness(props: {
  onPreviewToCanvas: (p: AgentProposalCanvasPayload) => void;
}) {
  const conversation = useGuidanceConversation({ accountId: "acct-1", workflowId: "wf-9" });
  const [expanded] = useState(false); // the transcript stays collapsed for the whole test
  useAutoShowLatestProposal({
    messages: conversation.messages,
    onPreviewToCanvas: props.onPreviewToCanvas,
    getCurrentGraphShape: () => [],
  });
  return (
    <div>
      {/* The always-visible composer bar — the transcript subtree is NOT rendered. */}
      <button data-testid="collapsed-send" onClick={() => void conversation.send("notify me in slack for new gmail")}>
        send
      </button>
      {expanded ? <div data-testid="transcript" /> : null}
    </div>
  );
}

describe("useAutoShowLatestProposal — same-turn delivery with the panel unmounted", () => {
  it("REGRESSION: a proposal arriving while the transcript is collapsed reaches the canvas immediately", async () => {
    const user = userEvent.setup();
    const onPreview = jest.fn();
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Here's the workflow.",
      source: "hermes-agent",
      workflowPlan: planFor("Gmail → Slack"),
      previewDraft: previewFor("Gmail → Slack"),
    });
    render(<CollapsedWorkspaceHarness onPreviewToCanvas={onPreview} />);
    expect(screen.queryByTestId("transcript")).toBeNull();
    await user.click(screen.getByTestId("collapsed-send"));
    // Same turn: the canvas got the proposal even though no transcript/panel is mounted.
    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1));
    expect(onPreview.mock.calls[0]![0]).toMatchObject({ plan: { title: "Gmail → Slack" } });
  });
});

/**
 * REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1 — latest-authoritative-request protection in the
 * conversation itself: a delayed older response may not mutate chat state after a newer request
 * became authoritative.
 */
function TwoSendsHarness(props: { onMessages: (m: readonly GuidanceChatMessage[]) => void }) {
  const conversation = useGuidanceConversation({ accountId: "acct-1", workflowId: "wf-9" });
  props.onMessages(conversation.messages);
  return (
    <div>
      <button data-testid="send-a" onClick={() => void conversation.send("first request")}>a</button>
      <button data-testid="send-b" onClick={() => void conversation.send("second request")}>b</button>
    </div>
  );
}

describe("useGuidanceConversation — stale responses are dropped", () => {
  it("REGRESSION: an older in-flight response resolving AFTER a newer request cannot append or win the canvas", async () => {
    let messages: readonly GuidanceChatMessage[] = [];
    const resolvers: Array<(v: unknown) => void> = [];
    mockRequest.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));

    render(<TwoSendsHarness onMessages={(m) => (messages = m)} />);
    // Two sends dispatched back-to-back in the same task — both pass the render-synced loading ref.
    await act(async () => {
      screen.getByTestId("send-a").click();
      screen.getByTestId("send-b").click();
    });
    expect(resolvers).toHaveLength(2);

    // The NEWER request resolves first with its own answer…
    await act(async () => {
      resolvers[1]!({
        ok: true,
        guidanceText: "answer B",
        source: "hermes-agent",
        workflowPlan: planFor("B"),
        previewDraft: previewFor("B"),
      });
    });
    // …then the OLDER one resolves late. It must be dropped, not appended after B.
    await act(async () => {
      resolvers[0]!({
        ok: true,
        guidanceText: "answer A (stale)",
        source: "hermes-agent",
        workflowPlan: planFor("A"),
        previewDraft: previewFor("A"),
      });
    });

    const assistantTexts = messages.filter((m) => m.role === "assistant").map((m) => m.text);
    expect(assistantTexts).toEqual(["answer B"]);
    // The latest assistant turn (what auto-show would render) is B — the stale A never surfaced.
    const latest = [...messages].reverse().find((m) => m.role === "assistant");
    expect(latest && "plan" in latest && (latest.plan as { title: string }).title).toBe("B");
  });
});
