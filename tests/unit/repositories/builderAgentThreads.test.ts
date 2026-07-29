/**
 * @jest-environment node
 *
 * Tests for `repositories/builderAgentThreads.ts` (Slice 4.AI-23).
 *
 * Mocks the SSR-cookie Supabase client and asserts:
 *   - get-or-create picks the existing row when one exists for (user, workflow)
 *   - get-or-create inserts a new row when none exists, and recovers on
 *     concurrent-insert race (re-reads after a unique violation)
 *   - listMessagesForWorkflow filters on user_id + workflow_id + asc order
 *   - appendMessageForWorkflow inserts with the SanitizedAgentMessage shape +
 *     bumps the thread row's updated_at
 *   - clearThreadForWorkflow DELETEs scoped to the (user, workflow)
 */

/** One scripted reply per terminal call (single / maybeSingle / select-only). */
interface ScriptedResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

interface ChainState {
  filters: Array<{ op: string; args: unknown[] }>;
  insertPayloads: unknown[];
  updatePayloads: unknown[];
  scriptedSingles: ScriptedResult[];
  scriptedMaybeSingles: ScriptedResult[];
  scriptedThens: ScriptedResult[];
  isDeleteChain: boolean;
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    insert: jest.fn((p: unknown) => {
      state.insertPayloads.push(p);
      return builder;
    }),
    update: jest.fn((p: unknown) => {
      state.updatePayloads.push(p);
      return builder;
    }),
    delete: jest.fn(() => {
      state.filters.push({ op: "delete", args: [] });
      state.isDeleteChain = true;
      return builder;
    }),
    select: jest.fn((cols?: string) => {
      state.filters.push({ op: "select", args: [cols ?? "*"] });
      return builder;
    }),
    eq: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "eq", args: [col, val] });
      return builder;
    }),
    order: jest.fn((col: string, opts: unknown) => {
      state.filters.push({ op: "order", args: [col, opts] });
      return builder;
    }),
    limit: jest.fn((n: number) => {
      state.filters.push({ op: "limit", args: [n] });
      return builder;
    }),
    single: jest.fn(async () => {
      const next = state.scriptedSingles.shift();
      return { data: next?.data ?? null, error: next?.error ?? null };
    }),
    maybeSingle: jest.fn(async () => {
      const next = state.scriptedMaybeSingles.shift();
      return { data: next?.data ?? null, error: next?.error ?? null };
    }),
    then: (resolve: (v: unknown) => void) => {
      const next = state.scriptedThens.shift();
      state.isDeleteChain = false; // reset for next chain
      resolve({ data: next?.data ?? [], error: next?.error ?? null });
    },
  });
  return { from: jest.fn(() => builder), state };
}

const mockSSR: { current: ReturnType<typeof makeMockClient> | null } = {
  current: null,
};

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockSSR.current),
}));

import {
  appendMessageForWorkflow,
  clearThreadForWorkflow,
  getOrCreateThreadForWorkflow,
  listMessagesForWorkflow,
} from "@/repositories/builderAgentThreads";
import type { SanitizedAgentMessage } from "@/services/ai/builderAgent/sanitizeAgentMessage";

const threadRow = {
  id: "thr-1",
  user_id: "user-1",
  workflow_id: "wf-1",
  title: null,
  created_at: "2026-05-26T00:00:00Z",
  updated_at: "2026-05-26T00:00:00Z",
  archived_at: null,
};

const messageRow = {
  id: "msg-1",
  thread_id: "thr-1",
  user_id: "user-1",
  workflow_id: "wf-1",
  role: "user" as const,
  kind: "prompt" as const,
  content: "Post to Slack on new email",
  safe_payload: {},
  created_at: "2026-05-26T00:00:01Z",
};

function emptyState(): ChainState {
  return {
    filters: [],
    insertPayloads: [],
    updatePayloads: [],
    scriptedSingles: [],
    scriptedMaybeSingles: [],
    scriptedThens: [],
    isDeleteChain: false,
  };
}

