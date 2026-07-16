/**
 * @jest-environment node
 */
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockRefreshAndRetry = jest.fn();
const mockTransactionsList = jest.fn();
const mockEnqueue = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/dataflows/dataflowTransactionsList",
  () => ({
    dataflowTransactionsList: (...args: unknown[]) =>
      mockTransactionsList(...args),
  }),
);

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueue(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { pollDataflowTransactions } from "@/integrations/microsoft-powerbi/triggers/_shared/pollDataflowTransactions";
import { activate } from "@/integrations/microsoft-powerbi/triggers/dataflowRefreshCanceled/activate";

const NOW = Date.parse("2026-07-15T12:00:00Z");
const EVENT_TYPE = "dataflow_refresh_canceled";
const ACCESS_TOKEN = "super-secret-access-token";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTransactionsList.mockReset();
  mockEnqueue.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) =>
      i.apiCall(ACCESS_TOKEN),
  );
  mockEnqueue.mockResolvedValue({ runId: "r-1", enqueuedAt: "2026-07-15T12:00:00Z" });
  mockUpdateConfig.mockResolvedValue(undefined);
});

function transaction(overrides: Record<string, unknown>) {
  return {
    id: "t-1",
    refreshType: "OnDemand",
    startTime: "2026-07-15T11:40:55Z",
    endTime: "2026-07-15T11:41:00Z",
    status: "Cancelled",
    ...overrides,
  };
}

function triggerRow(snapshot?: {
  seenTransactionIds: string[];
  updatedAt: string;
}): TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "u-1",
    provider: "microsoft-powerbi",
    eventType: EVENT_TYPE,
    nodeId: "n-1",
    config: {
      workspaceId: "ws-1",
      dataflowId: "df-1",
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

function poll(trigger: TriggerResourceRecord, now = NOW) {
  return pollDataflowTransactions({
    trigger,
    providerAccountId: "pbi-tenant-1",
    now,
    eventType: EVENT_TYPE,
  });
}

function activationCtx(config?: Record<string, unknown>): {
  integration: IntegrationRecord;
  node: WorkflowNode;
  workflowId: string;
} {
  const integration: IntegrationRecord = {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "u-1",
    provider: "microsoft-powerbi",
    providerAccountId: "pbi-tenant-1",
    displayName: "Alice",
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: "enc",
    accessTokenExpiresAt: null,
    scopes: ["Dataflow.ReadWrite.All"],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
  };
  const node: WorkflowNode = {
    id: "n-1",
    type: `microsoft-powerbi:${EVENT_TYPE}`,
    provider: "microsoft-powerbi",
    kind: "trigger",
    config: config ?? { workspaceId: "ws-1", dataflowId: "df-1" },
    position: { x: 0, y: 0 },
  };
  return { integration, node, workflowId: "wf-1" };
}

describe("dataflow_refresh_canceled activation", () => {
  it("seeds the already-cancelled transaction ids and enables polling", async () => {
    mockTransactionsList.mockResolvedValueOnce({
      transactions: [
        transaction({ id: "t-2" }),
        transaction({ id: "t-1", status: "Success" }),
      ],
      hasMore: false,
    });

    const result = await activate(activationCtx());

    expect(result.pollingEnabled).toBe(true);
    expect(
      (result.snapshot as { seenTransactionIds: string[] }).seenTransactionIds,
    ).toEqual(["t-2"]);
  });

  it("throws when the seed call fails (→ TRIGGER_REGISTRATION_FAILED)", async () => {
    mockTransactionsList.mockRejectedValueOnce(new Error("Power BI 503"));

    await expect(activate(activationCtx())).rejects.toThrow(/503/);
  });

  it("rejects a config missing the dataflow", async () => {
    await expect(
      activate(activationCtx({ workspaceId: "ws-1" })),
    ).rejects.toThrow();
  });

  it("emits ZERO events on the first poll after activation", async () => {
    const history = { transactions: [transaction({ id: "t-2" })], hasMore: false };
    mockTransactionsList.mockResolvedValueOnce(history);
    const seeded = await activate(activationCtx());

    mockTransactionsList.mockResolvedValueOnce(history);
    await poll(
      triggerRow(
        seeded.snapshot as { seenTransactionIds: string[]; updatedAt: string },
      ),
    );

    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe("dataflow_refresh_canceled poll", () => {
  it("emits one event per newly-cancelled transaction with the bounded payload", async () => {
    mockTransactionsList.mockResolvedValueOnce({
      transactions: [transaction({ id: "t-2" }), transaction({ id: "t-1" })],
      hasMore: false,
    });

    await poll(
      triggerRow({ seenTransactionIds: ["t-1"], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const event = mockEnqueue.mock.calls[0]![0].event;
    expect(event.eventType).toBe(EVENT_TYPE);
    expect(event.eventId).toBe(
      "microsoft-powerbi:wf-1:n-1:dataflow_refresh_canceled:t-2",
    );
    expect(event.payload).toEqual({
      workspaceId: "ws-1",
      dataflowId: "df-1",
      transactionId: "t-2",
      status: "Cancelled",
      startTime: "2026-07-15T11:40:55Z",
      endTime: "2026-07-15T11:41:00Z",
      refreshType: "OnDemand",
    });
  });

  it("does not emit for successful or failed transactions", async () => {
    mockTransactionsList.mockResolvedValueOnce({
      transactions: [
        transaction({ id: "t-3", status: "Success" }),
        transaction({ id: "t-4", status: "Failed" }),
      ],
      hasMore: false,
    });

    await poll(
      triggerRow({ seenTransactionIds: [], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("persists the merged snapshot and polling.lastPolledAt", async () => {
    mockTransactionsList.mockResolvedValueOnce({
      transactions: [transaction({ id: "t-2" })],
      hasMore: false,
    });

    await poll(
      triggerRow({ seenTransactionIds: ["t-1"], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    const [id, config] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-1");
    expect(
      (config as { snapshot: { seenTransactionIds: string[] } }).snapshot
        .seenTransactionIds,
    ).toEqual(["t-2", "t-1"]);
    expect(
      (config as { polling: { lastPolledAt: string } }).polling.lastPolledAt,
    ).toBe(new Date(NOW).toISOString());
  });

  it("warns and skips without re-seeding when the snapshot is missing", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await poll(triggerRow());

    expect(mockTransactionsList).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("produces a timestamp-free event id that is stable across two identical ticks", async () => {
    const snapshot = { seenTransactionIds: [], updatedAt: "2026-07-15T11:00:00Z" };
    const history = { transactions: [transaction({ id: "t-2" })], hasMore: false };

    mockTransactionsList.mockResolvedValueOnce(history);
    await poll(triggerRow(snapshot), NOW);
    mockTransactionsList.mockResolvedValueOnce(history);
    await poll(triggerRow(snapshot), NOW + 600_000);

    const ids = mockEnqueue.mock.calls.map((c) => c[0].event.eventId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toMatch(/\d{13}/);
  });

  it("leaks no access token or provider host into the payload", async () => {
    mockTransactionsList.mockResolvedValueOnce({
      transactions: [transaction({ id: "t-2" })],
      hasMore: false,
    });

    await poll(
      triggerRow({ seenTransactionIds: [], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    const payload = JSON.stringify(mockEnqueue.mock.calls[0]![0].event.payload);
    expect(payload).not.toContain(ACCESS_TOKEN);
    expect(payload).not.toContain("api.powerbi.com");
  });
});
