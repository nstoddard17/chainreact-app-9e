/**
 * @jest-environment node
 */
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockRefreshAndRetry = jest.fn();
const mockImportsList = jest.fn();
const mockImportGet = jest.fn();
const mockEnqueue = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/imports/importsList", () => ({
  importsList: (...args: unknown[]) => mockImportsList(...args),
}));

jest.mock("@/integrations/microsoft-powerbi/api/imports/importGet", () => ({
  importGet: (...args: unknown[]) => mockImportGet(...args),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueue(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { pollImports } from "@/integrations/microsoft-powerbi/triggers/_shared/pollImports";
import { activate } from "@/integrations/microsoft-powerbi/triggers/importFailed/activate";

const NOW = Date.parse("2026-07-15T12:00:00Z");
const EVENT_TYPE = "import_failed";
const ACCESS_TOKEN = "super-secret-access-token";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockImportsList.mockReset();
  mockImportGet.mockReset();
  mockEnqueue.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) =>
      i.apiCall(ACCESS_TOKEN),
  );
  mockEnqueue.mockResolvedValue({ runId: "r-1", enqueuedAt: "2026-07-15T12:00:00Z" });
  mockUpdateConfig.mockResolvedValue(undefined);
  mockImportGet.mockResolvedValue({
    importState: "Failed",
    name: "Q3 Sales",
    createdDateTime: "2026-07-15T11:30:00Z",
    updatedDateTime: "2026-07-15T11:31:00Z",
    reports: [],
    datasets: [],
  });
});

function summary(overrides: Record<string, unknown>) {
  return { id: "imp-1", name: "Q3 Sales", importState: "Failed", ...overrides };
}

function triggerRow(snapshot?: {
  seenImportIds: string[];
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
  return pollImports({
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
    config: config ?? { workspaceId: "ws-1" },
    position: { x: 0, y: 0 },
  };
  return { integration, node, workflowId: "wf-1" };
}

describe("import_failed activation", () => {
  it("seeds the already-Failed import ids and enables polling", async () => {
    mockImportsList.mockResolvedValueOnce([
      summary({ id: "imp-2" }),
      summary({ id: "imp-1", importState: "Succeeded" }),
    ]);

    const result = await activate(activationCtx());

    expect(result.pollingEnabled).toBe(true);
    expect((result.snapshot as { seenImportIds: string[] }).seenImportIds).toEqual([
      "imp-2",
    ]);
  });

  it("throws when the seed call fails (→ TRIGGER_REGISTRATION_FAILED)", async () => {
    mockImportsList.mockRejectedValueOnce(new Error("Power BI 503"));

    await expect(activate(activationCtx())).rejects.toThrow(/503/);
  });

  it("rejects a config missing the workspace", async () => {
    await expect(activate(activationCtx({}))).rejects.toThrow();
  });

  it("emits ZERO events on the first poll after activation", async () => {
    const imports = [summary({ id: "imp-2" })];
    mockImportsList.mockResolvedValueOnce(imports);
    const seeded = await activate(activationCtx());

    mockImportsList.mockResolvedValueOnce(imports);
    await poll(
      triggerRow(seeded.snapshot as { seenImportIds: string[]; updatedAt: string }),
    );

    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe("import_failed poll", () => {
  it("emits one event per newly-Failed import with the bounded payload", async () => {
    mockImportsList.mockResolvedValueOnce([
      summary({ id: "imp-2" }),
      summary({ id: "imp-1" }),
    ]);

    await poll(
      triggerRow({ seenImportIds: ["imp-1"], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const event = mockEnqueue.mock.calls[0]![0].event;
    expect(event.eventType).toBe(EVENT_TYPE);
    expect(event.eventId).toBe("microsoft-powerbi:wf-1:n-1:import_failed:imp-2");
    expect(event.payload).toEqual({
      workspaceId: "ws-1",
      importId: "imp-2",
      name: "Q3 Sales",
      importState: "Failed",
      createdDateTime: "2026-07-15T11:30:00Z",
      updatedDateTime: "2026-07-15T11:31:00Z",
    });
  });

  it("does not emit for succeeded or publishing imports", async () => {
    mockImportsList.mockResolvedValueOnce([
      summary({ id: "imp-3", importState: "Succeeded" }),
      summary({ id: "imp-4", importState: "Publishing" }),
    ]);

    await poll(triggerRow({ seenImportIds: [], updatedAt: "2026-07-15T11:00:00Z" }));

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("persists the merged snapshot and polling.lastPolledAt", async () => {
    mockImportsList.mockResolvedValueOnce([summary({ id: "imp-2" })]);

    await poll(
      triggerRow({ seenImportIds: ["imp-1"], updatedAt: "2026-07-15T11:00:00Z" }),
    );

    const [id, config] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-1");
    expect(
      (config as { snapshot: { seenImportIds: string[] } }).snapshot.seenImportIds,
    ).toEqual(["imp-2", "imp-1"]);
    expect(
      (config as { polling: { lastPolledAt: string } }).polling.lastPolledAt,
    ).toBe(new Date(NOW).toISOString());
  });

  it("warns and skips without re-seeding when the snapshot is missing", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await poll(triggerRow());

    expect(mockImportsList).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("produces a timestamp-free event id that is stable across two identical ticks", async () => {
    const snapshot = { seenImportIds: [], updatedAt: "2026-07-15T11:00:00Z" };

    mockImportsList.mockResolvedValueOnce([summary({ id: "imp-2" })]);
    await poll(triggerRow(snapshot), NOW);
    mockImportsList.mockResolvedValueOnce([summary({ id: "imp-2" })]);
    await poll(triggerRow(snapshot), NOW + 600_000);

    const ids = mockEnqueue.mock.calls.map((c) => c[0].event.eventId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toMatch(/\d{13}/);
  });

  it("leaks no access token, provider host, or raw error blob into the payload", async () => {
    mockImportsList.mockResolvedValueOnce([summary({ id: "imp-2" })]);

    await poll(triggerRow({ seenImportIds: [], updatedAt: "2026-07-15T11:00:00Z" }));

    const payload = JSON.stringify(mockEnqueue.mock.calls[0]![0].event.payload);
    expect(payload).not.toContain(ACCESS_TOKEN);
    expect(payload).not.toContain("api.powerbi.com");
    expect(payload).not.toContain("details");
  });
});
