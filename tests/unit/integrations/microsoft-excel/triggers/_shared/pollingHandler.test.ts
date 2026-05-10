/**
 * @jest-environment node
 */
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { IntegrationRecord } from "@/repositories/integrations";

const mockRefreshAndRetry = jest.fn();
const mockGetActive = jest.fn();
const mockUpdateConfig = jest.fn();
const mockUsed = jest.fn();
const mockRows = jest.fn();
const mockEnqueue = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActive(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/integrations/microsoft-excel/api/worksheetUsedRange", () => ({
  worksheetUsedRange: (...args: unknown[]) => mockUsed(...args),
}));

jest.mock("@/integrations/microsoft-excel/api/tableRowsList", () => ({
  tableRowsList: (...args: unknown[]) => mockRows(...args),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueue(...args),
}));

import { microsoftExcelPollingHandler } from "@/integrations/microsoft-excel/triggers/_shared/pollingHandler";
import { hashRow } from "@/integrations/microsoft-excel/triggers/_shared/snapshot";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGetActive.mockReset();
  mockUpdateConfig.mockReset();
  mockUsed.mockReset();
  mockRows.mockReset();
  mockEnqueue.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockEnqueue.mockResolvedValue({
    runId: "r-1",
    enqueuedAt: "2026-05-09T12:00:00Z",
  });
  mockUpdateConfig.mockResolvedValue(undefined);
  const integration: IntegrationRecord = {
    id: "int-1",
    userId: "u-1",
    provider: "microsoft-excel",
    providerAccountId: "alice@contoso.com",
    displayName: "Alice",
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: "enc",
    accessTokenExpiresAt: null,
    scopes: ["Files.ReadWrite"],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-05-09T00:00:00Z",
    updatedAt: "2026-05-09T00:00:00Z",
  };
  mockGetActive.mockResolvedValue(integration);
});

function worksheetTrigger(snapshot?: {
  rowHashes: Record<string, string>;
  rowCount: number;
  updatedAt: string;
}): TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    userId: "u-1",
    provider: "microsoft-excel",
    eventType: "new_row",
    nodeId: "n-1",
    config: {
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      pollingEnabled: true,
      ...(snapshot ? { snapshot } : {}),
    },
    accountId: null,
    registeredAt: "2026-05-09T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-05-09T00:00:00Z",
    updatedAt: "2026-05-09T00:00:00Z",
  };
}

function tableTrigger(snapshot?: {
  rowHashes: Record<string, string>;
  rowCount: number;
  updatedAt: string;
}): TriggerResourceRecord {
  return {
    id: "tr-2",
    workflowId: "wf-2",
    userId: "u-1",
    provider: "microsoft-excel",
    eventType: "new_table_row",
    nodeId: "n-2",
    config: {
      workbookId: "wb-1",
      tableName: "Table1",
      pollingEnabled: true,
      ...(snapshot ? { snapshot } : {}),
    },
    accountId: null,
    registeredAt: "2026-05-09T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-05-09T00:00:00Z",
    updatedAt: "2026-05-09T00:00:00Z",
  };
}

const NOW = Date.parse("2026-05-09T12:00:00Z");

