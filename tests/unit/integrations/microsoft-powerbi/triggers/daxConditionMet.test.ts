/**
 * @jest-environment node
 */
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockRefreshAndRetry = jest.fn();
const mockExecuteQueries = jest.fn();
const mockEnqueue = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActive = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/datasets/executeQueries", () => ({
  executeQueries: (...args: unknown[]) => mockExecuteQueries(...args),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueue(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActive(...args),
}));

import { activate } from "@/integrations/microsoft-powerbi/triggers/daxConditionMet/activate";
import { pollDaxConditionMet } from "@/integrations/microsoft-powerbi/triggers/_shared/pollDax";

const BASE_CONFIG = {
  workspaceId: "ws-1",
  semanticModelId: "sm-1",
  daxQuery: 'EVALUATE ROW("Total", [Total Sales])',
  operator: "gt" as const,
  threshold: "1000",
};

function integration(): IntegrationRecord {
  return {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "u-1",
    provider: "microsoft-powerbi",
    providerAccountId: "alice@contoso.com",
    displayName: "Alice",
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: "enc",
    accessTokenExpiresAt: null,
    scopes: ["Dataset.ReadWrite.All"],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
  };
}

function activateCtx(overrides?: Record<string, unknown>): {
  integration: IntegrationRecord;
  node: WorkflowNode;
  workflowId: string;
} {
  const node: WorkflowNode = {
    id: "n-1",
    type: "microsoft-powerbi:dax_condition_met",
    provider: "microsoft-powerbi",
    kind: "trigger",
    config: { ...BASE_CONFIG, ...overrides },
    position: { x: 0, y: 0 },
  };
  return { integration: integration(), node, workflowId: "wf-1" };
}

function trigger(snapshot?: {
  lastConditionMet: boolean;
  updatedAt: string;
}): TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "u-1",
    provider: "microsoft-powerbi",
    eventType: "dax_condition_met",
    nodeId: "n-1",
    config: {
      ...BASE_CONFIG,
      pollingEnabled: true,
      ...(snapshot ? { snapshot } : {}),
    },
    providerAccountId: null,
    registeredAt: "2026-07-15T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
  };
}

const SNAPSHOT_FALSE = {
  lastConditionMet: false,
  updatedAt: "2026-07-15T00:00:00Z",
};
const SNAPSHOT_TRUE = {
  lastConditionMet: true,
  updatedAt: "2026-07-15T00:00:00Z",
};

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockExecuteQueries.mockReset();
  mockEnqueue.mockReset();
  mockUpdateConfig.mockReset();
  mockGetActive.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockEnqueue.mockResolvedValue({ runId: "r-1", enqueuedAt: "2026-07-15T12:00:00Z" });
  mockUpdateConfig.mockResolvedValue(undefined);
  mockGetActive.mockResolvedValue(integration());
});

describe("dax_condition_met activation", () => {
  it("seeds the snapshot with the condition's current truth value", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: [{ "[Total]": 5000 }] });

    const result = await activate(activateCtx());

    expect(mockExecuteQueries).toHaveBeenCalledTimes(1);
    expect(result.pollingEnabled).toBe(true);
    const snap = result.snapshot as { lastConditionMet: boolean; updatedAt: string };
    // 5000 > 1000 — already true at activation, so the first poll must not replay it.
    expect(snap.lastConditionMet).toBe(true);
    expect(typeof snap.updatedAt).toBe("string");
  });

  it("seeds false when the condition is not currently met", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: [{ "[Total]": 10 }] });

    const result = await activate(activateCtx());

    expect((result.snapshot as { lastConditionMet: boolean }).lastConditionMet).toBe(false);
  });

  it("first poll after activation emits ZERO events (already-true condition)", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: [{ "[Total]": 5000 }] });
    const seeded = await activate(activateCtx());

    mockExecuteQueries.mockResolvedValueOnce({ rows: [{ "[Total]": 5000 }] });
    await pollDaxConditionMet({
      trigger: {
        ...trigger(),
        config: { ...BASE_CONFIG, pollingEnabled: true, snapshot: seeded.snapshot },
      },
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("throws when the seed query fails (→ TRIGGER_REGISTRATION_FAILED)", async () => {
    mockExecuteQueries.mockRejectedValueOnce(new Error("Power BI 503"));

    await expect(activate(activateCtx())).rejects.toThrow(/503/);
  });

  it("rejects a missing daxQuery in node.config", async () => {
    await expect(activate(activateCtx({ daxQuery: "" }))).rejects.toThrow();
  });
});

