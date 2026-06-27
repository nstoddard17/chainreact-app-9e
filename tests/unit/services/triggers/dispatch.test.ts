/**
 * @jest-environment node
 *
 * Tests for services/triggers/dispatch.ts.
 *
 * Verifies the locked rules from webhook-receipt-routes.md:
 *   - Dedup keyed on (provider, eventId).
 *   - Drops events for non-active workflows even when the trigger row
 *     still exists (paused retains registration; deregistration may lag).
 *   - Async dispatch only — calls enqueueRun and returns.
 *   - Dedup outage → fail-open + log marker; dispatch proceeds.
 */
const mockMarkSeen = jest.fn();
const mockListForDispatch = jest.fn();
const mockGetStateForDispatch = jest.fn();
const mockEnqueueRun = jest.fn();
const mockGetTriggerFilter = jest.fn();
const mockIsAccountFrozen = jest.fn();

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

jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: (...args: unknown[]) => mockIsAccountFrozen(...args),
}));

import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { FilterResult, TriggerFilter } from "@/core/triggers/filterContract";

const event: TriggerEvent = {
  provider: "slack",
  eventType: "message",
  eventId: "Ev123",
  occurredAt: "2026-05-07T00:00:00Z",
  providerAccountId: "T0001",
  payload: { text: "hi" },
};

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

beforeEach(() => {
  mockMarkSeen.mockReset();
  mockListForDispatch.mockReset();
  mockGetStateForDispatch.mockReset();
  mockEnqueueRun.mockReset();
  // Default: no filter registered for any (provider, eventType) — preserves
  // pre-P-S2 match-all behavior so the existing tests below run unchanged.
  mockGetTriggerFilter.mockReset();
  mockGetTriggerFilter.mockReturnValue(null);
  // Default: account is operational (not frozen) so existing tests are unchanged.
  mockIsAccountFrozen.mockReset();
  mockIsAccountFrozen.mockResolvedValue(false);
});

function makeFilter(overrides: Partial<TriggerFilter> = {}): TriggerFilter {
  return {
    provider: "slack",
    eventType: "message",
    parseConfig: (raw): unknown => raw,
    evaluate: (_event: TriggerEvent, _config: unknown): FilterResult => ({
      kind: "match",
    }),
    ...overrides,
  };
}

describe("dispatchTriggerEvent — happy path", () => {
  it("dedups → looks up resources → checks state → enqueues", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce("active");
    mockEnqueueRun.mockResolvedValueOnce({ runId: null, enqueuedAt: "" });

    const result = await dispatchTriggerEvent(event);

    expect(mockMarkSeen).toHaveBeenCalledWith("slack", "Ev123");
    expect(mockListForDispatch).toHaveBeenCalledWith("slack", "message");
    expect(mockGetStateForDispatch).toHaveBeenCalledWith("wf-1");
    expect(mockEnqueueRun).toHaveBeenCalledWith({
      workflowId: "wf-1",
      triggerNodeId: "n1",
      event,
      // Slice 6 durable queue — the dispatcher forwards the account from the
      // listForDispatch join so enqueueRun persists the durable 'queued' row
      // without re-loading the workflow.
      accountId: "acct-1",
    });
    expect(result).toEqual({
      matched: 1,
      enqueued: 1,
      duplicate: false,
      dedupOutage: false,
    });
  });

  it("enqueues for every active workflow that matches and skips inactive ones", async () => {
    const wfA = { ...baseResource, workflowId: "wf-A", nodeId: "nA" };
    const wfB = { ...baseResource, workflowId: "wf-B", nodeId: "nB" };
    const wfC = { ...baseResource, workflowId: "wf-C", nodeId: "nC" };
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([wfA, wfB, wfC]);
    mockGetStateForDispatch
      .mockResolvedValueOnce("active") // A
      .mockResolvedValueOnce("paused") // B - dropped
      .mockResolvedValueOnce("active"); // C
    mockEnqueueRun.mockResolvedValue({ runId: null, enqueuedAt: "" });

    const result = await dispatchTriggerEvent(event);
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
    expect(result.matched).toBe(3);
    expect(result.enqueued).toBe(2);
  });
});

describe("dispatchTriggerEvent — dedup", () => {
  it("drops the event without lookup or enqueue when dedup says it's already seen", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });
    const result = await dispatchTriggerEvent(event);
    expect(mockListForDispatch).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(result).toEqual({
      matched: 0,
      enqueued: 0,
      duplicate: true,
      dedupOutage: false,
    });
  });

  it("fail-open on dedup outage: dispatch proceeds and dedupOutage=true is set", async () => {
    mockMarkSeen.mockRejectedValueOnce(new Error("connection lost"));
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce("active");
    mockEnqueueRun.mockResolvedValueOnce({ runId: null, enqueuedAt: "" });

    const result = await dispatchTriggerEvent(event);
    expect(result.dedupOutage).toBe(true);
    expect(result.enqueued).toBe(1);
  });
});

