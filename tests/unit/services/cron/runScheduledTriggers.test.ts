/**
 * @jest-environment node
 *
 * Tests for services/cron/runScheduledTriggers — Native-nodes Slice 2
 * Commit 3 (docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §10.6).
 *
 * Mocks the trigger_resources repo, workflow state lookup, dispatcher,
 * and cron-expression utility so the orchestrator is tested in
 * isolation. Verifies:
 *   - Empty inventory → zero work.
 *   - Inactive workflow rows → skipped.
 *   - Future nextFireAt → skipped.
 *   - Malformed stored config → skipped + warn.
 *   - Due rows → dispatchTriggerEvent + cursor advance.
 *   - Composite eventId shape.
 *   - No catch-up (NPD-N13): the new cursor is computed from `now`,
 *     not from the prior `scheduledFireAt`.
 *   - One row failing does not abort the batch.
 */

const mockListForDispatch = jest.fn();
const mockUpsert = jest.fn();
jest.mock("@/repositories/triggerResources", () => ({
  listForDispatch: (...args: unknown[]) => mockListForDispatch(...args),
  upsert: (...args: unknown[]) => mockUpsert(...args),
}));

const mockGetStateForDispatch = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getStateForDispatch: (...args: unknown[]) =>
    mockGetStateForDispatch(...args),
}));

const mockDispatchTriggerEvent = jest.fn();
jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) =>
    mockDispatchTriggerEvent(...args),
}));

const mockComputeNextFireTime = jest.fn();
jest.mock("@/services/cron/cronExpression", () => ({
  computeNextFireTime: (...args: unknown[]) =>
    mockComputeNextFireTime(...args),
}));

// Block the side-effect registry import path while testing the
// orchestrator in isolation — none of the scheduled-trigger
// registration matters for the orchestrator's behaviour.
jest.mock("@/integrations/native/triggers/scheduledTrigger", () => {
  const { z } = jest.requireActual("zod");
  return {
    SCHEDULED_TRIGGER_PROVIDER: "native",
    SCHEDULED_TRIGGER_EVENT_TYPE: "schedule.fired",
    ScheduledTriggerStoredConfigSchema: z.object({
      cronExpression: z.string().min(1),
      nextFireAt: z.string().min(1),
      schedulerState: z.literal("armed").optional(),
    }),
  };
});

import { runScheduledTriggers } from "@/services/cron/runScheduledTriggers";

const NOW_MS = Date.parse("2026-05-16T12:00:00Z");

function row(overrides: Partial<{
  workflowId: string;
  userId: string;
  nodeId: string;
  config: Record<string, unknown>;
}> = {}) {
  return {
    id: "row-1",
    workflowId: overrides.workflowId ?? "wf-1",
    userId: overrides.userId ?? "user-1",
    provider: "native",
    eventType: "schedule.fired",
    nodeId: overrides.nodeId ?? "trigger-node",
    config: overrides.config ?? {
      cronExpression: "0 9 * * 1-5",
      nextFireAt: "2026-05-16T11:59:00Z",
      schedulerState: "armed",
    },
    providerAccountId: null,
    registeredAt: "2026-05-16T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-05-16T00:00:00Z",
    updatedAt: "2026-05-16T00:00:00Z",
  };
}

