const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));

import { act, renderHook, waitFor } from "@testing-library/react";
import {
  toRecentTurns,
  useGuidanceConversation,
  type GuidanceChatMessage,
  type GuidanceConversationPersistence,
} from "@/features/workflows/useGuidanceConversation";
import { MAX_GUIDANCE_CONVERSATION_TURNS } from "@/contracts/aiGuidance";

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the conversation's side of durable
 * history.
 *
 * The rules being pinned here are the ones that make a restored transcript safe:
 * restoring is a read (never an AI request, never a charge), restored turns are
 * history rather than live proposals, and every new turn is written exactly once
 * with a stable idempotency key.
 */

const CTX = { accountId: "acct-1", workflowId: "wf-1" };

function fakePersistence(stored: readonly GuidanceChatMessage[] = []) {
  const appended: Array<{ message: GuidanceChatMessage; requestId: string | null }> = [];
  const load = jest.fn(async () => stored);
  const persistence: GuidanceConversationPersistence = {
    load,
    append: (message, meta) => {
      appended.push({ message, requestId: meta.requestId });
    },
  };
  return { persistence, appended, load };
}

const restoredTurns: readonly GuidanceChatMessage[] = [
  { id: "p:1", role: "user", text: "post Stripe payments to Slack", restored: true },
  {
    id: "p:2",
    role: "assistant",
    text: "Here's the workflow.",
    plan: { schemaVersion: 1, steps: [] } as never,
    preview: { version: 1, nodes: [], edges: [] } as never,
    baseGraphVersion: "2026-07-29T10:00:00.000Z",
    agentChangeId: "11111111-1111-4111-8111-111111111111",
    restored: true,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockResolvedValue({
    ok: true,
    guidanceText: "Here's the workflow.",
    source: "hermes-agent",
    workflowPlan: null,
    previewDraft: null,
  });
});

describe("restoring a transcript", () => {
  it("loads the stored turns and costs ZERO AI requests", async () => {
    const { persistence, load } = fakePersistence(restoredTurns);
    const { result } = renderHook(() => useGuidanceConversation(CTX, { persistence }));

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(load).toHaveBeenCalledTimes(1);
    // Restoration is deterministic database work: no guidance call was made.
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("marks every restored turn as history, so none of them is the live proposal", async () => {
    const { persistence } = fakePersistence(restoredTurns);
    const { result } = renderHook(() => useGuidanceConversation(CTX, { persistence }));

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages.every((m) => m.restored)).toBe(true);
    // The restored assistant turn is NOT actionable — nothing auto-shows or
    // starts a guided stage from history alone.
    expect(result.current.latestAssistantId).toBeNull();
  });

  it("loads once even across re-renders (a reload is one read, not a poll)", async () => {
    const { persistence, load } = fakePersistence(restoredTurns);
    const { result, rerender } = renderHook(() =>
      useGuidanceConversation(CTX, { persistence }),
    );
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    rerender();
    rerender();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("a failed restore degrades to a session-only conversation instead of breaking", async () => {
    const persistence: GuidanceConversationPersistence = {
      load: jest.fn(async () => {
        throw new Error("offline");
      }),
      append: jest.fn(),
    };
    const { result } = renderHook(() => useGuidanceConversation(CTX, { persistence }));
    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(result.current.messages).toHaveLength(0);
    await act(async () => {
      await result.current.send("hello");
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});

describe("writing turns", () => {
  it("persists the user turn and the assistant reply under ONE request id", async () => {
    const { persistence, appended } = fakePersistence();
    const { result } = renderHook(() => useGuidanceConversation(CTX, { persistence }));
    await waitFor(() => expect(result.current.restoring).toBe(false));

    await act(async () => {
      await result.current.send("post Stripe payments to Slack");
    });

    expect(appended).toHaveLength(2);
    expect(appended[0]!.message.role).toBe("user");
    expect(appended[1]!.message.role).toBe("assistant");
    expect(appended[0]!.requestId).toBe(appended[1]!.requestId);
    expect(appended[0]!.requestId).not.toBeNull();
    // ONE guidance call for ONE user request — the transcript write adds none.
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("gives each turn a distinct id, so a retried write is de-duplicable", async () => {
    const { persistence, appended } = fakePersistence();
    const { result } = renderHook(() => useGuidanceConversation(CTX, { persistence }));
    await waitFor(() => expect(result.current.restoring).toBe(false));

    await act(async () => {
      await result.current.send("one");
    });
    await act(async () => {
      await result.current.send("two");
    });
    const ids = appended.map((a) => a.message.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("persists an error turn without re-issuing (and therefore re-billing) the request", async () => {
    mockRequest.mockResolvedValue({ ok: false, code: "AI_CREDITS_EXHAUSTED", message: "no credits" });
    const { persistence, appended } = fakePersistence();
    const { result } = renderHook(() => useGuidanceConversation(CTX, { persistence }));
    await waitFor(() => expect(result.current.restoring).toBe(false));

    await act(async () => {
      await result.current.send("build me a thing");
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(appended.map((a) => a.message.role)).toEqual(["user", "error"]);
  });

  it("a persistence outage never breaks or repeats the conversation", async () => {
    const persistence: GuidanceConversationPersistence = {
      load: jest.fn(async () => []),
      append: jest.fn(() => {
        throw new Error("write failed");
      }),
    };
    const { result } = renderHook(() => useGuidanceConversation(CTX, { persistence }));
    await waitFor(() => expect(result.current.restoring).toBe(false));

    await act(async () => {
      await result.current.send("hello");
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toHaveLength(2);
  });

  it("mints a lifecycle correlation id only for turns that carry a proposal", async () => {
    const { persistence } = fakePersistence();
    const { result } = renderHook(() => useGuidanceConversation(CTX, { persistence }));
    await waitFor(() => expect(result.current.restoring).toBe(false));

    await act(async () => {
      await result.current.send("just chatting");
    });
    const proseTurn = result.current.messages.at(-1)!;
    expect(proseTurn.role).toBe("assistant");
    expect((proseTurn as { agentChangeId?: string }).agentChangeId).toBeUndefined();

    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Here's the workflow.",
      source: "hermes-agent",
      workflowPlan: { schemaVersion: 1, steps: [] },
      previewDraft: null,
    });
    await act(async () => {
      await result.current.send("build it");
    });
    const proposalTurn = result.current.messages.at(-1)!;
    expect((proposalTurn as { agentChangeId?: string }).agentChangeId).toEqual(expect.any(String));
  });
});

describe("model context after a restore", () => {
  it("sends restored turns as recent context, still bounded by the existing limits", async () => {
    const many: GuidanceChatMessage[] = Array.from({ length: 30 }, (_, i) => ({
      id: `p:${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      text: `turn ${i}`,
      ...(i % 2 === 0 ? {} : { plan: null, preview: null }),
      restored: true,
    })) as GuidanceChatMessage[];

    const { persistence } = fakePersistence(many);
    const { result } = renderHook(() => useGuidanceConversation(CTX, { persistence }));
    await waitFor(() => expect(result.current.messages).toHaveLength(30));

    await act(async () => {
      await result.current.send("and now this");
    });

    const sent = mockRequest.mock.calls[0]![0] as { recentTurns?: unknown[] };
    expect(sent.recentTurns).toHaveLength(MAX_GUIDANCE_CONVERSATION_TURNS);
    // The transcript is never sent whole — the same cap the in-memory chat used.
    expect(toRecentTurns(many)).toHaveLength(MAX_GUIDANCE_CONVERSATION_TURNS);
  });
});
