/**
 * @jest-environment node
 */
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockRefreshAndRetry = jest.fn();
const mockStatusGet = jest.fn();
const mockEnqueue = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActive = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourceStatusGet",
  () => ({
    gatewayDatasourceStatusGet: (...args: unknown[]) => mockStatusGet(...args),
  }),
);

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueue(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActive(...args),
}));

import { activate } from "@/integrations/microsoft-powerbi/triggers/gatewayDatasourceStatusChanged/activate";
import { pollGatewayDatasourceStatusChanged } from "@/integrations/microsoft-powerbi/triggers/_shared/pollGatewayDatasourceStatus";

const BASE_CONFIG = { gatewayId: "gw-1", datasourceId: "ds-1" };

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
    type: "microsoft-powerbi:gateway_datasource_status_changed",
    provider: "microsoft-powerbi",
    kind: "trigger",
    config: { ...BASE_CONFIG, ...overrides },
    position: { x: 0, y: 0 },
  };
  return { integration: integration(), node, workflowId: "wf-1" };
}

function trigger(snapshot?: {
  online: boolean;
  errorCode: string | null;
  updatedAt: string;
}): TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "u-1",
    provider: "microsoft-powerbi",
    eventType: "gateway_datasource_status_changed",
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

const ONLINE = { online: true, errorCode: null, updatedAt: "2026-07-15T00:00:00Z" };
const OFFLINE = {
  online: false,
  errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
  updatedAt: "2026-07-15T00:00:00Z",
};

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockStatusGet.mockReset();
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

