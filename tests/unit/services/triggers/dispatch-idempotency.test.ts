/**
 * @jest-environment node
 *
 * Idempotency harness for services/triggers/dispatch.ts.
 *
 * The sibling `dispatch.test.ts` covers each BRANCH in isolation (single-call
 * dedup hit/miss, state drop, filter match/no-match, outage). THIS file proves
 * the end-to-end REPLAY contract using a STATEFUL dedup mock (a Set keyed on
 * `provider:eventId`) so dedup behaves like the real `(provider, event_id)`
 * unique constraint instead of per-call scripted returns:
 *
 *   1. Same (provider, eventId) replayed N× → enqueue exactly ONCE; replays drop.
 *   2. Dedup key is (provider, eventId) — same eventId on a DIFFERENT provider
 *      is NOT deduped; both enqueue.
 *   3. Different eventId, same provider → each enqueues.
 *   4. The event is marked seen on FIRST receipt regardless of dispatch outcome
 *      — a replay is deduped even if the first receipt enqueued nothing (paused
 *      workflow). Documents that dedup is event-identity based, not outcome
 *      based (markSeen runs before the state/filter gates).
 *   5. Dedup outage is FAIL-OPEN — during an outage replays are NOT deduped and
 *      may double-enqueue (the documented tradeoff; downstream Q4 session
 *      idempotency is the second line of defense).
 *
 * All boundaries mocked; no live providers, no DB. Asserts behavior only — no
 * source change.
 */
const mockMarkSeen = jest.fn();
const mockListForDispatch = jest.fn();
const mockGetStateForDispatch = jest.fn();
const mockEnqueueRun = jest.fn();
const mockGetTriggerFilter = jest.fn();

jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));
jest.mock("@/repositories/triggerResources", () => ({
  listForDispatch: (...args: unknown[]) => mockListForDispatch(...args),
}));
jest.mock("@/repositories/workflows", () => ({
  getStateForDispatch: (...args: unknown[]) => mockGetStateForDispatch(...args),
}));
jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueueRun(...args),
}));
jest.mock("@/core/triggers/filterRegistry", () => ({
  getTriggerFilter: (...args: unknown[]) => mockGetTriggerFilter(...args),
}));
// V2-READY-34 — this harness exercises the real dispatch.ts, which now consults
// the account-freeze gate. Accounts are operational here (freeze behavior is
// covered in dispatch.test.ts); stub to non-frozen so the dedup/replay contract
// under test is unaffected.
jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: async () => false,
}));

import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const baseResource = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "slack",
  eventType: "message",
  nodeId: "n1",
  config: {},
  providerAccountId: null,
  registeredAt: "2026-05-07T00:00:00Z",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

function makeEvent(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    provider: "slack",
    eventType: "message",
    eventId: "Ev123",
    occurredAt: "2026-05-07T00:00:00Z",
    providerAccountId: "T0001",
    payload: { text: "hi" },
    ...overrides,
  };
}

/** Stateful dedup backed by a Set keyed exactly like the DB unique constraint. */
let seen: Set<string>;
function statefulMarkSeen() {
  return (provider: string, eventId: string) => {
    const key = `${provider}:${eventId}`;
    if (seen.has(key)) return Promise.resolve({ fresh: false });
    seen.add(key);
    return Promise.resolve({ fresh: true });
  };
}

beforeEach(() => {
  seen = new Set<string>();
  mockMarkSeen.mockReset();
  mockMarkSeen.mockImplementation(statefulMarkSeen());
  mockListForDispatch.mockReset();
  mockListForDispatch.mockResolvedValue([baseResource]);
  mockGetStateForDispatch.mockReset();
  mockGetStateForDispatch.mockResolvedValue("active");
  mockEnqueueRun.mockReset();
  mockEnqueueRun.mockResolvedValue({ runId: null, enqueuedAt: "" });
  mockGetTriggerFilter.mockReset();
  mockGetTriggerFilter.mockReturnValue(null);
});

