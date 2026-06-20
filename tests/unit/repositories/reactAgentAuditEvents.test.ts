/**
 * @jest-environment node
 *
 * Tests for repositories/reactAgentAuditEvents.ts (REACT-AGENT-CS-5B-AUDIT-STORAGE).
 * Mocks the service-role client (insert) + SSR-cookie client (account list). The
 * DB-level RLS / CHECK behavior (member-only read, invalid outcome/mode rejection,
 * set-null on delete) is enforced by the migration and proven by gated DB tests AFTER
 * db:push — see the CS-5b doc. These unit tests prove the repository's mapping +
 * client selection + account scoping without a live DB.
 */

interface InsertState {
  inserted: unknown;
  error: { message: string } | null;
}
function makeInsertClient(state: InsertState) {
  return {
    from: jest.fn(() => ({
      insert: jest.fn(async (row: unknown) => {
        state.inserted = row;
        return { error: state.error };
      }),
    })),
  };
}

interface ListState {
  data: unknown;
  error: { message: string } | null;
}
function makeRangeClient(state: ListState) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  const chain = (name: string) =>
    jest.fn((...args: unknown[]) => {
      calls[name] = args;
      return builder;
    });
  Object.assign(builder, {
    select: chain("select"),
    eq: chain("eq"),
    gte: chain("gte"),
    lte: chain("lte"),
    order: chain("order"),
    limit: chain("limit"),
    then: (resolve: (v: ListState) => unknown) =>
      resolve({ data: state.data, error: state.error }),
  });
  return { client: { from: jest.fn(() => builder) }, calls };
}

const mockServiceRole: { current: ReturnType<typeof makeInsertClient> | null } = { current: null };
const mockSSR: { current: { from: jest.Mock } | null } = { current: null };
const getServiceRoleClientMock = jest.fn((..._args: unknown[]) => mockServiceRole.current);

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockSSR.current),
}));
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: (...args: unknown[]) => getServiceRoleClientMock(...args),
}));

import {
  insertAuditEvent,
  listAuditEventsForAccount,
  type ReactAgentAuditEventInsert,
} from "@/repositories/reactAgentAuditEvents";

beforeEach(() => {
  mockServiceRole.current = null;
  mockSSR.current = null;
  getServiceRoleClientMock.mockClear();
});

const baseEvent: ReactAgentAuditEventInsert = {
  accountId: "acc-1",
  actorUserId: "user-1",
  capabilityId: "diagnosis_qa",
  intent: "answer_diagnosis_question",
  mode: "read_only",
  auditKind: "react_agent.diagnosis_qa",
  outcome: "success",
};

describe("reactAgentAuditEvents.insertAuditEvent", () => {
  it("writes through the SERVICE-ROLE client and maps safe fields to snake_case", async () => {
    const state: InsertState = { inserted: null, error: null };
    mockServiceRole.current = makeInsertClient(state);

    await insertAuditEvent({
      ...baseEvent,
      workflowId: "wf-1",
      creditFeature: "workflow_qa",
      aiCostEventId: "cost-1",
      metadata: { count: 2 },
    });

    expect(getServiceRoleClientMock).toHaveBeenCalledTimes(1);
    expect(state.inserted).toMatchObject({
      account_id: "acc-1",
      actor_user_id: "user-1",
      workflow_id: "wf-1",
      capability_id: "diagnosis_qa",
      intent: "answer_diagnosis_question",
      mode: "read_only",
      credit_feature: "workflow_qa",
      audit_kind: "react_agent.diagnosis_qa",
      outcome: "success",
      ai_cost_event_id: "cost-1",
      metadata: { count: 2 },
    });
  });

  it("defaults metadata to a plain object (never a scalar/array → satisfies the jsonb object CHECK)", async () => {
    const state: InsertState = { inserted: null, error: null };
    mockServiceRole.current = makeInsertClient(state);

    await insertAuditEvent(baseEvent);
    expect((state.inserted as Record<string, unknown>).metadata).toEqual({});

    await insertAuditEvent({ ...baseEvent, metadata: [1, 2] as unknown as Record<string, unknown> });
    expect((state.inserted as Record<string, unknown>).metadata).toEqual({});
  });

  it("nulls optional refs that are not provided", async () => {
    const state: InsertState = { inserted: null, error: null };
    mockServiceRole.current = makeInsertClient(state);
    await insertAuditEvent(baseEvent);
    expect(state.inserted).toMatchObject({
      workflow_id: null,
      conversation_id: null,
      credit_feature: null,
      reason: null,
      proposed_patch_ref: null,
      approval_id: null,
      ai_cost_event_id: null,
    });
  });

  it("throws a generic, detail-free error on a DB failure (no raw DB text leaked)", async () => {
    const state: InsertState = { inserted: null, error: { message: "duplicate key value xyz secret" } };
    mockServiceRole.current = makeInsertClient(state);
    await expect(insertAuditEvent(baseEvent)).rejects.toThrow(
      "react_agent_audit_events.insertAuditEvent failed",
    );
    await expect(insertAuditEvent(baseEvent)).rejects.not.toThrow(/secret|duplicate key/);
  });
});

describe("reactAgentAuditEvents.listAuditEventsForAccount", () => {
  it("reads through the SSR (RLS) client, filtered by account_id, newest first, with a default cap", async () => {
    const { client, calls } = makeRangeClient({ data: [], error: null });
    mockSSR.current = client;

    await listAuditEventsForAccount("acc-1");

    expect(calls.eq).toEqual(["account_id", "acc-1"]);
    expect(calls.order).toEqual(["created_at", { ascending: false }]);
    expect(calls.limit).toEqual([100]);
    // Must NOT use the service-role client for a member-facing read.
    expect(getServiceRoleClientMock).not.toHaveBeenCalled();
  });

  it("maps a row to a safe record shape", async () => {
    const { client } = makeRangeClient({
      data: [
        {
          id: "a1",
          account_id: "acc-1",
          actor_user_id: "user-1",
          workflow_id: null,
          conversation_id: null,
          capability_id: "diagnosis_explain",
          intent: "explain_diagnosis",
          mode: "read_only",
          credit_feature: "workflow_explanation",
          audit_kind: "react_agent.diagnosis_explain",
          outcome: "denied",
          reason: "credits_exhausted",
          proposed_patch_ref: null,
          approval_id: null,
          ai_cost_event_id: null,
          metadata: { k: 1 },
          created_at: "2026-06-19T00:00:00.000Z",
        },
      ],
      error: null,
    });
    mockSSR.current = client;

    const rows = await listAuditEventsForAccount("acc-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "a1",
      capabilityId: "diagnosis_explain",
      outcome: "denied",
      reason: "credits_exhausted",
      creditFeature: "workflow_explanation",
      metadata: { k: 1 },
    });
  });
});
