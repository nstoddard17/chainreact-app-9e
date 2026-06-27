/**
 * @jest-environment node
 *
 * Tests for the durable run-queue repository functions (Slice 6.DURABLE-QUEUE-1)
 * in repositories/workflowRunsLifecycle.ts (re-exported via workflowRuns.ts).
 *
 * Business rules protected:
 *   - enqueue persists a 'queued' row carrying full provenance, idempotent on PK.
 *   - the claim is a status-guarded UPDATE: `claimed` reflects rows affected, so
 *     two claims on the same run can never both win (only one transitions
 *     queued→running). This is the no-double-execution guarantee.
 *   - the processor's queued-row reads are scoped to status='queued'.
 *   - the stuck-queued failure guard only fails a row while it is still queued.
 */

interface ChainState {
  insertPayload?: unknown;
  updatePayload?: unknown;
  filters: Array<{ op: string; args: unknown[] }>;
  resultData: unknown;
  resultError: { message: string; code?: string } | null;
  maybeSingleResult?: { data: unknown; error: { message: string } | null };
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: jest.fn(() => builder),
    insert: jest.fn((payload: unknown) => {
      state.insertPayload = payload;
      return builder;
    }),
    update: jest.fn((payload: unknown) => {
      state.updatePayload = payload;
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
    limit: jest.fn((n: unknown) => {
      state.filters.push({ op: "limit", args: [n] });
      return builder;
    }),
    maybeSingle: jest.fn(async () =>
      state.maybeSingleResult ?? { data: null, error: null },
    ),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: state.resultData, error: state.resultError }),
  });
  return { from: jest.fn(() => builder), state };
}

const mockServiceRole: { current: ReturnType<typeof makeMockClient> | null } = {
  current: null,
};

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  createQueuedWorkflowRun,
  claimQueuedWorkflowRun,
  getQueuedRunForDispatch,
  listQueuedWorkflowRunsForDispatch,
  failQueuedRunIfStillQueued,
} from "@/repositories/workflowRuns";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const triggerEvent: TriggerEvent = {
  provider: "slack",
  eventType: "message",
  eventId: "Ev1",
  occurredAt: "2026-05-07T00:00:00Z",
  providerAccountId: "T0001",
  payload: { text: "hi" },
};

describe("createQueuedWorkflowRun", () => {
  it("INSERTs a row in 'queued' state with provenance, enqueue-time started_at, and null revision", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    const res = await createQueuedWorkflowRun({
      runId: "run-1",
      workflowId: "wf-1",
      accountId: "acct-1",
      triggeredByUserId: "user-1",
      triggerNodeId: "t1",
      triggerEvent,
      enqueuedAt: "2026-05-07T00:00:00Z",
      isTest: false,
      triggeredBy: "manual",
    });
    expect(res).toEqual({ created: true });
    expect(state.insertPayload).toMatchObject({
      id: "run-1",
      workflow_id: "wf-1",
      account_id: "acct-1",
      triggered_by_user_id: "user-1",
      status: "queued",
      trigger_node_id: "t1",
      trigger_event: triggerEvent,
      started_at: "2026-05-07T00:00:00Z",
      finished_at: null,
      is_test: false,
      triggered_by: "manual",
      revision_id: null,
    });
  });

  it("is idempotent on the PK: a duplicate enqueue (23505) returns created:false without throwing", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "duplicate key", code: "23505" },
    };
    mockServiceRole.current = makeMockClient(state);
    const res = await createQueuedWorkflowRun({
      runId: "run-1",
      workflowId: "wf-1",
      accountId: "acct-1",
      triggeredByUserId: null,
      triggerNodeId: "t1",
      triggerEvent,
      enqueuedAt: "2026-05-07T00:00:00Z",
      isTest: false,
      triggeredBy: "webhook",
    });
    expect(res).toEqual({ created: false });
  });

  it("throws on any non-conflict DB error (the run must not be silently dropped)", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "connection reset", code: "08006" },
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      createQueuedWorkflowRun({
        runId: "run-1",
        workflowId: "wf-1",
        accountId: "acct-1",
        triggeredByUserId: null,
        triggerNodeId: "t1",
        triggerEvent,
        enqueuedAt: "2026-05-07T00:00:00Z",
        isTest: false,
        triggeredBy: "webhook",
      }),
    ).rejects.toThrow(/connection reset/);
  });
});

