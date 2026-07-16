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

import { activate } from "@/integrations/microsoft-powerbi/triggers/daxQueryResultChanged/activate";
import {
  hashResultRows,
  pollDaxQueryResultChanged,
} from "@/integrations/microsoft-powerbi/triggers/_shared/pollDax";

const BASE_CONFIG = {
  workspaceId: "ws-1",
  semanticModelId: "sm-1",
  daxQuery: "EVALUATE TOPN(10, 'Sales')",
  maxRows: 2,
};

const ROWS_A = [{ "[Region]": "North", "[Amount]": 100 }];
const ROWS_B = [{ "[Region]": "North", "[Amount]": 250 }];

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
    type: "microsoft-powerbi:dax_query_result_changed",
    provider: "microsoft-powerbi",
    kind: "trigger",
    config: { ...BASE_CONFIG, ...overrides },
    position: { x: 0, y: 0 },
  };
  return { integration: integration(), node, workflowId: "wf-1" };
}

function trigger(snapshot?: {
  resultHash: string;
  updatedAt: string;
}): TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "u-1",
    provider: "microsoft-powerbi",
    eventType: "dax_query_result_changed",
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

function snapshotFor(rows: Array<Record<string, unknown>>): {
  resultHash: string;
  updatedAt: string;
} {
  return { resultHash: hashResultRows(rows), updatedAt: "2026-07-15T00:00:00Z" };
}

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

describe("hashResultRows", () => {
  it("is insensitive to column ORDER but sensitive to values", () => {
    const a = hashResultRows([{ x: 1, y: 2 }]);
    const b = hashResultRows([{ y: 2, x: 1 }]);
    const c = hashResultRows([{ x: 1, y: 3 }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("dax_query_result_changed activation", () => {
  it("seeds the snapshot with the hash of the current bounded result", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: ROWS_A });

    const result = await activate(activateCtx());

    expect(result.pollingEnabled).toBe(true);
    expect((result.snapshot as { resultHash: string }).resultHash).toBe(
      hashResultRows(ROWS_A),
    );
  });

  it("hashes only the first maxRows rows when seeding", async () => {
    mockExecuteQueries.mockResolvedValueOnce({
      rows: [...ROWS_A, { "[Region]": "South" }, { "[Region]": "East" }],
    });

    const result = await activate(activateCtx({ maxRows: 1 }));

    expect((result.snapshot as { resultHash: string }).resultHash).toBe(
      hashResultRows(ROWS_A),
    );
  });

  it("first poll after activation emits ZERO events for an unchanged result", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: ROWS_A });
    const seeded = await activate(activateCtx());

    mockExecuteQueries.mockResolvedValueOnce({ rows: ROWS_A });
    await pollDaxQueryResultChanged({
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

  it("rejects maxRows outside 1..100", async () => {
    await expect(activate(activateCtx({ maxRows: 0 }))).rejects.toThrow();
    await expect(activate(activateCtx({ maxRows: 101 }))).rejects.toThrow();
  });
});

describe("dax_query_result_changed poll", () => {
  it("emits with the exact payload + short-form eventType when the result changes", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: ROWS_B });

    await pollDaxQueryResultChanged({
      trigger: trigger(snapshotFor(ROWS_A)),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const call = mockEnqueue.mock.calls[0]![0] as {
      event: { eventType: string; payload: Record<string, unknown> };
    };
    expect(call.event.eventType).toBe("dax_query_result_changed");
    expect(call.event.payload).toEqual({
      workspaceId: "ws-1",
      semanticModelId: "sm-1",
      rows: ROWS_B,
      rowCount: 1,
      truncated: false,
      resultHash: hashResultRows(ROWS_B),
    });
  });

  it("does NOT emit when the result is unchanged", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: ROWS_A });

    await pollDaxQueryResultChanged({
      trigger: trigger(snapshotFor(ROWS_A)),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("bounds rows to maxRows and reports rowCount + truncated honestly", async () => {
    const many = [
      { "[Region]": "North" },
      { "[Region]": "South" },
      { "[Region]": "East" },
    ];
    mockExecuteQueries.mockResolvedValueOnce({ rows: many });

    await pollDaxQueryResultChanged({
      trigger: trigger(snapshotFor(ROWS_A)),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    const payload = (
      mockEnqueue.mock.calls[0]![0] as { event: { payload: Record<string, unknown> } }
    ).event.payload;
    expect(payload.rows).toEqual(many.slice(0, 2));
    expect(payload.rowCount).toBe(3);
    expect(payload.truncated).toBe(true);
  });

  it("persists the snapshot + polling.lastPolledAt", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: ROWS_B });

    await pollDaxQueryResultChanged({
      trigger: trigger(snapshotFor(ROWS_A)),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T12:00:00Z"),
    });

    const [id, config] = mockUpdateConfig.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("tr-1");
    expect((config.snapshot as { resultHash: string }).resultHash).toBe(
      hashResultRows(ROWS_B),
    );
    expect(config.polling).toEqual({ lastPolledAt: "2026-07-15T12:00:00.000Z" });
  });

  it("warns + skips without re-seeding when the snapshot is missing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await pollDaxQueryResultChanged({
      trigger: trigger(),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockExecuteQueries).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("microsoft-powerbi.poll.no_snapshot"),
    );
    warn.mockRestore();
  });

  it("produces a timestamp-free eventId that is stable across two identical ticks", async () => {
    mockExecuteQueries.mockResolvedValue({ rows: ROWS_B });

    await pollDaxQueryResultChanged({
      trigger: trigger(snapshotFor(ROWS_A)),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T12:00:00Z"),
    });
    await pollDaxQueryResultChanged({
      trigger: trigger(snapshotFor(ROWS_A)),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T13:30:00Z"),
    });

    const first = (mockEnqueue.mock.calls[0]![0] as { event: { eventId: string } }).event.eventId;
    const second = (mockEnqueue.mock.calls[1]![0] as { event: { eventId: string } }).event.eventId;
    expect(first).toBe(
      `microsoft-powerbi:wf-1:n-1:dax_query_result_changed:${hashResultRows(ROWS_B)}`,
    );
    expect(second).toBe(first);
    expect(first).not.toMatch(/2026-07-15T/);
  });

  it("leaks no token, provider host, or DAX text into the payload", async () => {
    mockExecuteQueries.mockResolvedValueOnce({ rows: ROWS_B });

    await pollDaxQueryResultChanged({
      trigger: trigger(snapshotFor(ROWS_A)),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    const payload = JSON.stringify(
      (mockEnqueue.mock.calls[0]![0] as { event: { payload: unknown } }).event.payload,
    );
    expect(payload).not.toContain("tok");
    expect(payload).not.toContain("Bearer");
    expect(payload).not.toContain("api.powerbi.com");
    expect(payload).not.toContain("EVALUATE");
  });
});