describe("gateway_datasource_status_changed activation", () => {
  it("seeds the snapshot with the current connectivity", async () => {
    mockStatusGet.mockResolvedValueOnce({ online: true, errorCode: null });

    const result = await activate(activateCtx());

    expect(mockStatusGet).toHaveBeenCalledTimes(1);
    expect(result.pollingEnabled).toBe(true);
    const snap = result.snapshot as { online: boolean; errorCode: string | null };
    expect(snap.online).toBe(true);
    expect(snap.errorCode).toBeNull();
  });

  it("seeds an already-offline datasource without failing activation", async () => {
    mockStatusGet.mockResolvedValueOnce({
      online: false,
      errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
    });

    const result = await activate(activateCtx());

    const snap = result.snapshot as { online: boolean; errorCode: string | null };
    expect(snap.online).toBe(false);
    expect(snap.errorCode).toBe("DM_GWPipeline_Client_GatewayUnreachable");
  });

  it("first poll after activation emits ZERO events", async () => {
    mockStatusGet.mockResolvedValueOnce({ online: true, errorCode: null });
    const seeded = await activate(activateCtx());

    mockStatusGet.mockResolvedValueOnce({ online: true, errorCode: null });
    await pollGatewayDatasourceStatusChanged({
      trigger: {
        ...trigger(),
        config: { ...BASE_CONFIG, pollingEnabled: true, snapshot: seeded.snapshot },
      },
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("throws when the seed call fails (gateway gone → TRIGGER_REGISTRATION_FAILED)", async () => {
    mockStatusGet.mockRejectedValueOnce(new Error("gateway datasource ds-1 not found"));

    await expect(activate(activateCtx())).rejects.toThrow(/not found/);
  });

  it("rejects a missing datasourceId in node.config", async () => {
    await expect(activate(activateCtx({ datasourceId: "" }))).rejects.toThrow();
  });
});

describe("gateway_datasource_status_changed poll", () => {
  it("emits with the exact payload + short-form eventType when it goes offline", async () => {
    mockStatusGet.mockResolvedValueOnce({
      online: false,
      errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
    });

    await pollGatewayDatasourceStatusChanged({
      trigger: trigger(ONLINE),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const call = mockEnqueue.mock.calls[0]![0] as {
      event: { eventType: string; payload: Record<string, unknown> };
    };
    expect(call.event.eventType).toBe("gateway_datasource_status_changed");
    expect(call.event.payload).toEqual({
      gatewayId: "gw-1",
      datasourceId: "ds-1",
      online: false,
      errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
      previousOnline: true,
    });
  });

  it("emits when it comes back online", async () => {
    mockStatusGet.mockResolvedValueOnce({ online: true, errorCode: null });

    await pollGatewayDatasourceStatusChanged({
      trigger: trigger(OFFLINE),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    const payload = (
      mockEnqueue.mock.calls[0]![0] as { event: { payload: Record<string, unknown> } }
    ).event.payload;
    expect(payload.online).toBe(true);
    expect(payload.errorCode).toBeNull();
    expect(payload.previousOnline).toBe(false);
  });

  it("emits when the failure reason changes while still offline", async () => {
    mockStatusGet.mockResolvedValueOnce({
      online: false,
      errorCode: "DM_GWPipeline_Client_InvalidCredentials",
    });

    await pollGatewayDatasourceStatusChanged({
      trigger: trigger(OFFLINE),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const payload = (
      mockEnqueue.mock.calls[0]![0] as { event: { payload: Record<string, unknown> } }
    ).event.payload;
    expect(payload.errorCode).toBe("DM_GWPipeline_Client_InvalidCredentials");
    expect(payload.previousOnline).toBe(false);
  });

  it("does NOT emit when the status is unchanged", async () => {
    mockStatusGet.mockResolvedValueOnce({ online: true, errorCode: null });

    await pollGatewayDatasourceStatusChanged({
      trigger: trigger(ONLINE),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("does NOT emit when still offline with the same error code", async () => {
    mockStatusGet.mockResolvedValueOnce({
      online: false,
      errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
    });

    await pollGatewayDatasourceStatusChanged({
      trigger: trigger(OFFLINE),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("persists the snapshot + polling.lastPolledAt", async () => {
    mockStatusGet.mockResolvedValueOnce({
      online: false,
      errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
    });

    await pollGatewayDatasourceStatusChanged({
      trigger: trigger(ONLINE),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T12:00:00Z"),
    });

    const [id, config] = mockUpdateConfig.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("tr-1");
    expect(config.snapshot).toEqual({
      online: false,
      errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
      updatedAt: expect.any(String),
    });
    expect(config.polling).toEqual({ lastPolledAt: "2026-07-15T12:00:00.000Z" });
  });

  it("warns + skips without re-seeding when the snapshot is missing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await pollGatewayDatasourceStatusChanged({
      trigger: trigger(),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockStatusGet).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("microsoft-powerbi.poll.no_snapshot"),
    );
    warn.mockRestore();
  });

  it("produces a timestamp-free eventId that is stable across two identical ticks", async () => {
    mockStatusGet.mockResolvedValue({
      online: false,
      errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
    });

    await pollGatewayDatasourceStatusChanged({
      trigger: trigger(ONLINE),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T12:00:00Z"),
    });
    await pollGatewayDatasourceStatusChanged({
      trigger: trigger(ONLINE),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T13:30:00Z"),
    });

    const first = (mockEnqueue.mock.calls[0]![0] as { event: { eventId: string } }).event.eventId;
    const second = (mockEnqueue.mock.calls[1]![0] as { event: { eventId: string } }).event.eventId;
    expect(first).toBe(
      "microsoft-powerbi:wf-1:n-1:gateway_datasource_status_changed:false:DM_GWPipeline_Client_GatewayUnreachable",
    );
    expect(second).toBe(first);
    expect(first).not.toMatch(/2026-07-15T/);
  });

  it("leaks no token or raw error envelope into the payload", async () => {
    mockStatusGet.mockResolvedValueOnce({
      online: false,
      errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
    });

    await pollGatewayDatasourceStatusChanged({
      trigger: trigger(ONLINE),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    const payload = JSON.stringify(
      (mockEnqueue.mock.calls[0]![0] as { event: { payload: unknown } }).event.payload,
    );
    expect(payload).not.toContain("tok");
    expect(payload).not.toContain("Bearer");
    expect(payload).not.toContain("api.powerbi.com");
    expect(payload).not.toContain("pbi.error");
  });
});
