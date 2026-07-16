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
import { activate } from "@/integrations/microsoft-powerbi/triggers/semanticModelRefreshCompleted/activate";

const NOW = Date.parse("2026-07-15T12:00:00Z");
const EVENT_TYPE = "semantic_model_refresh_completed";

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
  mockEnqueue.mockResolvedValue({
    runId: "r-1",
    enqueuedAt: "2026-07-15T12:00:00Z",
  });
  mockUpdateConfig.mockResolvedValue(undefined);
});

function entry(overrides: Partial<{
  refreshRequestId: string | null;
  refreshType: string;
  status: string;
  startTime: string | null;
  endTime: string | null;
  errorCode: string | null;
}>) {
  return {
    refreshRequestId: "req-1",
    refreshType: "OnDemand",
    status: "Completed",
    startTime: "2026-07-15T11:00:00Z",
    endTime: "2026-07-15T11:05:00Z",
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

function poll(trigger: TriggerResourceRecord) {
  return pollSemanticModelRefreshes({
    trigger,
    providerAccountId: "pbi-tenant-1",
    now: NOW,
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

describe("semantic_model_refresh_completed activation", () => {
  it("seeds the already-Completed request ids and enables polling", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [
        entry({ refreshRequestId: "req-2" }),
        entry({ refreshRequestId: "req-1" }),
        entry({ refreshRequestId: "req-0", status: "Failed" }),
      ],
      hasMore: false,
    });

    const result = await activate(activationCtx());

    expect(mockRefreshesList).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "ws-1", datasetId: "sm-1" }),
    );
    expect(result.pollingEnabled).toBe(true);
    const snap = result.snapshot as { seenRequestIds: string[] };
    // Only Completed entries are seeded — the Failed one belongs to a
    // different trigger and must never suppress this one.
    expect(snap.seenRequestIds).toEqual(["req-2", "req-1"]);
  });

  it("does NOT seed an in-flight refresh, so it still fires when it completes", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [entry({ refreshRequestId: "req-9", status: "Unknown" })],
      hasMore: false,
    });

    const result = await activate(activationCtx());

    expect((result.snapshot as { seenRequestIds: string[] }).seenRequestIds).toEqual(
      [],
    );
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
      refreshes: [
        entry({ refreshRequestId: "req-2" }),
        entry({ refreshRequestId: "req-1" }),
      ],
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

describe("semantic_model_refresh_completed poll", () => {
  it("emits one event per newly-Completed refresh with the bounded payload", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [
        entry({
          refreshRequestId: "req-2",
          refreshType: "Scheduled",
          startTime: "2026-07-15T11:50:00Z",
          endTime: "2026-07-15T11:55:00Z",
        }),
        entry({ refreshRequestId: "req-1" }),
      ],
      hasMore: false,
    });

    await poll(
      triggerRow({ seenRequestIds: ["req-1"], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const event = mockEnqueue.mock.calls[0]![0].event;
    expect(event.provider).toBe("microsoft-powerbi");
    expect(event.eventType).toBe(EVENT_TYPE);
    expect(event.providerAccountId).toBe("pbi-tenant-1");
    expect(event.eventId).toBe(
      "microsoft-powerbi:wf-1:n-1:semantic_model_refresh_completed:req-2",
    );
    expect(event.payload).toEqual({
      workspaceId: "ws-1",
      semanticModelId: "sm-1",
      refreshRequestId: "req-2",
      refreshType: "Scheduled",
      status: "Completed",
      startTime: "2026-07-15T11:50:00Z",
      endTime: "2026-07-15T11:55:00Z",
    });
  });

  it("does not emit for refreshes in a non-matching status", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [
        entry({ refreshRequestId: "req-3", status: "Failed" }),
        entry({ refreshRequestId: "req-4", status: "Unknown" }),
        entry({ refreshRequestId: "req-5", status: "Cancelled" }),
      ],
      hasMore: false,
    });

    await poll(triggerRow({ seenRequestIds: [], updatedAt: "2026-07-15T11:00:00Z" }));

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("falls back to a durable start-time/type key when the entry has no request id", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [
        entry({
          refreshRequestId: null,
          refreshType: "Scheduled",
          startTime: "2026-07-15T11:50:00Z",
        }),
      ],
      hasMore: false,
    });

    await poll(triggerRow({ seenRequestIds: [], updatedAt: "2026-07-15T11:00:00Z" }));

    expect(mockEnqueue.mock.calls[0]![0].event.eventId).toBe(
      "microsoft-powerbi:wf-1:n-1:semantic_model_refresh_completed:2026-07-15T11:50:00Z|Scheduled",
    );
  });

  it("persists the merged snapshot and polling.lastPolledAt", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [entry({ refreshRequestId: "req-2" })],
      hasMore: false,
    });

    await poll(
      triggerRow({ seenRequestIds: ["req-1"], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
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
    const snapshot = {
      seenRequestIds: [],
      updatedAt: "2026-07-15T11:00:00Z",
    };
    const history = {
      refreshes: [entry({ refreshRequestId: "req-2" })],
      hasMore: false,
    };

    mockRefreshesList.mockResolvedValueOnce(history);
    await pollSemanticModelRefreshes({
      trigger: triggerRow(snapshot),
      providerAccountId: "pbi-tenant-1",
      now: NOW,
      eventType: EVENT_TYPE,
    });

    mockRefreshesList.mockResolvedValueOnce(history);
    await pollSemanticModelRefreshes({
      trigger: triggerRow(snapshot),
      providerAccountId: "pbi-tenant-1",
      now: NOW + 600_000,
      eventType: EVENT_TYPE,
    });

    const ids = mockEnqueue.mock.calls.map((c) => c[0].event.eventId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toMatch(/\d{13}/);
  });

  it("leaks no access token or raw provider exception into the payload", async () => {
    mockRefreshesList.mockResolvedValueOnce({
      refreshes: [
        entry({ refreshRequestId: "req-2", errorCode: "SomeErrorCode" }),
      ],
      hasMore: false,
    });

    await poll(triggerRow({ seenRequestIds: [], updatedAt: "2026-07-15T11:00:00Z" }));

    const payload = JSON.stringify(mockEnqueue.mock.calls[0]![0].event.payload);
    expect(payload).not.toContain(ACCESS_TOKEN);
    expect(payload).not.toContain("serviceExceptionJson");
    expect(payload).not.toContain("api.powerbi.com");
    // The success trigger carries no error surface at all.
    expect(payload).not.toContain("errorCode");
  });
});