describe("getOrCreateThreadForWorkflow", () => {
  it("returns the existing thread when one exists", async () => {
    const state = emptyState();
    state.scriptedMaybeSingles = [{ data: threadRow, error: null }];
    mockSSR.current = makeMockClient(state);
    const out = await getOrCreateThreadForWorkflow({
      userId: "user-1",
      workflowId: "wf-1",
    });
    expect(out.id).toBe("thr-1");
    expect(state.insertPayloads).toHaveLength(0);
    expect(state.filters).toContainEqual({ op: "eq", args: ["user_id", "user-1"] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["workflow_id", "wf-1"] });
  });

  it("inserts a new thread when none exists", async () => {
    const state = emptyState();
    // first read returns no row, then insert returns the new row via .single()
    state.scriptedMaybeSingles = [{ data: null, error: null }];
    state.scriptedSingles = [{ data: threadRow, error: null }];
    mockSSR.current = makeMockClient(state);
    const out = await getOrCreateThreadForWorkflow({
      userId: "user-1",
      workflowId: "wf-1",
    });
    expect(out.id).toBe("thr-1");
    expect(state.insertPayloads).toHaveLength(1);
    expect(state.insertPayloads[0]).toMatchObject({
      user_id: "user-1",
      workflow_id: "wf-1",
    });
  });

  it("re-reads on a concurrent-insert race (insert error → row appears)", async () => {
    const state = emptyState();
    // 1) first read: no row yet
    // 2) insert.single(): duplicate-key error, no data
    // 3) re-read: the lost-the-race row is now visible
    state.scriptedMaybeSingles = [
      { data: null, error: null },
      { data: threadRow, error: null },
    ];
    state.scriptedSingles = [{ data: null, error: { message: "duplicate key" } }];
    mockSSR.current = makeMockClient(state);
    const out = await getOrCreateThreadForWorkflow({
      userId: "user-1",
      workflowId: "wf-1",
    });
    expect(out.id).toBe("thr-1");
    expect(state.insertPayloads).toHaveLength(1);
  });

  it("surfaces the read error when the FIRST read errors out", async () => {
    const state = emptyState();
    state.scriptedMaybeSingles = [
      { data: null, error: { message: "boom" } },
    ];
    mockSSR.current = makeMockClient(state);
    await expect(
      getOrCreateThreadForWorkflow({ userId: "user-1", workflowId: "wf-1" }),
    ).rejects.toThrow(/read failed: boom/);
  });
});

describe("listMessagesForWorkflow", () => {
  it("filters by user_id + workflow_id, orders ascending, defaults limit to 500", async () => {
    const state = emptyState();
    state.scriptedThens = [{ data: [messageRow], error: null }];
    mockSSR.current = makeMockClient(state);
    const out = await listMessagesForWorkflow("user-1", "wf-1");
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("msg-1");
    expect(state.filters).toContainEqual({ op: "eq", args: ["user_id", "user-1"] });
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["workflow_id", "wf-1"],
    });
    expect(state.filters).toContainEqual({
      op: "order",
      args: ["created_at", { ascending: true }],
    });
    expect(state.filters).toContainEqual({ op: "limit", args: [500] });
  });

  it("caps the limit at 1000 even when caller asks for more", async () => {
    const state = emptyState();
    state.scriptedThens = [{ data: [], error: null }];
    mockSSR.current = makeMockClient(state);
    await listMessagesForWorkflow("user-1", "wf-1", { limit: 99_999 });
    expect(state.filters).toContainEqual({ op: "limit", args: [1_000] });
  });

  it("propagates Supabase list errors", async () => {
    const state = emptyState();
    state.scriptedThens = [{ data: null, error: { message: "boom" } }];
    mockSSR.current = makeMockClient(state);
    await expect(
      listMessagesForWorkflow("user-1", "wf-1"),
    ).rejects.toThrow(/listMessagesForWorkflow failed: boom/);
  });
});

describe("appendMessageForWorkflow", () => {
  it("inserts a sanitized message with user_id + workflow_id + thread_id and bumps thread.updated_at", async () => {
    const state = emptyState();
    // get-or-create finds existing thread → maybeSingle returns it.
    // Then message insert → single returns the new message row.
    // Then the thread updated_at bump → terminal `.update()` returns nothing.
    state.scriptedMaybeSingles = [{ data: threadRow, error: null }];
    state.scriptedSingles = [{ data: messageRow, error: null }];
    state.scriptedThens = [{ data: null, error: null }]; // updated_at bump
    mockSSR.current = makeMockClient(state);

    const sanitized: SanitizedAgentMessage = {
      role: "user",
      kind: "prompt",
      content: "Post to Slack on new email",
      safePayload: {},
      clientMessageId: null,
      requestId: null,
      agentChangeId: null,
      baseGraphVersion: null,
      proposal: null,
    };
    const out = await appendMessageForWorkflow({
      userId: "user-1",
      workflowId: "wf-1",
      message: sanitized,
    });
    expect(out.id).toBe("msg-1");
    expect(state.insertPayloads).toContainEqual(
      expect.objectContaining({
        thread_id: "thr-1",
        user_id: "user-1",
        workflow_id: "wf-1",
        role: "user",
        kind: "prompt",
        content: "Post to Slack on new email",
        safe_payload: {},
      }),
    );
    // thread updated_at bumped
    expect(state.updatePayloads.some((p) => {
      const obj = p as Record<string, unknown>;
      return typeof obj.updated_at === "string";
    })).toBe(true);
  });

  it("propagates Supabase insert errors", async () => {
    const state = emptyState();
    state.scriptedMaybeSingles = [{ data: threadRow, error: null }];
    state.scriptedSingles = [{ data: null, error: { message: "boom" } }];
    mockSSR.current = makeMockClient(state);
    await expect(
      appendMessageForWorkflow({
        userId: "user-1",
        workflowId: "wf-1",
        message: {
          role: "user",
          kind: "prompt",
          content: "hi",
          safePayload: {},
          clientMessageId: null,
          requestId: null,
          agentChangeId: null,
          baseGraphVersion: null,
          proposal: null,
        },
      }),
    ).rejects.toThrow(/appendMessageForWorkflow failed: boom/);
  });
});

