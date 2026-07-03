/**
 * @jest-environment node
 *
 * Parity test: duplicate-webhook-delivery
 *
 * V1 incident this protects against:
 *   In V1, webhook receipt, idempotency dedup, and execution dispatch were
 *   tangled inside multi-thousand-line per-provider route files. A provider
 *   redelivering the same event (providers retry on any non-2xx, and some
 *   double-deliver even on 2xx) could slip past the inconsistent per-route
 *   dedup and enqueue the SAME workflow run twice — producing duplicate
 *   external side effects (a second email, a second Slack message, a second
 *   CRM write, a second charge).
 *
 * Expected V2 behavior (docs/rules/webhook-receipt-routes.md, testing-strategy.md §H):
 *   1. A duplicate (provider, eventId) delivery is deduped and enqueues at most once.
 *   2. When the dedup store is UNAVAILABLE, V2 fails CLOSED — it skips enqueue
 *      rather than risk a duplicate, because there is no downstream Q4
 *      within-session side-effect idempotency backstop wired
 *      (core/workflows/idempotency.ts ships only the pure key/hash helpers,
 *      no checkReplay/recordFired storage). This is the LAUNCH-DEDUP-FAILSAFE
 *      decision (2026-07-03): preventing a duplicate irreversible side effect
 *      beats maximizing webhook availability for the MVP.
 *
 * Business rule: docs/rules/webhook-receipt-routes.md §"Dedup outage policy".
 *
 * These tests exercise the REAL dispatcher (services/triggers/dispatch.ts) and
 * mock only the external boundaries (dedup store, trigger-resource lookup,
 * workflow-state lookup, enqueue) per the testing-strategy mocking rules.
 */
const mockMarkSeen = jest.fn();
const mockListForDispatch = jest.fn();
const mockGetStateForDispatch = jest.fn();
const mockEnqueueRun = jest.fn();

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
  getTriggerFilter: () => null,
}));
jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: () => Promise.resolve(false),
}));

import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const event: TriggerEvent = {
  provider: "slack",
  eventType: "message",
  eventId: "Ev-DUP-1",
  occurredAt: "2026-07-03T00:00:00Z",
  providerAccountId: "T0001",
  payload: { text: "process this order" },
};

const resource = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "slack",
  eventType: "message",
  nodeId: "n1",
  config: {},
  providerAccountId: null,
  registeredAt: "2026-07-03T00:00:00Z",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "2026-07-03T00:00:00Z",
  updatedAt: "2026-07-03T00:00:00Z",
};

beforeEach(() => {
  mockMarkSeen.mockReset();
  mockListForDispatch.mockReset();
  mockGetStateForDispatch.mockReset();
  mockEnqueueRun.mockReset();
  mockEnqueueRun.mockResolvedValue({ runId: "run-1", enqueuedAt: "" });
});

describe("parity: duplicate webhook delivery does not double-run a workflow", () => {
  it("enqueues exactly one run when the same provider event is delivered twice", async () => {
    // First delivery: dedup says fresh → the run is enqueued.
    // Second delivery (provider redelivery of the same eventId): dedup says
    // NOT fresh → the run is NOT enqueued a second time.
    mockMarkSeen
      .mockResolvedValueOnce({ fresh: true }) // 1st delivery
      .mockResolvedValueOnce({ fresh: false }); // 2nd (duplicate) delivery
    mockListForDispatch.mockResolvedValue([resource]);
    mockGetStateForDispatch.mockResolvedValue("active");

    const first = await dispatchTriggerEvent(event);
    const second = await dispatchTriggerEvent(event);

    // Only the first delivery enqueues; the duplicate is dropped at dedup.
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    expect(first.enqueued).toBe(1);
    expect(second.enqueued).toBe(0);
    expect(second.duplicate).toBe(true);
    // The duplicate never even reaches trigger lookup.
    expect(mockListForDispatch).toHaveBeenCalledTimes(1);
  });

  it("skips enqueue entirely when the dedup store is unavailable (fail closed, no backstop)", async () => {
    // Dedup store down → cannot confirm the event is new. With no downstream
    // Q4 side-effect idempotency, enqueuing here would risk two runs (and two
    // side effects) if the provider also redelivered. Fail closed instead.
    mockMarkSeen.mockRejectedValue(new Error("dedup store connection lost"));

    const result = await dispatchTriggerEvent(event);

    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockListForDispatch).not.toHaveBeenCalled();
    expect(result.enqueued).toBe(0);
    expect(result.dedupOutage).toBe(true);
  });

  it("two duplicate deliveries during a dedup outage still enqueue zero runs", async () => {
    // The most dangerous case the old fail-open policy exposed: the store is
    // down AND the provider double-delivers. Fail-closed guarantees zero runs,
    // so zero duplicate side effects.
    mockMarkSeen.mockRejectedValue(new Error("dedup store connection lost"));

    await dispatchTriggerEvent(event);
    await dispatchTriggerEvent(event);

    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});