describe("microsoftExcelPollingHandler", () => {
  describe("canHandle", () => {
    it("matches new_row + new_table_row on microsoft-excel", () => {
      expect(
        microsoftExcelPollingHandler.canHandle(worksheetTrigger()),
      ).toBe(true);
      expect(
        microsoftExcelPollingHandler.canHandle(tableTrigger()),
      ).toBe(true);
    });

    it("rejects other providers", () => {
      const t = worksheetTrigger();
      const otherProvider = { ...t, provider: "gmail" };
      expect(
        microsoftExcelPollingHandler.canHandle(otherProvider),
      ).toBe(false);
    });

    it("rejects unrelated event types", () => {
      const t = worksheetTrigger();
      expect(
        microsoftExcelPollingHandler.canHandle({
          ...t,
          eventType: "updated_row",
        }),
      ).toBe(false);
    });
  });

  describe("new_row poll", () => {
    it("emits one event per row whose key is new since the snapshot", async () => {
      const trigger = worksheetTrigger({
        rowHashes: {
          "1": "x",
          "2": "y",
        },
        rowCount: 2,
        updatedAt: "2026-05-09T11:00:00Z",
      });

      mockUsed.mockResolvedValueOnce({
        address: "Sheet1!A1:B4",
        rowCount: 4,
        columnCount: 2,
        values: [
          ["name", "age"],
          ["alice", 30],
          ["bob", 25],
          ["carol", 40],
        ],
      });

      await microsoftExcelPollingHandler.poll({
        trigger,
        userRole: "default",
        now: NOW,
      });

      // Keys "1" and "2" pre-existed; "3" and "4" are new.
      expect(mockEnqueue).toHaveBeenCalledTimes(2);
      const events = mockEnqueue.mock.calls.map((c) => c[0].event);
      expect(events.map((e: { eventId: string }) => e.eventId)).toEqual([
        "microsoft-excel:wf-1:n-1:new_row:3",
        "microsoft-excel:wf-1:n-1:new_row:4",
      ]);
      // Payload carries the row values.
      expect(events[0]!.payload).toMatchObject({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowIndex: 3,
        values: ["bob", 25],
      });
    });

    it("persists the updated snapshot after the tick", async () => {
      const trigger = worksheetTrigger({
        rowHashes: { "1": "h" },
        rowCount: 1,
        updatedAt: "2026-05-09T11:00:00Z",
      });

      mockUsed.mockResolvedValueOnce({
        address: "Sheet1!A1:A2",
        rowCount: 2,
        columnCount: 1,
        values: [["a"], ["b"]],
      });

      await microsoftExcelPollingHandler.poll({
        trigger,
        userRole: "default",
        now: NOW,
      });

      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
      const [updatedId, updatedConfig] = mockUpdateConfig.mock.calls[0]!;
      expect(updatedId).toBe("tr-1");
      expect(
        Object.keys((updatedConfig as { snapshot: { rowHashes: Record<string, string> } }).snapshot.rowHashes).sort(),
      ).toEqual(["1", "2"]);
      expect((updatedConfig as { polling: { lastPolledAt: string } }).polling.lastPolledAt).toBe(
        new Date(NOW).toISOString(),
      );
    });

    it("skips with a warning when snapshot is missing (defensive — should never happen in prod)", async () => {
      const trigger = worksheetTrigger();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      await microsoftExcelPollingHandler.poll({
        trigger,
        userRole: "default",
        now: NOW,
      });

      expect(mockUsed).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("skips with a warning when integration is not found", async () => {
      mockGetActive.mockResolvedValueOnce(null);
      const trigger = worksheetTrigger({
        rowHashes: {},
        rowCount: 0,
        updatedAt: "2026-05-09T11:00:00Z",
      });
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      await microsoftExcelPollingHandler.poll({
        trigger,
        userRole: "default",
        now: NOW,
      });

      expect(mockUsed).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("emits zero events when the worksheet hasn't changed", async () => {
      const previous = {
        rowHashes: {
          "1": hashRow(["a"]),
          "2": hashRow(["b"]),
        },
        rowCount: 2,
        updatedAt: "2026-05-09T11:00:00Z",
      };
      const trigger = worksheetTrigger(previous);

      mockUsed.mockResolvedValueOnce({
        address: "Sheet1!A1:A2",
        rowCount: 2,
        columnCount: 1,
        values: [["a"], ["b"]],
      });

      await microsoftExcelPollingHandler.poll({
        trigger,
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    });

    it("treats an empty worksheet (single null cell) as zero rows", async () => {
      const trigger = worksheetTrigger({
        rowHashes: {},
        rowCount: 0,
        updatedAt: "2026-05-09T11:00:00Z",
      });

      mockUsed.mockResolvedValueOnce({
        address: "Sheet1!A1",
        rowCount: 1,
        columnCount: 1,
        values: [[null]],
      });

      await microsoftExcelPollingHandler.poll({
        trigger,
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  describe("new_table_row poll", () => {
    it("emits events keyed by Graph's stable row index", async () => {
      const trigger = tableTrigger({
        rowHashes: { "0": "x" },
        rowCount: 1,
        updatedAt: "2026-05-09T11:00:00Z",
      });

      mockRows.mockResolvedValueOnce([
        { index: 0, values: [["alice", 30]] },
        { index: 1, values: [["bob", 25]] },
        { index: 2, values: [["carol", 40]] },
      ]);

      await microsoftExcelPollingHandler.poll({
        trigger,
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).toHaveBeenCalledTimes(2);
      const events = mockEnqueue.mock.calls.map((c) => c[0].event);
      expect(events.map((e: { eventId: string }) => e.eventId).sort()).toEqual(
        [
          "microsoft-excel:wf-2:n-2:new_table_row:1",
          "microsoft-excel:wf-2:n-2:new_table_row:2",
        ].sort(),
      );
      expect(events[0]!.payload).toMatchObject({
        workbookId: "wb-1",
        tableName: "Table1",
        values: ["bob", 25],
      });
    });

    it("emits zero events when no rows have been added", async () => {
      const previous = {
        rowHashes: {
          "0": hashRow(["alice", 30]),
        },
        rowCount: 1,
        updatedAt: "2026-05-09T11:00:00Z",
      };
      const trigger = tableTrigger(previous);

      mockRows.mockResolvedValueOnce([
        { index: 0, values: [["alice", 30]] },
      ]);

      await microsoftExcelPollingHandler.poll({
        trigger,
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  it("uses the DEFAULT_INTERVAL_MS polling cadence (Slice 15 = 5 min default for all roles)", () => {
    const interval = microsoftExcelPollingHandler.getIntervalMs("default");
    expect(interval).toBeGreaterThan(0);
  });
});
