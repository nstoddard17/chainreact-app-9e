/**
 * @jest-environment node
 */
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockRefreshAndRetry = jest.fn();
const mockRefreshesList = jest.fn();
const mockEnqueue = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/datasets/refreshesList", () => ({
  refreshesList: (...args: unknown[]) => mockRefreshesList(...args),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueue(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { pollSemanticModelRefreshes } from "@/integrations/microsoft-powerbi/triggers/_shared/pollSemanticModelRefreshes";
import { activate } from "@/integrations/microsoft-powerbi/triggers/semanticModelRefreshCanceled/activate";

const NOW = Date.parse("2026-07-15T12:00:00Z");
/** Product spelling — the provider's wire value is `Cancelled`. */
const EVENT_TYPE = "semantic_model_refresh_canceled";
const ACCESS_TOKEN = "super-secret-access-token";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRefreshesList.mockReset();
  mockEnqueue.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) =>
      i.apiCall(ACCESS_TOKEN),
  );
  mockEnqueue.mockResolvedValue({ runId: "r-1", enqueuedAt: "2026-07-15T12:00:00Z" });
  mockUpdateConfig.mockResolvedValue(undefined);
});

function entry(overrides: Record<string, unknown>) {
  return {
    refreshRequestId: "req-1",
    refreshType: "ViaEnhancedApi",
    status: "Cancelled",
    startTime: "2026-07-15T11:00:00Z",
    endTime: "2026-07-15T11:02:00Z",
    errorCode: null,
    ...overrides,
  };
}

function triggerRow(snapshot?: {
  seenRequestIds: string[];
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
      semanticModelId: "sm-1",
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
  return pollSemanticModelRefreshes({
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
    scopes: ["Dataset.ReadWrite.All"],
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
    config: config ?? { workspaceId: "ws-1", semanticModelId: "sm-1" },
    position: { x: 0, y: 0 },
  };
  return { integration, node, workflowId: "wf-1" };
}

describe("semantic_model_refresh_canceled activation", () => {
  it("seeds the request ids already in the provider's Cancelled state", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [
        entry({ refreshRequestId: "req-2" }),
        entry({ refreshRequestId: "req-1", status: "Completed" }),
      ],
      hasMore: false,
    });

    const result = await activate(activationCtx());

    expect(result.pollingEnabled).toBe(true);
    expect(
      (result.snapshot as { seenRequestIds: string[] }).seenRequestIds,
    ).toEqual(["req-2"]);
  });

  it("throws when the seed call fails (→ TRIGGER_REGISTRATION_FAILED)", async () => {
    mockRefreshesList.mockRejectedValueOnce(new Error("Power BI 503"));

    await expect(activate(activationCtx())).rejects.toThrow(/503/);
  });

  it("rejects a config missing the semantic model", async () => {
    await expect(
      activate(activationCtx({ workspaceId: "ws-1" })),
    ).rejects.toThrow();
  });

  it("emits ZERO events on the first poll after activation", async () => {
    const history = {
      refreshes: [entry({ refreshRequestId: "req-2" })],
      hasMore: false,
    };
    mockRefreshesList.mockResolvedValueOnce(history);
    const seeded = await activate(activationCtx());

    mockRefreshesList.mockResolvedValueOnce(history);
    await poll(
      triggerRow(seeded.snapshot as { seenRequestIds: string[]; updatedAt: string }),
    );

    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe("semantic_model_refresh_canceled poll", () => {
  it("emits the product-spelled event type for a provider `Cancelled` refresh", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [entry({ refreshRequestId: "req-2" })],
      hasMore: false,
    });

    await poll(triggerRow({ seenRequestIds: [], updatedAt: "2026-07-15T11:00:00Z" }));

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const event = mockEnqueue.mock.calls[0]![0].event;
    // Short form, product spelling — matches registerActivation + TriggerMeta.type.
    expect(event.eventType).toBe("semantic_model_refresh_canceled");
    expect(event.eventId).toBe(
      "microsoft-powerbi:wf-1:n-1:semantic_model_refresh_canceled:req-2",
    );
    expect(event.payload).toEqual({
      workspaceId: "ws-1",
      semanticModelId: "sm-1",
      refreshRequestId: "req-2",
      refreshType: "ViaEnhancedApi",
      // Provider spelling is preserved in the payload's status value.
      status: "Cancelled",
      startTime: "2026-07-15T11:00:00Z",
      endTime: "2026-07-15T11:02:00Z",
    });
  });

  it("does not emit for pre-existing cancellations or for other statuses", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [
        entry({ refreshRequestId: "req-1" }),
        entry({ refreshRequestId: "req-9", status: "Failed" }),
      ],
      hasMore: false,
    });

    await poll(
      triggerRow({ seenRequestIds: ["req-1"], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("persists the merged snapshot and polling.lastPolledAt", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [entry({ refreshRequestId: "req-2" })],
      hasMore: false,
    });

    await poll(
      triggerRow({ seenRequestIds: ["req-1"], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    const [id, config] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-1");
    expect(
      (config as { snapshot: { seenRequestIds: string[] } }).snapshot
        .seenRequestIds,
    ).toEqual(["req-2", "req-1"]);
    expect(
      (config as { polling: { lastPolledAt: string } }).polling.lastPolledAt,
    ).toBe(new Date(NOW).toISOString());
  });

  it("warns and skips without re-seeding when the snapshot is missing", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await poll(triggerRow());

    expect(mockRefreshesList).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("produces a timestamp-free event id that is stable across two identical ticks", async () => {
    const snapshot = { seenRequestIds: [], updatedAt: "2026-07-15T11:00:00Z" };
    const history = {
      refreshes: [entry({ refreshRequestId: "req-2" })],
      hasMore: false,
    };

    mockRefreshesList.mockResolvedValueOnce(history);
    await poll(triggerRow(snapshot), NOW);
    mockRefreshesList.mockResolvedValueOnce(history);
    await poll(triggerRow(snapshot), NOW + 600_000);

    const ids = mockEnqueue.mock.calls.map((c) => c[0].event.eventId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toMatch(/\d{13}/);
  });

  it("leaks no access token or provider host into the payload", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [entry({ refreshRequestId: "req-2" })],
      hasMore: false,
    });

    await poll(triggerRow({ seenRequestIds: [], updatedAt: "2026-07-15T11:00:00Z" }));

    const payload = JSON.stringify(mockEnqueue.mock.calls[0]![0].event.payload);
    expect(payload).not.toContain(ACCESS_TOKEN);
    expect(payload).not.toContain("serviceExceptionJson");
    expect(payload).not.toContain("api.powerbi.com");
  });
});
