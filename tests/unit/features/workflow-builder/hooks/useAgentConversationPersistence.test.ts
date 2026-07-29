const mockGetThread = jest.fn();
const mockAppend = jest.fn();
jest.mock("@/lib/api/builderAgentThread", () => ({
  getBuilderAgentThread: (...a: unknown[]) => mockGetThread(...a),
  appendBuilderAgentMessage: (...a: unknown[]) => mockAppend(...a),
}));

import { renderHook } from "@testing-library/react";
import { useAgentConversationPersistence } from "@/features/workflow-builder/hooks/useAgentConversationPersistence";
import type { GuidanceChatMessage } from "@/features/workflows/useGuidanceConversation";
import type { PersistedAgentMessage } from "@/contracts/builderAgentMessage";

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the builder's adapter between the
 * transcript and the stored rows.
 *
 * The mapping is the seam where a stored row becomes something the UI trusts, so
 * the properties worth pinning are: every restored turn is marked as history,
 * the proposal round-trips well enough to reopen, and the write is always scoped
 * to THIS workflow.
 */

const WF = "wf-1";
const CHANGE = "11111111-1111-4111-8111-111111111111";

function row(overrides: Partial<PersistedAgentMessage>): PersistedAgentMessage {
  return {
    id: "msg-1",
    role: "assistant",
    kind: "plan_result",
    content: "Here's the workflow.",
    safePayload: {},
    clientMessageId: null,
    requestId: null,
    agentChangeId: null,
    baseGraphVersion: null,
    proposal: null,
    createdAt: "2026-07-29T00:00:00Z",
    ...overrides,
  };
}

function mount(enabled = true) {
  const { result } = renderHook(() =>
    useAgentConversationPersistence({ workflowId: WF, enabled }),
  );
  return result.current;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAppend.mockResolvedValue(row({}));
});

it("is unavailable for the logged-out local-only builder", () => {
  expect(mount(false)).toBeUndefined();
});

it("loads THIS workflow's thread and marks every turn as restored history", async () => {
  mockGetThread.mockResolvedValue({
    thread: null,
    messages: [
      row({ id: "m1", role: "user", kind: "prompt", content: "post payments to Slack" }),
      row({
        id: "m2",
        agentChangeId: CHANGE,
        baseGraphVersion: "2026-07-29T10:00:00.000Z",
        proposal: {
          plan: { schemaVersion: 1, steps: [] },
          preview: { version: 1, nodes: [], edges: [] },
          definition: { nodes: [{ id: "n1" }], edges: [] },
          prompt: "post payments to Slack",
        },
      }),
      row({ id: "m3", kind: "review", content: "Status: 1 issue" }),
      row({ id: "m4", kind: "error", content: "Something went wrong." }),
    ],
  });

  const messages = await mount()!.load();
  expect(mockGetThread).toHaveBeenCalledWith(WF);
  expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "review", "error"]);
  expect(messages.every((m) => m.restored === true)).toBe(true);

  const proposalTurn = messages[1] as Extract<GuidanceChatMessage, { role: "assistant" }>;
  expect(proposalTurn.agentChangeId).toBe(CHANGE);
  expect(proposalTurn.baseGraphVersion).toBe("2026-07-29T10:00:00.000Z");
  expect(proposalTurn.prompt).toBe("post payments to Slack");
  expect(proposalTurn.proposedDefinition).toEqual({ nodes: [{ id: "n1" }], edges: [] });
});

it("restores a review turn WITHOUT stale setup targets", async () => {
  // Setup targets describe the live draft; a stored copy would point at fields
  // whose state has since changed, so the review restores as text only.
  mockGetThread.mockResolvedValue({
    thread: null,
    messages: [row({ id: "m1", kind: "review", content: "Status: ready" })],
  });
  const [review] = await mount()!.load();
  expect(review).toMatchObject({ role: "review", setupTargets: [], restored: true });
});

it("writes each turn to THIS workflow with a stable idempotency key", () => {
  const message: GuidanceChatMessage = {
    id: "7",
    role: "assistant",
    text: "Here's the workflow.",
    plan: { schemaVersion: 1, steps: [] } as never,
    preview: { version: 1, nodes: [], edges: [] } as never,
    proposedDefinition: { nodes: [], edges: [] } as never,
    baseGraphVersion: "2026-07-29T10:00:00.000Z",
    agentChangeId: CHANGE,
  };
  mount()!.append(message, { requestId: "req-9" });

  expect(mockAppend).toHaveBeenCalledTimes(1);
  const [workflowId, body] = mockAppend.mock.calls[0]! as [string, Record<string, unknown>];
  expect(workflowId).toBe(WF);
  expect(body).toMatchObject({
    role: "assistant",
    kind: "plan_result",
    clientMessageId: "m:7",
    requestId: "req-9",
    agentChangeId: CHANGE,
    baseGraphVersion: "2026-07-29T10:00:00.000Z",
  });
  expect(body.proposal).toMatchObject({ definition: { nodes: [], edges: [] } });
});

it("maps the deterministic review turn onto the assistant/review row shape", () => {
  mount()!.append(
    { id: "3", role: "review", text: "Status: ready", setupTargets: [] },
    { requestId: null },
  );
  expect(mockAppend.mock.calls[0]![1]).toMatchObject({ role: "assistant", kind: "review" });
});

it("a failed write is swallowed — the transcript never breaks the conversation", () => {
  mockAppend.mockRejectedValue(new Error("offline"));
  expect(() =>
    mount()!.append({ id: "1", role: "user", text: "hi" }, { requestId: null }),
  ).not.toThrow();
});