beforeEach(() => {
  mockListForDispatch.mockReset();
  mockUpsert.mockReset();
  mockUpsert.mockResolvedValue(undefined);
  mockGetStateForDispatch.mockReset();
  mockGetStateForDispatch.mockResolvedValue("active");
  mockDispatchTriggerEvent.mockReset();
  mockDispatchTriggerEvent.mockResolvedValue({
    matched: 1,
    enqueued: 1,
    duplicate: false,
    dedupOutage: false,
  });
  mockComputeNextFireTime.mockReset();
  mockComputeNextFireTime.mockReturnValue(
    new Date("2026-05-18T09:00:00Z"),
  );
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("runScheduledTriggers — empty inventory", () => {
  it("returns examined=0 / fired=0 / skipped=0 when no rows exist", async () => {
    mockListForDispatch.mockResolvedValueOnce([]);
    const result = await runScheduledTriggers(NOW_MS);
    expect(result).toEqual({
      examined: 0,
      fired: 0,
      skipped: 0,
      errors: 0,
      startedAt: expect.any(String),
    });
    expect(mockDispatchTriggerEvent).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("runScheduledTriggers — skip cases", () => {
  it("skips rows whose workflow state is not 'active'", async () => {
    mockListForDispatch.mockResolvedValueOnce([row()]);
    mockGetStateForDispatch.mockResolvedValueOnce("paused");
    const result = await runScheduledTriggers(NOW_MS);
    expect(result.fired).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockDispatchTriggerEvent).not.toHaveBeenCalled();
  });

  it("skips rows whose nextFireAt is strictly in the future", async () => {
    mockListForDispatch.mockResolvedValueOnce([
      row({
        config: {
          cronExpression: "0 9 * * 1-5",
          nextFireAt: "2026-05-16T13:00:00Z", // 1h after NOW_MS
          schedulerState: "armed",
        },
      }),
    ]);
    const result = await runScheduledTriggers(NOW_MS);
    expect(result.fired).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockDispatchTriggerEvent).not.toHaveBeenCalled();
  });

  it("skips rows with malformed stored config (no nextFireAt)", async () => {
    mockListForDispatch.mockResolvedValueOnce([
      row({ config: { cronExpression: "0 9 * * 1-5" } }),
    ]);
    const result = await runScheduledTriggers(NOW_MS);
    expect(result.fired).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockDispatchTriggerEvent).not.toHaveBeenCalled();
  });

  it("skips rows whose nextFireAt is unparseable", async () => {
    mockListForDispatch.mockResolvedValueOnce([
      row({
        config: {
          cronExpression: "0 9 * * 1-5",
          nextFireAt: "not-a-date",
        },
      }),
    ]);
    const result = await runScheduledTriggers(NOW_MS);
    expect(result.fired).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockDispatchTriggerEvent).not.toHaveBeenCalled();
  });
});

describe("runScheduledTriggers — fire path", () => {
  it("dispatches a due row AND advances nextFireAt to the new computed instant", async () => {
    mockListForDispatch.mockResolvedValueOnce([row()]);
    const result = await runScheduledTriggers(NOW_MS);
    expect(result).toEqual({
      examined: 1,
      fired: 1,
      skipped: 0,
      errors: 0,
      startedAt: expect.any(String),
    });

    expect(mockDispatchTriggerEvent).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockUpsert.mock.calls[0]![0] as {
      workflowId: string;
      nodeId: string;
      config: { nextFireAt: string; cronExpression: string };
    };
    expect(upsertCall.workflowId).toBe("wf-1");
    expect(upsertCall.nodeId).toBe("trigger-node");
    expect(upsertCall.config.nextFireAt).toBe(
      "2026-05-18T09:00:00.000Z",
    );
    expect(upsertCall.config.cronExpression).toBe("0 9 * * 1-5");
  });

  it("uses composite eventId schedule.fired:<wf>:<node>:<scheduledFireAtMs>", async () => {
    mockListForDispatch.mockResolvedValueOnce([row()]);
    await runScheduledTriggers(NOW_MS);
    const dispatched = mockDispatchTriggerEvent.mock.calls[0]![0] as {
      provider: string;
      eventType: string;
      eventId: string;
      payload: {
        scheduledFireAt: string;
        cronExpression: string;
        firedAt: string;
      };
    };
    const scheduledFireAtMs = Date.parse("2026-05-16T11:59:00Z");
    expect(dispatched.eventId).toBe(
      `schedule.fired:wf-1:trigger-node:${scheduledFireAtMs}`,
    );
    expect(dispatched.provider).toBe("native");
    expect(dispatched.eventType).toBe("schedule.fired");
    expect(dispatched.payload.scheduledFireAt).toBe("2026-05-16T11:59:00Z");
    expect(dispatched.payload.cronExpression).toBe("0 9 * * 1-5");
    expect(dispatched.payload.firedAt).toBe(
      new Date(NOW_MS).toISOString(),
    );
  });

  // V2-READY-16: meta/payload output contract. The schedule.fired meta
  // payloadShape advertises the references downstream nodes may use; it must
  // match the payload this orchestrator actually emits. The meta previously
  // advertised only `firedAt`, hiding the resolvable `scheduledFireAt` +
  // `cronExpression` — pin them in sync so it can't drift again.
  it("meta payloadShape names match the emitted fire payload keys (output contract)", async () => {
    const { scheduledTriggerMeta } = await import(
      "@/integrations/native/triggers/scheduledTrigger.meta"
    );
    mockListForDispatch.mockResolvedValueOnce([row()]);
    await runScheduledTriggers(NOW_MS);
    const dispatched = mockDispatchTriggerEvent.mock.calls[0]![0] as {
      payload: Record<string, unknown>;
    };
    const payloadKeys = Object.keys(dispatched.payload).sort();
    const metaKeys = scheduledTriggerMeta.payloadShape
      .map((p) => p.name)
      .sort();
    expect(metaKeys).toEqual(payloadKeys);
  });

  it("no catch-up (NPD-N13): cursor advances from `now`, not from `scheduledFireAt`", async () => {
    // Simulate a 2-hour outage — nextFireAt was 2h ago, we observe at NOW_MS.
    mockListForDispatch.mockResolvedValueOnce([
      row({
        config: {
          cronExpression: "0 * * * *", // hourly
          nextFireAt: "2026-05-16T10:00:00Z",
          schedulerState: "armed",
        },
      }),
    ]);
    // The mocked computeNextFireTime will be called with `now = NOW_MS`.
    mockComputeNextFireTime.mockReturnValueOnce(
      new Date("2026-05-16T13:00:00Z"),
    );
    await runScheduledTriggers(NOW_MS);
    // dispatchTriggerEvent fired ONCE (single missed instance), and
    // the cursor advanced to 13:00 — NOT 11:00 (which would be the
    // 11:00 hourly fire that we technically missed).
    expect(mockDispatchTriggerEvent).toHaveBeenCalledTimes(1);
    expect(mockComputeNextFireTime).toHaveBeenLastCalledWith(
      "0 * * * *",
      NOW_MS,
    );
    const upsertCall = mockUpsert.mock.calls[0]![0] as {
      config: { nextFireAt: string };
    };
    expect(upsertCall.config.nextFireAt).toBe("2026-05-16T13:00:00.000Z");
  });

  it("does NOT advance cursor when computeNextFireTime returns null", async () => {
    mockListForDispatch.mockResolvedValueOnce([row()]);
    mockComputeNextFireTime.mockReturnValueOnce(null);
    const result = await runScheduledTriggers(NOW_MS);
    expect(result.fired).toBe(1); // dispatch still happened
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("runScheduledTriggers — error isolation", () => {
  it("one row throwing does not abort the batch", async () => {
    mockListForDispatch.mockResolvedValueOnce([
      row({ workflowId: "wf-good", nodeId: "n-good" }),
      row({ workflowId: "wf-bad", nodeId: "n-bad" }),
    ]);
    mockDispatchTriggerEvent
      .mockResolvedValueOnce({
        matched: 1,
        enqueued: 1,
        duplicate: false,
        dedupOutage: false,
      })
      .mockRejectedValueOnce(new Error("dispatcher boom"));
    const result = await runScheduledTriggers(NOW_MS);
    expect(result.examined).toBe(2);
    expect(result.fired).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.skipped).toBe(0);
  });
});
