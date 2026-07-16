/**
 * @jest-environment node
 */
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockRefreshAndRetry = jest.fn();
const mockOperationsList = jest.fn();
const mockOperationGet = jest.fn();
const mockEnqueue = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineOperationsList",
  () => ({
    pipelineOperationsList: (...args: unknown[]) => mockOperationsList(...args),
  }),
);

jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineOperationGet",
  () => ({
    pipelineOperationGet: (...args: unknown[]) => mockOperationGet(...args),
  }),
);

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueue(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { pollPipelineOperations } from "@/integrations/microsoft-powerbi/triggers/_shared/pollPipelineOperations";
import { activate } from "@/integrations/microsoft-powerbi/triggers/pipelineDeploymentCompleted/activate";

const NOW = Date.parse("2026-07-15T12:00:00Z");
const EVENT_TYPE = "pipeline_deployment_completed";
const ACCESS_TOKEN = "super-secret-access-token";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockOperationsList.mockReset();
  mockOperationGet.mockReset();
  mockEnqueue.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) =>
      i.apiCall(ACCESS_TOKEN),
  );
  mockEnqueue.mockResolvedValue({ runId: "r-1", enqueuedAt: "2026-07-15T12:00:00Z" });
  mockUpdateConfig.mockResolvedValue(undefined);
});

function operation(overrides: Record<string, unknown>) {
  return {
    operationId: "op-1",
    status: "Succeeded",
    executionStartTime: "2026-07-15T11:00:00Z",
    executionEndTime: "2026-07-15T11:10:00Z",
    sourceStageOrder: 0,
    targetStageOrder: 1,
    ...overrides,
  };
}

function triggerRow(snapshot?: {
  seenOperationIds: string[];
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
      pipelineId: "pl-1",
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
  return pollPipelineOperations({
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
    scopes: ["Pipeline.ReadWrite.All"],
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
    config: config ?? { pipelineId: "pl-1" },
    position: { x: 0, y: 0 },
  };
  return { integration, node, workflowId: "wf-1" };
}

describe("pipeline_deployment_completed activation", () => {
  it("seeds the already-Succeeded operation ids and enables polling", async () => {
    mockOperationsList.mockResolvedValueOnce([
      operation({ operationId: "op-2" }),
      operation({ operationId: "op-1" }),
      operation({ operationId: "op-0", status: "Failed" }),
    ]);

    const result = await activate(activationCtx());

    expect(mockOperationsList).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineId: "pl-1" }),
    );
    expect(result.pollingEnabled).toBe(true);
    expect(
      (result.snapshot as { seenOperationIds: string[] }).seenOperationIds,
    ).toEqual(["op-2", "op-1"]);
  });

  it("does NOT seed an executing operation, so it still fires when it succeeds", async () => {
    mockOperationsList.mockResolvedValueOnce([
      operation({ operationId: "op-9", status: "Executing" }),
    ]);

    const result = await activate(activationCtx());

    expect(
      (result.snapshot as { seenOperationIds: string[] }).seenOperationIds,
    ).toEqual([]);
  });

  it("throws when the seed call fails (→ TRIGGER_REGISTRATION_FAILED)", async () => {
    mockOperationsList.mockRejectedValueOnce(new Error("Power BI 503"));

    await expect(activate(activationCtx())).rejects.toThrow(/503/);
  });

  it("rejects a config missing the pipeline", async () => {
    await expect(activate(activationCtx({}))).rejects.toThrow();
  });

  it("emits ZERO events on the first poll after activation", async () => {
    const operations = [operation({ operationId: "op-2" })];
    mockOperationsList.mockResolvedValueOnce(operations);
    const seeded = await activate(activationCtx());

    mockOperationsList.mockResolvedValueOnce(operations);
    await poll(
      triggerRow(
        seeded.snapshot as { seenOperationIds: string[]; updatedAt: string },
      ),
    );

    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe("pipeline_deployment_completed poll", () => {
  it("emits one event per newly-Succeeded operation with the bounded payload", async () => {
    mockOperationsList.mockResolvedValueOnce([
      operation({ operationId: "op-2", sourceStageOrder: 1, targetStageOrder: 2 }),
      operation({ operationId: "op-1" }),
    ]);

    await poll(
      triggerRow({ seenOperationIds: ["op-1"], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const event = mockEnqueue.mock.calls[0]![0].event;
    expect(event.eventType).toBe(EVENT_TYPE);
    expect(event.eventId).toBe(
      "microsoft-powerbi:wf-1:n-1:pipeline_deployment_completed:op-2",
    );
    expect(event.payload).toEqual({
      pipelineId: "pl-1",
      operationId: "op-2",
      status: "Succeeded",
      sourceStageOrder: 1,
      targetStageOrder: 2,
      executionStartTime: "2026-07-15T11:00:00Z",
      executionEndTime: "2026-07-15T11:10:00Z",
    });
  });

  it("never reads back an operation — the success payload needs no error code", async () => {
    mockOperationsList.mockResolvedValueOnce([operation({ operationId: "op-2" })]);

    await poll(
      triggerRow({ seenOperationIds: [], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    expect(mockOperationGet).not.toHaveBeenCalled();
  });

  it("does not emit for failed or in-flight operations", async () => {
    mockOperationsList.mockResolvedValueOnce([
      operation({ operationId: "op-3", status: "Failed" }),
      operation({ operationId: "op-4", status: "Executing" }),
      operation({ operationId: "op-5", status: "NotStarted" }),
    ]);

    await poll(
      triggerRow({ seenOperationIds: [], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("persists the merged snapshot and polling.lastPolledAt", async () => {
    mockOperationsList.mockResolvedValueOnce([operation({ operationId: "op-2" })]);

    await poll(
      triggerRow({ seenOperationIds: ["op-1"], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    const [id, config] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-1");
    expect(
      (config as { snapshot: { seenOperationIds: string[] } }).snapshot
        .seenOperationIds,
    ).toEqual(["op-2", "op-1"]);
    expect(
      (config as { polling: { lastPolledAt: string } }).polling.lastPolledAt,
    ).toBe(new Date(NOW).toISOString());
  });

  it("warns and skips without re-seeding when the snapshot is missing", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await poll(triggerRow());

    expect(mockOperationsList).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("produces a timestamp-free event id that is stable across two identical ticks", async () => {
    const snapshot = { seenOperationIds: [], updatedAt: "2026-07-15T11:00:00Z" };

    mockOperationsList.mockResolvedValueOnce([operation({ operationId: "op-2" })]);
    await poll(triggerRow(snapshot), NOW);
    mockOperationsList.mockResolvedValueOnce([operation({ operationId: "op-2" })]);
    await poll(triggerRow(snapshot), NOW + 600_000);

    const ids = mockEnqueue.mock.calls.map((c) => c[0].event.eventId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toMatch(/\d{13}/);
  });

  it("leaks no access token or provider host into the payload", async () => {
    mockOperationsList.mockResolvedValueOnce([operation({ operationId: "op-2" })]);

    await poll(
      triggerRow({ seenOperationIds: [], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    const payload = JSON.stringify(mockEnqueue.mock.calls[0]![0].event.payload);
    expect(payload).not.toContain(ACCESS_TOKEN);
    expect(payload).not.toContain("api.powerbi.com");
    expect(payload).not.toContain("performedBy");
  });
});