describe("claimQueuedWorkflowRun — status-guarded single-winner claim", () => {
  it("transitions queued→running scoped to (id, status='queued') and reports claimed when a row was updated", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [{ id: "run-1" }],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);
    const res = await claimQueuedWorkflowRun({
      runId: "run-1",
      startedAt: "2026-05-07T00:00:05Z",
      revisionId: "rev-9",
    });
    expect(res).toEqual({ claimed: true });
    expect(state.updatePayload).toMatchObject({
      status: "running",
      started_at: "2026-05-07T00:00:05Z",
      revision_id: "rev-9",
    });
    // The guard predicate is what makes two concurrent claims safe.
    expect(state.filters).toContainEqual({ op: "eq", args: ["id", "run-1"] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["status", "queued"] });
  });

  it("reports claimed:false when no row matched (already running/terminal — the LOSER of a race)", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockServiceRole.current = makeMockClient(state);
    const res = await claimQueuedWorkflowRun({
      runId: "run-1",
      startedAt: "2026-05-07T00:00:05Z",
    });
    expect(res).toEqual({ claimed: false });
  });

  it("only one of two sequential claims on the same run wins (simulated race)", async () => {
    // First claim: row was queued → 1 row updated → claimed.
    mockServiceRole.current = makeMockClient({
      filters: [],
      resultData: [{ id: "run-1" }],
      resultError: null,
    });
    const first = await claimQueuedWorkflowRun({ runId: "run-1", startedAt: "t" });
    // Second claim: row is no longer queued → 0 rows → not claimed.
    mockServiceRole.current = makeMockClient({
      filters: [],
      resultData: [],
      resultError: null,
    });
    const second = await claimQueuedWorkflowRun({ runId: "run-1", startedAt: "t" });
    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);
  });
});

describe("getQueuedRunForDispatch", () => {
  it("reads only a still-queued row and maps it to the dispatch envelope", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: null,
      maybeSingleResult: {
        data: {
          id: "run-1",
          workflow_id: "wf-1",
          trigger_node_id: "t1",
          trigger_event: triggerEvent,
          is_test: false,
          triggered_by: "manual",
          triggered_by_user_id: "user-1",
          triggered_by_api_key_id: null,
          triggered_by_api_key_prefix: null,
        },
        error: null,
      },
    };
    mockServiceRole.current = makeMockClient(state);
    const env = await getQueuedRunForDispatch("run-1");
    expect(env).toEqual({
      runId: "run-1",
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      isTest: false,
      triggeredBy: "manual",
      triggeredByUserId: "user-1",
      triggeredByApiKeyId: null,
      triggeredByApiKeyPrefix: null,
    });
    expect(state.filters).toContainEqual({ op: "eq", args: ["status", "queued"] });
  });

  it("returns null when the row is absent or no longer queued", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: null,
      maybeSingleResult: { data: null, error: null },
    };
    mockServiceRole.current = makeMockClient(state);
    expect(await getQueuedRunForDispatch("run-1")).toBeNull();
  });
});

describe("listQueuedWorkflowRunsForDispatch", () => {
  it("lists queued rows oldest-first and maps them to envelopes", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [
        {
          id: "run-1",
          workflow_id: "wf-1",
          trigger_node_id: "t1",
          trigger_event: triggerEvent,
          is_test: false,
          triggered_by: "webhook",
          triggered_by_user_id: null,
          triggered_by_api_key_id: null,
          triggered_by_api_key_prefix: null,
        },
      ],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);
    const rows = await listQueuedWorkflowRunsForDispatch(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runId: "run-1", triggeredBy: "webhook" });
    expect(state.filters).toContainEqual({ op: "eq", args: ["status", "queued"] });
    expect(state.filters).toContainEqual({
      op: "order",
      args: ["created_at", { ascending: true }],
    });
    expect(state.filters).toContainEqual({ op: "limit", args: [10] });
  });

  it("caps the batch at 500 even if a larger limit is requested", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockServiceRole.current = makeMockClient(state);
    await listQueuedWorkflowRunsForDispatch(99999);
    expect(state.filters).toContainEqual({ op: "limit", args: [500] });
  });
});

describe("failQueuedRunIfStillQueued — stuck-queued recovery guard", () => {
  it("fails a still-queued row (scoped to status='queued') and reports failed:true", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [{ id: "run-1" }],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);
    const res = await failQueuedRunIfStillQueued({
      runId: "run-1",
      fatalError: { code: "WORKFLOW_NOT_FOUND", message: "gone" },
      errorClassification: {
        title: "t",
        description: "d",
        severity: "error",
      },
      finishedAt: "2026-05-07T00:00:10Z",
    });
    expect(res).toEqual({ failed: true });
    expect(state.updatePayload).toMatchObject({ status: "failed" });
    expect(state.filters).toContainEqual({ op: "eq", args: ["status", "queued"] });
  });

  it("is a no-op (failed:false) when the row is no longer queued (engine already claimed it)", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockServiceRole.current = makeMockClient(state);
    const res = await failQueuedRunIfStillQueued({
      runId: "run-1",
      fatalError: { code: "WORKFLOW_NOT_FOUND", message: "gone" },
      errorClassification: { title: "t", description: "d", severity: "error" },
      finishedAt: "2026-05-07T00:00:10Z",
    });
    expect(res).toEqual({ failed: false });
  });
});