describe("dispatchTriggerEvent — state-aware drop (rule §Disabled / paused workflows)", () => {
  it.each(["paused", "disabled", "eligible_to_resume", "draft", "deleted"] as const)(
    "drops without enqueue when workflow state is %s",
    async (state) => {
      mockMarkSeen.mockResolvedValueOnce({ fresh: true });
      mockListForDispatch.mockResolvedValueOnce([baseResource]);
      mockGetStateForDispatch.mockResolvedValueOnce(state);

      const result = await dispatchTriggerEvent(event);
      expect(mockEnqueueRun).not.toHaveBeenCalled();
      expect(result.matched).toBe(1);
      expect(result.enqueued).toBe(0);
    },
  );

  it("drops when getStateForDispatch returns null (workflow row gone)", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce(null);
    const result = await dispatchTriggerEvent(event);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(result.enqueued).toBe(0);
  });
});

describe("dispatchTriggerEvent — frozen-account drop (V2-READY-34)", () => {
  it("drops without enqueue when the owning account is frozen (active workflow)", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce("active");
    mockIsAccountFrozen.mockResolvedValueOnce(true);

    const result = await dispatchTriggerEvent(event);

    expect(mockIsAccountFrozen).toHaveBeenCalledWith("acct-1");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(result.matched).toBe(1);
    expect(result.enqueued).toBe(0);
  });

  it("still enqueues for an active workflow on a non-frozen account", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce("active");
    mockIsAccountFrozen.mockResolvedValueOnce(false);
    mockEnqueueRun.mockResolvedValueOnce({ runId: null, enqueuedAt: "" });

    const result = await dispatchTriggerEvent(event);

    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    expect(result.enqueued).toBe(1);
  });

  it("checks freeze per-resource: enqueues the non-frozen account, drops the frozen one", async () => {
    const wfActive = { ...baseResource, workflowId: "wf-ok", nodeId: "nok", workflowAccountId: "acct-ok" };
    const wfFrozen = { ...baseResource, workflowId: "wf-frozen", nodeId: "nfz", workflowAccountId: "acct-frozen" };
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([wfActive, wfFrozen]);
    mockGetStateForDispatch.mockResolvedValue("active");
    mockIsAccountFrozen.mockImplementation((id: string) =>
      Promise.resolve(id === "acct-frozen"),
    );
    mockEnqueueRun.mockResolvedValue({ runId: null, enqueuedAt: "" });

    const result = await dispatchTriggerEvent(event);

    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    expect(mockEnqueueRun).toHaveBeenCalledWith({
      workflowId: "wf-ok",
      triggerNodeId: "nok",
      event,
      accountId: "acct-ok",
    });
    expect(result).toEqual({ matched: 2, enqueued: 1, duplicate: false, dedupOutage: false });
  });

  it("no-leak: a frozen-account drop never logs the account id or payload", async () => {
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce("active");
    mockIsAccountFrozen.mockResolvedValueOnce(true);

    await dispatchTriggerEvent(event);

    const logged = debugSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("dropped_frozen_account");
    expect(logged).not.toContain("acct-1"); // account id never logged
    expect(logged).not.toContain("hi"); // event payload text never logged
    debugSpy.mockRestore();
  });
});

describe("dispatchTriggerEvent — no matching resources", () => {
  it("returns matched=0 when no trigger_resources rows exist for the event", async () => {
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([]);
    const result = await dispatchTriggerEvent(event);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(result).toEqual({
      matched: 0,
      enqueued: 0,
      duplicate: false,
      dedupOutage: false,
    });
  });
});