describe("clearThreadForWorkflow", () => {
  it("DELETEs scoped to (user_id, workflow_id) and reports the count", async () => {
    const state = emptyState();
    state.scriptedThens = [
      { data: [{ id: "m1" }, { id: "m2" }], error: null },
    ];
    mockSSR.current = makeMockClient(state);
    const out = await clearThreadForWorkflow("user-1", "wf-1");
    expect(out.deletedCount).toBe(2);
    expect(state.filters).toContainEqual({ op: "delete", args: [] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["user_id", "user-1"] });
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["workflow_id", "wf-1"],
    });
  });

  it("returns 0 when there is nothing to delete", async () => {
    const state = emptyState();
    state.scriptedThens = [{ data: [], error: null }];
    mockSSR.current = makeMockClient(state);
    const out = await clearThreadForWorkflow("user-1", "wf-1");
    expect(out.deletedCount).toBe(0);
  });

  it("propagates Supabase delete errors", async () => {
    const state = emptyState();
    state.scriptedThens = [{ data: null, error: { message: "boom" } }];
    mockSSR.current = makeMockClient(state);
    await expect(
      clearThreadForWorkflow("user-1", "wf-1"),
    ).rejects.toThrow(/clearThreadForWorkflow failed: boom/);
  });
});

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — write idempotency.
 *
 * A retried append (network retry, a second tab, a re-render) must not add a
 * second copy of the same turn to the transcript. The partial UNIQUE index on
 * (thread_id, client_message_id) is the enforcement; the repository's job is to
 * return the ALREADY-STORED row instead of inserting or updating.
 */
describe("appendMessageForWorkflow — idempotency on clientMessageId", () => {
  const sanitizedWithKey: SanitizedAgentMessage = {
    role: "user",
    kind: "prompt",
    content: "post Stripe payments to Slack",
    safePayload: {},
    clientMessageId: "m:7",
    requestId: "req-1",
    agentChangeId: null,
    baseGraphVersion: null,
    proposal: null,
  };

  it("returns the existing row and inserts NOTHING when the key is already stored", async () => {
    const state = emptyState();
    // 1) get-or-create finds the thread. 2) the idempotency probe finds the message.
    state.scriptedMaybeSingles = [
      { data: threadRow, error: null },
      { data: { ...messageRow, client_message_id: "m:7" }, error: null },
    ];
    mockSSR.current = makeMockClient(state);

    const out = await appendMessageForWorkflow({
      userId: "user-1",
      workflowId: "wf-1",
      message: sanitizedWithKey,
    });
    expect(out.id).toBe("msg-1");
    expect(out.clientMessageId).toBe("m:7");
    // No duplicate transcript entry, and messages stay immutable.
    expect(state.insertPayloads).toHaveLength(0);
    expect(state.updatePayloads).toHaveLength(0);
  });

  it("re-reads the winning row when a concurrent write took the key first", async () => {
    const state = emptyState();
    state.scriptedMaybeSingles = [
      { data: threadRow, error: null },
      { data: null, error: null }, // probe: not there yet
      { data: { ...messageRow, client_message_id: "m:7" }, error: null }, // post-conflict re-read
    ];
    state.scriptedSingles = [
      { data: null, error: { message: "duplicate key value violates unique constraint" } },
    ];
    mockSSR.current = makeMockClient(state);

    const out = await appendMessageForWorkflow({
      userId: "user-1",
      workflowId: "wf-1",
      message: sanitizedWithKey,
    });
    expect(out.id).toBe("msg-1");
  });

  it("persists the reference columns on a fresh insert", async () => {
    const state = emptyState();
    state.scriptedMaybeSingles = [
      { data: threadRow, error: null },
      { data: null, error: null },
    ];
    state.scriptedSingles = [{ data: messageRow, error: null }];
    state.scriptedThens = [{ data: null, error: null }];
    mockSSR.current = makeMockClient(state);

    await appendMessageForWorkflow({
      userId: "user-1",
      workflowId: "wf-1",
      message: {
        ...sanitizedWithKey,
        role: "assistant",
        kind: "plan_result",
        agentChangeId: "11111111-1111-4111-8111-111111111111",
        baseGraphVersion: "2026-07-29T10:00:00.000Z",
        proposal: { preview: { title: "Payment alert" } },
      },
    });
    expect(state.insertPayloads).toContainEqual(
      expect.objectContaining({
        client_message_id: "m:7",
        request_id: "req-1",
        agent_change_id: "11111111-1111-4111-8111-111111111111",
        base_graph_version: "2026-07-29T10:00:00.000Z",
        proposal: { preview: { title: "Payment alert" } },
      }),
    );
  });
});
