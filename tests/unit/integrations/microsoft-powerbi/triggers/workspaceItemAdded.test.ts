/**
 * @jest-environment node
 */
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockRefreshAndRetry = jest.fn();
const mockReportsList = jest.fn();
const mockDatasetsList = jest.fn();
const mockDashboardsList = jest.fn();
const mockDataflowsList = jest.fn();
const mockEnqueue = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActive = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/reports/reportsList", () => ({
  reportsList: (...args: unknown[]) => mockReportsList(...args),
}));

jest.mock("@/integrations/microsoft-powerbi/api/datasets/datasetsList", () => ({
  datasetsList: (...args: unknown[]) => mockDatasetsList(...args),
}));

jest.mock("@/integrations/microsoft-powerbi/api/dashboards/dashboardsList", () => ({
  dashboardsList: (...args: unknown[]) => mockDashboardsList(...args),
}));

jest.mock("@/integrations/microsoft-powerbi/api/dataflows/dataflowsList", () => ({
  dataflowsList: (...args: unknown[]) => mockDataflowsList(...args),
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

import { activate } from "@/integrations/microsoft-powerbi/triggers/workspaceItemAdded/activate";
import { pollWorkspaceItemAdded } from "@/integrations/microsoft-powerbi/triggers/_shared/pollWorkspace";

const BASE_CONFIG = {
  workspaceId: "ws-1",
  itemTypes: ["report", "semantic_model"] as string[],
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
    type: "microsoft-powerbi:workspace_item_added",
    provider: "microsoft-powerbi",
    kind: "trigger",
    config: { ...BASE_CONFIG, ...overrides },
    position: { x: 0, y: 0 },
  };
  return { integration: integration(), node, workflowId: "wf-1" };
}

function trigger(
  snapshot?: { ids: string[]; updatedAt: string },
  configOverrides?: Record<string, unknown>,
): TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "u-1",
    provider: "microsoft-powerbi",
    eventType: "workspace_item_added",
    nodeId: "n-1",
    config: {
      ...BASE_CONFIG,
      ...configOverrides,
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

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockReportsList.mockReset();
  mockDatasetsList.mockReset();
  mockDashboardsList.mockReset();
  mockDataflowsList.mockReset();
  mockEnqueue.mockReset();
  mockUpdateConfig.mockReset();
  mockGetActive.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockEnqueue.mockResolvedValue({ runId: "r-1", enqueuedAt: "2026-07-15T12:00:00Z" });
  mockUpdateConfig.mockResolvedValue(undefined);
  mockGetActive.mockResolvedValue(integration());
  mockReportsList.mockResolvedValue([{ id: "r-1", name: "Sales", reportType: "PowerBIReport", datasetId: null }]);
  mockDatasetsList.mockResolvedValue([{ id: "d-1", name: "Model", isRefreshable: true, configuredBy: null }]);
  mockDashboardsList.mockResolvedValue([{ id: "db-1", displayName: "Exec Dash" }]);
  mockDataflowsList.mockResolvedValue([{ objectId: "df-1", name: "Flow", description: null }]);
});

describe("workspace_item_added activation", () => {
  it("seeds the snapshot with namespaced ids for the selected types only", async () => {
    const result = await activate(activateCtx());

    expect(result.pollingEnabled).toBe(true);
    expect((result.snapshot as { ids: string[] }).ids).toEqual([
      "report:r-1",
      "semantic_model:d-1",
    ]);
    // Unselected types are never fetched — keeps the tick cheap and avoids
    // the dashboards scope question entirely.
    expect(mockDashboardsList).not.toHaveBeenCalled();
    expect(mockDataflowsList).not.toHaveBeenCalled();
  });

  it("fetches every selected source and namespaces each id by type", async () => {
    const result = await activate(
      activateCtx({ itemTypes: ["report", "semantic_model", "dashboard", "dataflow"] }),
    );

    expect((result.snapshot as { ids: string[] }).ids).toEqual([
      "report:r-1",
      "semantic_model:d-1",
      "dashboard:db-1",
      "dataflow:df-1",
    ]);
  });

  it("first poll after activation emits ZERO events for pre-existing items", async () => {
    const seeded = await activate(activateCtx());

    await pollWorkspaceItemAdded({
      trigger: {
        ...trigger(),
        config: { ...BASE_CONFIG, pollingEnabled: true, snapshot: seeded.snapshot },
      },
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("throws when a seed list call fails (→ TRIGGER_REGISTRATION_FAILED)", async () => {
    mockReportsList.mockRejectedValueOnce(new Error("Power BI 503"));

    await expect(activate(activateCtx())).rejects.toThrow(/503/);
  });

  it("rejects an empty itemTypes selection", async () => {
    await expect(activate(activateCtx({ itemTypes: [] }))).rejects.toThrow();
  });

  it("rejects an unknown item type", async () => {
    await expect(activate(activateCtx({ itemTypes: ["lakehouse"] }))).rejects.toThrow();
  });
});

describe("workspace_item_added poll", () => {
  const SNAPSHOT = {
    ids: ["report:r-1", "semantic_model:d-1"],
    updatedAt: "2026-07-15T00:00:00Z",
  };

  it("emits one event per NEW id with the exact payload + short-form eventType", async () => {
    mockReportsList.mockResolvedValueOnce([
      { id: "r-1", name: "Sales", reportType: "PowerBIReport", datasetId: null },
      { id: "r-2", name: "Forecast", reportType: "PowerBIReport", datasetId: null },
    ]);

    await pollWorkspaceItemAdded({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const call = mockEnqueue.mock.calls[0]![0] as {
      event: { eventType: string; payload: Record<string, unknown> };
    };
    expect(call.event.eventType).toBe("workspace_item_added");
    expect(call.event.payload).toEqual({
      workspaceId: "ws-1",
      itemType: "report",
      itemId: "r-2",
      itemName: "Forecast",
    });
  });

  it("does NOT emit for pre-existing ids", async () => {
    await pollWorkspaceItemAdded({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("does NOT emit for a removed id (that is the sibling trigger's job)", async () => {
    mockReportsList.mockResolvedValueOnce([]);

    await pollWorkspaceItemAdded({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("does not confuse a report and a semantic model that share an id", async () => {
    mockReportsList.mockResolvedValueOnce([
      { id: "same-id", name: "Report", reportType: "PowerBIReport", datasetId: null },
    ]);
    mockDatasetsList.mockResolvedValueOnce([
      { id: "same-id", name: "Model", isRefreshable: true, configuredBy: null },
    ]);

    await pollWorkspaceItemAdded({
      trigger: trigger({ ids: ["report:same-id"], updatedAt: "2026-07-15T00:00:00Z" }),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    // The semantic model is new even though the report with that id is not.
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const payload = (
      mockEnqueue.mock.calls[0]![0] as { event: { payload: Record<string, unknown> } }
    ).event.payload;
    expect(payload.itemType).toBe("semantic_model");
    expect(payload.itemId).toBe("same-id");
  });

  it("persists the snapshot + polling.lastPolledAt", async () => {
    mockReportsList.mockResolvedValueOnce([
      { id: "r-1", name: "Sales", reportType: "PowerBIReport", datasetId: null },
      { id: "r-2", name: "Forecast", reportType: "PowerBIReport", datasetId: null },
    ]);

    await pollWorkspaceItemAdded({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T12:00:00Z"),
    });

    const [id, config] = mockUpdateConfig.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("tr-1");
    expect((config.snapshot as { ids: string[] }).ids).toEqual([
      "report:r-1",
      "report:r-2",
      "semantic_model:d-1",
    ]);
    expect(config.polling).toEqual({ lastPolledAt: "2026-07-15T12:00:00.000Z" });
  });

  it("warns + skips without re-seeding when the snapshot is missing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await pollWorkspaceItemAdded({
      trigger: trigger(),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockReportsList).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("microsoft-powerbi.poll.no_snapshot"),
    );
    warn.mockRestore();
  });

  it("produces a timestamp-free eventId that is stable across two identical ticks", async () => {
    mockReportsList.mockResolvedValue([
      { id: "r-1", name: "Sales", reportType: "PowerBIReport", datasetId: null },
      { id: "r-2", name: "Forecast", reportType: "PowerBIReport", datasetId: null },
    ]);

    await pollWorkspaceItemAdded({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T12:00:00Z"),
    });
    await pollWorkspaceItemAdded({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T13:30:00Z"),
    });

    const first = (mockEnqueue.mock.calls[0]![0] as { event: { eventId: string } }).event.eventId;
    const second = (mockEnqueue.mock.calls[1]![0] as { event: { eventId: string } }).event.eventId;
    expect(first).toBe("microsoft-powerbi:wf-1:n-1:workspace_item_added:report:r-2");
    expect(second).toBe(first);
    expect(first).not.toMatch(/2026-07-15T/);
  });

  it("leaks no token or provider URL into the payload", async () => {
    mockReportsList.mockResolvedValueOnce([
      { id: "r-1", name: "Sales", reportType: "PowerBIReport", datasetId: null },
      { id: "r-2", name: "Forecast", reportType: "PowerBIReport", datasetId: null },
    ]);

    await pollWorkspaceItemAdded({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    const payload = JSON.stringify(
      (mockEnqueue.mock.calls[0]![0] as { event: { payload: unknown } }).event.payload,
    );
    expect(payload).not.toContain("tok");
    expect(payload).not.toContain("Bearer");
    expect(payload).not.toContain("api.powerbi.com");
    expect(payload).not.toContain("embedUrl");
  });
});