describe("dispatchTriggerEvent — per-trigger filter (P-S2)", () => {
  it("preserves existing behavior when no filter is registered for the (provider, eventType)", async () => {
    // Default mockGetTriggerFilter returns null; existing tests rely on this
    // path. Asserting it explicitly here documents the contract.
    mockGetTriggerFilter.mockReturnValue(null);
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce("active");
    mockEnqueueRun.mockResolvedValueOnce({ runId: null, enqueuedAt: "" });

    const result = await dispatchTriggerEvent(event);
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    expect(result.enqueued).toBe(1);
  });

  it("enqueues when the registered filter returns match", async () => {
    mockGetTriggerFilter.mockReturnValue(makeFilter());
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce("active");
    mockEnqueueRun.mockResolvedValueOnce({ runId: null, enqueuedAt: "" });

    const result = await dispatchTriggerEvent(event);
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    expect(result.matched).toBe(1);
    expect(result.enqueued).toBe(1);
  });

  it("skips enqueue when the registered filter returns no-match", async () => {
    mockGetTriggerFilter.mockReturnValue(
      makeFilter({
        evaluate: (): FilterResult => ({
          kind: "no-match",
          reason: "channel mismatch",
        }),
      }),
    );
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce("active");

    const result = await dispatchTriggerEvent(event);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(result.matched).toBe(1);
    expect(result.enqueued).toBe(0);
  });

  it("fails closed when the filter's evaluate throws — no enqueue", async () => {
    mockGetTriggerFilter.mockReturnValue(
      makeFilter({
        evaluate: () => {
          throw new Error("payload missing channel");
        },
      }),
    );
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce("active");

    const result = await dispatchTriggerEvent(event);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(result.matched).toBe(1);
    expect(result.enqueued).toBe(0);
  });

  it("fails closed when the filter's parseConfig throws — no enqueue", async () => {
    mockGetTriggerFilter.mockReturnValue(
      makeFilter({
        parseConfig: () => {
          throw new Error("invalid config: channelId must be a string");
        },
      }),
    );
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce("active");

    const result = await dispatchTriggerEvent(event);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(result.matched).toBe(1);
    expect(result.enqueued).toBe(0);
  });

  it("evaluates the filter independently per row — different configs produce different outcomes", async () => {
    const wfA = { ...baseResource, workflowId: "wf-A", nodeId: "nA", config: { channelId: "C-keep" } };
    const wfB = { ...baseResource, workflowId: "wf-B", nodeId: "nB", config: { channelId: "C-drop" } };
    const wfC = { ...baseResource, workflowId: "wf-C", nodeId: "nC", config: { channelId: "C-keep" } };

    mockGetTriggerFilter.mockReturnValue(
      makeFilter({
        parseConfig: (raw) => raw as { channelId?: string },
        evaluate: (_event, parsed): FilterResult => {
          const cfg = parsed as { channelId?: string };
          return cfg.channelId === "C-keep"
            ? { kind: "match" }
            : { kind: "no-match", reason: "channelId not matched" };
        },
      }),
    );

    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([wfA, wfB, wfC]);
    mockGetStateForDispatch
      .mockResolvedValueOnce("active") // A
      .mockResolvedValueOnce("active") // B
      .mockResolvedValueOnce("active"); // C
    mockEnqueueRun.mockResolvedValue({ runId: null, enqueuedAt: "" });

    const result = await dispatchTriggerEvent(event);
    expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
    expect(result.matched).toBe(3);
    expect(result.enqueued).toBe(2);
  });

  it("does not call the filter when dedup says the event is duplicate", async () => {
    const evaluate = jest.fn();
    const parseConfig = jest.fn();
    mockGetTriggerFilter.mockReturnValue(
      makeFilter({ parseConfig, evaluate }),
    );
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });

    const result = await dispatchTriggerEvent(event);
    expect(parseConfig).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
    expect(mockListForDispatch).not.toHaveBeenCalled();
    expect(result.duplicate).toBe(true);
  });

  it("does not call the filter for inactive workflows — state gate runs first", async () => {
    const evaluate = jest.fn();
    mockGetTriggerFilter.mockReturnValue(makeFilter({ evaluate }));
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([baseResource]);
    mockGetStateForDispatch.mockResolvedValueOnce("paused");

    const result = await dispatchTriggerEvent(event);
    expect(evaluate).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(result.enqueued).toBe(0);
  });

  it("looks up the filter once per dispatch, regardless of how many resources match", async () => {
    const wfA = { ...baseResource, workflowId: "wf-A", nodeId: "nA" };
    const wfB = { ...baseResource, workflowId: "wf-B", nodeId: "nB" };
    const wfC = { ...baseResource, workflowId: "wf-C", nodeId: "nC" };
    mockGetTriggerFilter.mockReturnValue(makeFilter());
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockListForDispatch.mockResolvedValueOnce([wfA, wfB, wfC]);
    mockGetStateForDispatch
      .mockResolvedValueOnce("active")
      .mockResolvedValueOnce("active")
      .mockResolvedValueOnce("active");
    mockEnqueueRun.mockResolvedValue({ runId: null, enqueuedAt: "" });

    await dispatchTriggerEvent(event);
    expect(mockGetTriggerFilter).toHaveBeenCalledTimes(1);
    expect(mockGetTriggerFilter).toHaveBeenCalledWith("slack", "message");
  });
});
