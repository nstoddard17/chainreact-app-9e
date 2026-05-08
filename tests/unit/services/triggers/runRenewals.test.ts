/**
 * @jest-environment node
 *
 * Tests for services/triggers/runRenewals.ts. Mocks the trigger_resources
 * repo, the subscription registry, and the workflow state lookup so the
 * orchestrator's selection logic can be exercised in isolation.
 */
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

const mockListByConfigContains = jest.fn();
jest.mock("@/repositories/triggerResources", () => ({
  listByConfigContains: (...args: unknown[]) => mockListByConfigContains(...args),
}));

const mockGetStateForDispatch = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getStateForDispatch: (...args: unknown[]) => mockGetStateForDispatch(...args),
}));

import { runRenewals } from "@/services/triggers/runRenewals";
import {
  __resetSubscriptionRegistryForTests,
  registerSubscriptionHandler,
  type SubscriptionHandler,
} from "@/services/triggers/subscriptionRegistry";

beforeEach(() => {
  mockListByConfigContains.mockReset();
  mockGetStateForDispatch.mockReset();
  __resetSubscriptionRegistryForTests();
});

function makeTrigger(
  expiresAtIso: string,
  overrides: Partial<TriggerResourceRecord> = {},
): TriggerResourceRecord {
  return {
    id: `tr-${Math.random()}`,
    workflowId: "wf-1",
    userId: "user-1",
    provider: "google-calendar",
    eventType: "event_changed",
    nodeId: "n1",
    config: {
      type: "subscription-watch",
      expiresAt: expiresAtIso,
    },
    accountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function registerCalendarHandler(renew: jest.Mock): SubscriptionHandler {
  const handler: SubscriptionHandler = {
    id: "google-calendar:event_changed",
    canHandle: (t) =>
      t.provider === "google-calendar" &&
      (t.config as { type?: string }).type === "subscription-watch",
    getRenewalThresholdMs: () => 24 * 60 * 60 * 1000,
    renew,
  };
  registerSubscriptionHandler(handler);
  return handler;
}

describe("runRenewals", () => {
  it("returns examined=0 when no rows match the watch filter", async () => {
    mockListByConfigContains.mockResolvedValueOnce([]);
    const result = await runRenewals();
    expect(result.examined).toBe(0);
    expect(result.renewed).toBe(0);
  });

  it("renews rows expiring within 24h on active workflows", async () => {
    const renew = jest.fn(async () => {});
    registerCalendarHandler(renew);
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger(isoFromNow(60 * 60 * 1000)), // 1h away — eligible
    ]);
    mockGetStateForDispatch.mockResolvedValueOnce("active");

    const result = await runRenewals();
    expect(result.examined).toBe(1);
    expect(result.renewed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("skips rows whose expiry is beyond the renewal threshold", async () => {
    const renew = jest.fn();
    registerCalendarHandler(renew);
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger(isoFromNow(48 * 60 * 60 * 1000)), // 48h away
    ]);

    const result = await runRenewals();
    expect(result.examined).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.renewed).toBe(0);
    expect(renew).not.toHaveBeenCalled();
  });

  it("skips rows whose workflow is not active", async () => {
    const renew = jest.fn();
    registerCalendarHandler(renew);
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger(isoFromNow(60 * 60 * 1000)),
    ]);
    mockGetStateForDispatch.mockResolvedValueOnce("disabled");

    const result = await runRenewals();
    expect(result.skipped).toBe(1);
    expect(renew).not.toHaveBeenCalled();
  });

  it("skips rows with no matching handler", async () => {
    // No handler registered.
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger(isoFromNow(60 * 60 * 1000)),
    ]);

    const result = await runRenewals();
    expect(result.skipped).toBe(1);
    expect(result.renewed).toBe(0);
  });

  it("skips rows missing expiresAt in config", async () => {
    const renew = jest.fn();
    registerCalendarHandler(renew);
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger("invalid-date", {
        config: { type: "subscription-watch" }, // no expiresAt
      }),
    ]);

    const result = await runRenewals();
    expect(result.skipped).toBe(1);
  });

  it("isolates errors — one renew throws does not abort the batch", async () => {
    const renew = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("watch failed"));
    registerCalendarHandler(renew);
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger(isoFromNow(60 * 60 * 1000), { id: "tr-a" }),
      makeTrigger(isoFromNow(60 * 60 * 1000), { id: "tr-b" }),
    ]);
    mockGetStateForDispatch.mockResolvedValue("active");

    const result = await runRenewals();
    expect(result.examined).toBe(2);
    expect(result.renewed).toBe(1);
    expect(result.errors).toBe(1);
  });
});