describe("dispatch idempotency — replay of the same (provider, eventId)", () => {
  it("enqueues exactly once across 3 replays; replays return duplicate", async () => {
    const event = makeEvent();
    const first = await dispatchTriggerEvent(event);
    const second = await dispatchTriggerEvent(event);
    const third = await dispatchTriggerEvent(event);

    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ duplicate: false, enqueued: 1 });
    expect(second).toMatchObject({ duplicate: true, enqueued: 0, matched: 0 });
    expect(third).toMatchObject({ duplicate: true, enqueued: 0, matched: 0 });
    // Replays short-circuit before resource lookup.
    expect(mockListForDispatch).toHaveBeenCalledTimes(1);
  });
});

describe("dispatch idempotency — dedup key scoping", () => {
  it("does NOT dedup the same eventId across different providers", async () => {
    const slack = makeEvent({ provider: "slack", eventId: "SHARED-ID" });
    const github = makeEvent({ provider: "github", eventId: "SHARED-ID" });

    const a = await dispatchTriggerEvent(slack);
    const b = await dispatchTriggerEvent(github);

    expect(a).toMatchObject({ duplicate: false, enqueued: 1 });
    expect(b).toMatchObject({ duplicate: false, enqueued: 1 });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
    expect(mockMarkSeen).toHaveBeenCalledWith("slack", "SHARED-ID");
    expect(mockMarkSeen).toHaveBeenCalledWith("github", "SHARED-ID");
  });

  it("enqueues separately for different eventIds on the same provider", async () => {
    await dispatchTriggerEvent(makeEvent({ eventId: "Ev-A" }));
    await dispatchTriggerEvent(makeEvent({ eventId: "Ev-B" }));
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
  });

  it("composite key: provider+eventId pairs are independent (A:X, B:X enqueue; A:X replay drops)", async () => {
    await dispatchTriggerEvent(makeEvent({ provider: "slack", eventId: "X" }));
    await dispatchTriggerEvent(makeEvent({ provider: "github", eventId: "X" }));
    const replayA = await dispatchTriggerEvent(makeEvent({ provider: "slack", eventId: "X" }));

    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
    expect(replayA).toMatchObject({ duplicate: true, enqueued: 0 });
  });
});

describe("dispatch idempotency — dedup is event-identity based, not outcome based", () => {
  it("a replay is deduped even when the FIRST receipt enqueued nothing (paused → later active)", async () => {
    // First receipt: workflow paused → matched 1, enqueued 0, but event is now
    // marked seen (markSeen runs BEFORE the state gate).
    mockGetStateForDispatch.mockResolvedValueOnce("paused");
    const event = makeEvent();
    const first = await dispatchTriggerEvent(event);
    expect(first).toMatchObject({ matched: 1, enqueued: 0, duplicate: false });
    expect(mockEnqueueRun).not.toHaveBeenCalled();

    // Same physical event re-delivered after the workflow becomes active: it is
    // the SAME eventId, so it is deduped — it does NOT run. (A genuinely NEW
    // event with a fresh eventId would run; proven above.)
    mockGetStateForDispatch.mockResolvedValue("active");
    const replay = await dispatchTriggerEvent(event);
    expect(replay).toMatchObject({ duplicate: true, enqueued: 0 });
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});

describe("dispatch idempotency — fail-open dedup outage", () => {
  it("during an outage, replays are NOT deduped and may double-enqueue (documented tradeoff)", async () => {
    // markSeen throws on every call → dispatch proceeds (fail-open) and the
    // event is never recorded as seen, so a replay enqueues again.
    mockMarkSeen.mockReset();
    mockMarkSeen.mockRejectedValue(new Error("dedup store unavailable"));

    const event = makeEvent();
    const first = await dispatchTriggerEvent(event);
    const second = await dispatchTriggerEvent(event);

    expect(first).toMatchObject({ dedupOutage: true, enqueued: 1, duplicate: false });
    expect(second).toMatchObject({ dedupOutage: true, enqueued: 1, duplicate: false });
    // Fail-open means BOTH enqueue — downstream Q4 session idempotency is the
    // second line of defense against duplicate side effects.
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
  });
});