describe("dax_condition_met poll", () => {
  it("emits on the false→true transition with the exact payload + short-form eventType", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: [{ "[Total]": 5000 }] });

    await pollDaxConditionMet({
      trigger: trigger(SNAPSHOT_FALSE),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T12:00:00Z"),
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const call = mockEnqueue.mock.calls[0]![0] as {
      workflowId: string;
      triggerNodeId: string;
      event: { eventType: string; eventId: string; payload: Record<string, unknown> };
    };
    expect(call.workflowId).toBe("wf-1");
    expect(call.triggerNodeId).toBe("n-1");
    expect(call.event.eventType).toBe("dax_condition_met");
    expect(call.event.payload).toEqual({
      workspaceId: "ws-1",
      semanticModelId: "sm-1",
      value: 5000,
      operator: "gt",
      threshold: "1000",
      conditionMet: true,
    });
  });

  it("does NOT emit when the condition was already true (edge-triggered)", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: [{ "[Total]": 5000 }] });

    await pollDaxConditionMet({
      trigger: trigger(SNAPSHOT_TRUE),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("does NOT emit when the condition is not met, and re-arms the snapshot", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: [{ "[Total]": 10 }] });

    await pollDaxConditionMet({
      trigger: trigger(SNAPSHOT_TRUE),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
    const [, config] = mockUpdateConfig.mock.calls[0] as [string, Record<string, unknown>];
    expect((config.snapshot as { lastConditionMet: boolean }).lastConditionMet).toBe(false);
  });

  it("treats an empty result set as not met", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: [] });

    await pollDaxConditionMet({
      trigger: trigger(SNAPSHOT_FALSE),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("persists the snapshot + polling.lastPolledAt", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: [{ "[Total]": 5000 }] });

    await pollDaxConditionMet({
      trigger: trigger(SNAPSHOT_FALSE),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T12:00:00Z"),
    });

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [id, config] = mockUpdateConfig.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("tr-1");
    expect((config.snapshot as { lastConditionMet: boolean }).lastConditionMet).toBe(true);
    expect(config.polling).toEqual({ lastPolledAt: "2026-07-15T12:00:00.000Z" });
  });

  it("warns + skips without re-seeding when the snapshot is missing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await pollDaxConditionMet({
      trigger: trigger(),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockExecuteQueries).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("microsoft-powerbi.poll.no_snapshot"),
    );
    warn.mockRestore();
  });

  it("throws for an ordering operator against a non-numeric result", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: [{ "[Status]": "healthy" }] });

    await expect(
      pollDaxConditionMet({
        trigger: trigger(SNAPSHOT_FALSE),
        providerAccountId: "alice@contoso.com",
        now: Date.now(),
      }),
    ).rejects.toThrow(/numeric/i);
  });

  it("supports eq against a text result", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: [{ "[Status]": "breached" }] });
    const t = trigger(SNAPSHOT_FALSE);

    await pollDaxConditionMet({
      trigger: {
        ...t,
        config: { ...t.config, operator: "eq", threshold: "breached" },
      },
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("propagates provider errors so the cron surfaces them", async () => {
    mockExecuteQueries.mockRejectedValueOnce(new Error("Power BI 429"));

    await expect(
      pollDaxConditionMet({
        trigger: trigger(SNAPSHOT_FALSE),
        providerAccountId: "alice@contoso.com",
        now: Date.now(),
      }),
    ).rejects.toThrow(/429/);
  });

  it("produces a timestamp-free eventId that is stable across two identical ticks", async () => {
    mockExecuteQueries.mockResolvedValue({ rows: [{ "[Total]": 5000 }] });

    await pollDaxConditionMet({
      trigger: trigger(SNAPSHOT_FALSE),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T12:00:00Z"),
    });
    await pollDaxConditionMet({
      trigger: trigger(SNAPSHOT_FALSE),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T13:30:00Z"),
    });

    const first = (mockEnqueue.mock.calls[0]![0] as { event: { eventId: string } }).event.eventId;
    const second = (mockEnqueue.mock.calls[1]![0] as { event: { eventId: string } }).event.eventId;
    expect(first).toBe("microsoft-powerbi:wf-1:n-1:dax_condition_met:gt:1000:5000");
    expect(second).toBe(first);
    expect(first).not.toMatch(/2026-07-15T/);
  });

  it("leaks no token, raw provider body, or DAX blob into the payload", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: [{ "[Total]": 5000 }] });

    await pollDaxConditionMet({
      trigger: trigger(SNAPSHOT_FALSE),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    const payload = JSON.stringify(
      (mockEnqueue.mock.calls[0]![0] as { event: { payload: unknown } }).event.payload,
    );
    expect(payload).not.toContain("tok");
    expect(payload).not.toContain("Bearer");
    expect(payload).not.toContain("api.powerbi.com");
    // The author's DAX text is config, not event data — it must not ride along.
    expect(payload).not.toContain("EVALUATE");
  });
});
