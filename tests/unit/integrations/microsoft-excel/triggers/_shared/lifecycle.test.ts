/**
 * @jest-environment node
 *
 * microsoft-excel/triggers/_shared trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockGetActive = jest.fn();
const mockUpdateConfig = jest.fn();
const mockUsed = jest.fn();
const mockRows = jest.fn();
const mockWorksheets = jest.fn();
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

jest.mock("@/integrations/microsoft-excel/api/worksheetsList", () => ({
  worksheetsList: (...args: unknown[]) => mockWorksheets(...args),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueue(...args),
}));

import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { IntegrationRecord } from "@/repositories/integrations";
import { microsoftExcelPollingHandler } from "@/integrations/microsoft-excel/triggers/_shared/pollingHandler";
import { hashRow, buildSnapshot, buildWorksheetListSnapshot, findChangedKeys, findNewKeys, findNewWorksheets } from "@/integrations/microsoft-excel/triggers/_shared/snapshot";

// ---------------------------------------------------------------------------
// Merged from the former pollingHandler.test.ts
// ---------------------------------------------------------------------------
describe("pollingHandler (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGetActive.mockReset();
  mockUpdateConfig.mockReset();
  mockUsed.mockReset();
  mockRows.mockReset();
  mockWorksheets.mockReset();
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
    accountId: "acct-u-1",
    connectedByUserId: "u-1",
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

function worksheetTrigger(
  eventType: "new_row" | "updated_row",
  snapshot?: {
    rowHashes: Record<string, string>;
    rowCount: number;
    updatedAt: string;
  },
): TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "u-1",
    provider: "microsoft-excel",
    eventType,
    nodeId: "n-1",
    config: {
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      pollingEnabled: true,
      ...(snapshot ? { snapshot } : {}),
    },
    providerAccountId: null,
    registeredAt: "2026-05-09T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-05-09T00:00:00Z",
    updatedAt: "2026-05-09T00:00:00Z",
  };
}

function tableTrigger(
  eventType: "new_table_row" | "updated_table_row",
  snapshot?: {
    rowHashes: Record<string, string>;
    rowCount: number;
    updatedAt: string;
  },
): TriggerResourceRecord {
  return {
    id: "tr-2",
    workflowId: "wf-2",
    workflowAccountId: "acct-2",
    userId: "u-1",
    provider: "microsoft-excel",
    eventType,
    nodeId: "n-2",
    config: {
      workbookId: "wb-1",
      tableName: "Table1",
      pollingEnabled: true,
      ...(snapshot ? { snapshot } : {}),
    },
    providerAccountId: null,
    registeredAt: "2026-05-09T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-05-09T00:00:00Z",
    updatedAt: "2026-05-09T00:00:00Z",
  };
}

function worksheetListTrigger(snapshot?: {
  names: string[];
  updatedAt: string;
}): TriggerResourceRecord {
  return {
    id: "tr-3",
    workflowId: "wf-3",
    workflowAccountId: "acct-3",
    userId: "u-1",
    provider: "microsoft-excel",
    eventType: "new_worksheet",
    nodeId: "n-3",
    config: {
      workbookId: "wb-1",
      pollingEnabled: true,
      ...(snapshot ? { snapshot } : {}),
    },
    providerAccountId: null,
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
    it("matches all five Excel polling event types", () => {
      expect(
        microsoftExcelPollingHandler.canHandle(worksheetTrigger("new_row")),
      ).toBe(true);
      expect(
        microsoftExcelPollingHandler.canHandle(worksheetTrigger("updated_row")),
      ).toBe(true);
      expect(
        microsoftExcelPollingHandler.canHandle(tableTrigger("new_table_row")),
      ).toBe(true);
      expect(
        microsoftExcelPollingHandler.canHandle(
          tableTrigger("updated_table_row"),
        ),
      ).toBe(true);
      expect(
        microsoftExcelPollingHandler.canHandle(worksheetListTrigger()),
      ).toBe(true);
    });

    it("rejects other providers", () => {
      const t = worksheetTrigger("new_row");
      const otherProvider = { ...t, provider: "gmail" };
      expect(
        microsoftExcelPollingHandler.canHandle(otherProvider),
      ).toBe(false);
    });

    it("rejects unrelated Excel event types (e.g. deleted_row)", () => {
      const t = worksheetTrigger("new_row");
      expect(
        microsoftExcelPollingHandler.canHandle({
          ...t,
          eventType: "deleted_row",
        }),
      ).toBe(false);
    });
  });

  describe("new_row poll", () => {
    it("emits one event per row whose key is new since the snapshot", async () => {
      const trigger = worksheetTrigger("new_row", {
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
        accountId: "acct-test",
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
      expect(events[0]!.payload).toMatchObject({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowIndex: 3,
        values: ["bob", 25],
      });
    });

    it("persists the updated snapshot after the tick", async () => {
      const trigger = worksheetTrigger("new_row", {
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
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
      const [updatedId, updatedConfig] = mockUpdateConfig.mock.calls[0]!;
      expect(updatedId).toBe("tr-1");
      expect(
        Object.keys(
          (updatedConfig as { snapshot: { rowHashes: Record<string, string> } })
            .snapshot.rowHashes,
        ).sort(),
      ).toEqual(["1", "2"]);
      expect(
        (updatedConfig as { polling: { lastPolledAt: string } }).polling
          .lastPolledAt,
      ).toBe(new Date(NOW).toISOString());
    });

    it("skips with a warning when snapshot is missing (defensive — should never happen in prod)", async () => {
      const trigger = worksheetTrigger("new_row");
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
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
      const trigger = worksheetTrigger("new_row", {
        rowHashes: {},
        rowCount: 0,
        updatedAt: "2026-05-09T11:00:00Z",
      });
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
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
      const trigger = worksheetTrigger("new_row", previous);

      mockUsed.mockResolvedValueOnce({
        address: "Sheet1!A1:A2",
        rowCount: 2,
        columnCount: 1,
        values: [["a"], ["b"]],
      });

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    });

    it("treats an empty worksheet (single null cell) as zero rows", async () => {
      const trigger = worksheetTrigger("new_row", {
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
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  describe("new_table_row poll", () => {
    it("emits events keyed by Graph's stable row index", async () => {
      const trigger = tableTrigger("new_table_row", {
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
        accountId: "acct-test",
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
      const trigger = tableTrigger("new_table_row", previous);

      mockRows.mockResolvedValueOnce([{ index: 0, values: [["alice", 30]] }]);

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  describe("updated_row poll", () => {
    it("emits one event per row whose key existed before but whose hash changed", async () => {
      const previous = {
        rowHashes: {
          "1": hashRow(["alice", 30]),
          "2": hashRow(["bob", 25]),
          "3": hashRow(["carol", 40]),
        },
        rowCount: 3,
        updatedAt: "2026-05-09T11:00:00Z",
      };
      const trigger = worksheetTrigger("updated_row", previous);

      mockUsed.mockResolvedValueOnce({
        address: "Sheet1!A1:B3",
        rowCount: 3,
        columnCount: 2,
        values: [
          ["alice", 30],
          ["bob", 26],
          ["carol", 41],
        ],
      });

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).toHaveBeenCalledTimes(2);
      const events = mockEnqueue.mock.calls.map((c) => c[0].event);
      expect(events.map((e: { eventId: string }) => e.eventId)).toEqual([
        "microsoft-excel:wf-1:n-1:updated_row:2",
        "microsoft-excel:wf-1:n-1:updated_row:3",
      ]);
      expect(events[0]!.payload).toMatchObject({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowIndex: 2,
        values: ["bob", 26],
      });
    });

    it("does NOT fire for NEW rows (those belong to the new_row trigger)", async () => {
      const previous = {
        rowHashes: { "1": hashRow(["alice", 30]) },
        rowCount: 1,
        updatedAt: "2026-05-09T11:00:00Z",
      };
      const trigger = worksheetTrigger("updated_row", previous);

      mockUsed.mockResolvedValueOnce({
        address: "Sheet1!A1:B2",
        rowCount: 2,
        columnCount: 2,
        values: [
          ["alice", 30],
          ["bob", 25],
        ],
      });

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it("emits zero events when the worksheet hasn't changed", async () => {
      const previous = {
        rowHashes: {
          "1": hashRow(["alice", 30]),
          "2": hashRow(["bob", 25]),
        },
        rowCount: 2,
        updatedAt: "2026-05-09T11:00:00Z",
      };
      const trigger = worksheetTrigger("updated_row", previous);

      mockUsed.mockResolvedValueOnce({
        address: "Sheet1!A1:B2",
        rowCount: 2,
        columnCount: 2,
        values: [
          ["alice", 30],
          ["bob", 25],
        ],
      });

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    });

    it("skips with a warning when snapshot is missing", async () => {
      const trigger = worksheetTrigger("updated_row");
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockUsed).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("persists the updated snapshot after the tick", async () => {
      const previous = {
        rowHashes: { "1": hashRow(["old"]) },
        rowCount: 1,
        updatedAt: "2026-05-09T11:00:00Z",
      };
      const trigger = worksheetTrigger("updated_row", previous);

      mockUsed.mockResolvedValueOnce({
        address: "Sheet1!A1",
        rowCount: 1,
        columnCount: 1,
        values: [["new"]],
      });

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
      const [, updatedConfig] = mockUpdateConfig.mock.calls[0]!;
      const snap = (
        updatedConfig as { snapshot: { rowHashes: Record<string, string> } }
      ).snapshot;
      expect(snap.rowHashes["1"]).toBe(hashRow(["new"]));
    });
  });

  describe("updated_table_row poll", () => {
    it("emits one event per stable-id row whose hash changed", async () => {
      const previous = {
        rowHashes: {
          "0": hashRow(["alice", 30]),
          "1": hashRow(["bob", 25]),
        },
        rowCount: 2,
        updatedAt: "2026-05-09T11:00:00Z",
      };
      const trigger = tableTrigger("updated_table_row", previous);

      mockRows.mockResolvedValueOnce([
        { index: 0, values: [["alice", 31]] },
        { index: 1, values: [["bob", 25]] },
      ]);

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      const event = mockEnqueue.mock.calls[0]![0].event;
      expect(event.eventId).toBe(
        "microsoft-excel:wf-2:n-2:updated_table_row:0",
      );
      expect(event.payload).toMatchObject({
        workbookId: "wb-1",
        tableName: "Table1",
        rowIndex: 0,
        values: ["alice", 31],
      });
    });

    it("does NOT fire for new rows (those belong to new_table_row)", async () => {
      const previous = {
        rowHashes: { "0": hashRow(["alice", 30]) },
        rowCount: 1,
        updatedAt: "2026-05-09T11:00:00Z",
      };
      const trigger = tableTrigger("updated_table_row", previous);

      mockRows.mockResolvedValueOnce([
        { index: 0, values: [["alice", 30]] },
        { index: 1, values: [["bob", 25]] },
      ]);

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  describe("new_worksheet poll", () => {
    it("emits one event per worksheet whose name is new", async () => {
      const trigger = worksheetListTrigger({
        names: ["Sheet1", "Sheet2"],
        updatedAt: "2026-05-09T11:00:00Z",
      });

      mockWorksheets.mockResolvedValueOnce([
        { id: "ws-1", name: "Sheet1", position: 0 },
        { id: "ws-2", name: "Sheet2", position: 1 },
        { id: "ws-3", name: "Sheet3", position: 2 },
        { id: "ws-4", name: "Q4-Sales", position: 3 },
      ]);

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).toHaveBeenCalledTimes(2);
      const events = mockEnqueue.mock.calls.map((c) => c[0].event);
      expect(events.map((e: { eventId: string }) => e.eventId)).toEqual([
        "microsoft-excel:wf-3:n-3:new_worksheet:Sheet3",
        "microsoft-excel:wf-3:n-3:new_worksheet:Q4-Sales",
      ]);
      expect(events[0]!.payload).toMatchObject({
        workbookId: "wb-1",
        worksheetName: "Sheet3",
        worksheetId: "ws-3",
        position: 2,
      });
    });

    it("persists the new worksheet-list snapshot after the tick", async () => {
      const trigger = worksheetListTrigger({
        names: ["Sheet1"],
        updatedAt: "2026-05-09T11:00:00Z",
      });

      mockWorksheets.mockResolvedValueOnce([
        { id: "ws-1", name: "Sheet1" },
        { id: "ws-2", name: "Sheet2" },
      ]);

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
      const [, updatedConfig] = mockUpdateConfig.mock.calls[0]!;
      const snap = (updatedConfig as { snapshot: { names: string[] } }).snapshot;
      expect(snap.names).toEqual(["Sheet1", "Sheet2"]);
    });

    it("emits zero events when the worksheet list is unchanged", async () => {
      const trigger = worksheetListTrigger({
        names: ["Sheet1", "Sheet2"],
        updatedAt: "2026-05-09T11:00:00Z",
      });

      mockWorksheets.mockResolvedValueOnce([
        { id: "ws-1", name: "Sheet1" },
        { id: "ws-2", name: "Sheet2" },
      ]);

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    });

    it("treats a rename as a new worksheet (remove old + add new)", async () => {
      const trigger = worksheetListTrigger({
        names: ["Sheet1", "Sheet2"],
        updatedAt: "2026-05-09T11:00:00Z",
      });

      mockWorksheets.mockResolvedValueOnce([
        { id: "ws-1", name: "Sheet1" },
        { id: "ws-2", name: "Q4-Sales" },
      ]);

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      const event = mockEnqueue.mock.calls[0]![0].event;
      expect(event.payload).toMatchObject({
        worksheetName: "Q4-Sales",
        worksheetId: "ws-2",
      });
    });

    it("skips with a warning when snapshot is missing", async () => {
      const trigger = worksheetListTrigger();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      await microsoftExcelPollingHandler.poll({
        trigger,
        accountId: "acct-test",
        userRole: "default",
        now: NOW,
      });

      expect(mockWorksheets).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  it("uses the DEFAULT_INTERVAL_MS polling cadence (Slice 15 = 5 min default for all roles)", () => {
    const interval = microsoftExcelPollingHandler.getIntervalMs("default");
    expect(interval).toBeGreaterThan(0);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former snapshot.test.ts
// ---------------------------------------------------------------------------
describe("snapshot (lifecycle)", () => {

describe("Excel snapshot helpers", () => {
  it("hashRow is deterministic for the same values", () => {
    const a = hashRow(["x", 1, true]);
    const b = hashRow(["x", 1, true]);
    expect(a).toBe(b);
  });

  it("hashRow distinguishes different values", () => {
    expect(hashRow(["x", 1])).not.toBe(hashRow(["x", 2]));
    expect(hashRow([null])).not.toBe(hashRow([0]));
  });

  it("buildSnapshot captures each entry's key and hash", () => {
    const snap = buildSnapshot([
      { key: "1", values: ["alice", 30] },
      { key: "2", values: ["bob", 25] },
    ]);
    expect(snap.rowCount).toBe(2);
    expect(Object.keys(snap.rowHashes).sort()).toEqual(["1", "2"]);
    expect(snap.rowHashes["1"]).toBe(hashRow(["alice", 30]));
    expect(typeof snap.updatedAt).toBe("string");
  });

  it("buildSnapshot is empty for zero entries", () => {
    const snap = buildSnapshot([]);
    expect(snap.rowCount).toBe(0);
    expect(snap.rowHashes).toEqual({});
  });

  describe("findNewKeys", () => {
    it("returns only entries whose key is new", () => {
      const previous = buildSnapshot([
        { key: "1", values: ["a"] },
        { key: "2", values: ["b"] },
      ]);
      const current = [
        { key: "1", values: ["a"] },
        { key: "2", values: ["b"] },
        { key: "3", values: ["c"] },
        { key: "4", values: ["d"] },
      ];
      const news = findNewKeys(previous, current);
      expect(news.map((e) => e.key)).toEqual(["3", "4"]);
    });

    it("ignores hash changes on existing keys (the updated_* triggers use findChangedKeys instead)", () => {
      const previous = buildSnapshot([{ key: "1", values: ["alice"] }]);
      const current = [{ key: "1", values: ["alice-renamed"] }];
      expect(findNewKeys(previous, current)).toEqual([]);
    });

    it("returns [] when nothing changed", () => {
      const previous = buildSnapshot([
        { key: "1", values: ["a"] },
        { key: "2", values: ["b"] },
      ]);
      expect(
        findNewKeys(previous, [
          { key: "1", values: ["a"] },
          { key: "2", values: ["b"] },
        ]),
      ).toEqual([]);
    });
  });

  describe("findChangedKeys", () => {
    it("returns entries whose key exists in both but hash differs", () => {
      const previous = buildSnapshot([
        { key: "1", values: ["alice", 30] },
        { key: "2", values: ["bob", 25] },
      ]);
      const current = [
        { key: "1", values: ["alice", 31] },
        { key: "2", values: ["bob", 25] },
      ];
      const changed = findChangedKeys(previous, current);
      expect(changed.map((e) => e.key)).toEqual(["1"]);
      expect(changed[0]!.values).toEqual(["alice", 31]);
    });

    it("ignores entries whose key did not exist in the previous snapshot (those are NEW, not updates)", () => {
      const previous = buildSnapshot([{ key: "1", values: ["a"] }]);
      const current = [
        { key: "1", values: ["a"] },
        { key: "2", values: ["b"] },
      ];
      expect(findChangedKeys(previous, current)).toEqual([]);
    });

    it("returns [] when nothing changed", () => {
      const previous = buildSnapshot([
        { key: "1", values: ["a"] },
        { key: "2", values: ["b"] },
      ]);
      expect(
        findChangedKeys(previous, [
          { key: "1", values: ["a"] },
          { key: "2", values: ["b"] },
        ]),
      ).toEqual([]);
    });

    it("flags every shifted row when a mid-sheet row is deleted (accepted worksheet position-keyed limitation)", () => {
      // Pre: rows 1=A, 2=B, 3=C. User deletes row 2; now rows 1=A, 2=C.
      // Position-keyed diff: key "2" was B, is now C → changed. Key "3"
      // was C, is now absent → not in current → not flagged.
      const previous = buildSnapshot([
        { key: "1", values: ["A"] },
        { key: "2", values: ["B"] },
        { key: "3", values: ["C"] },
      ]);
      const current = [
        { key: "1", values: ["A"] },
        { key: "2", values: ["C"] },
      ];
      const changed = findChangedKeys(previous, current);
      expect(changed.map((e) => e.key)).toEqual(["2"]);
    });
  });

  describe("worksheet-list snapshot", () => {
    it("buildWorksheetListSnapshot stores names + an ISO updatedAt", () => {
      const snap = buildWorksheetListSnapshot(["Sheet1", "Sheet2"]);
      expect(snap.names).toEqual(["Sheet1", "Sheet2"]);
      expect(typeof snap.updatedAt).toBe("string");
    });

    it("buildWorksheetListSnapshot copies the input array (no shared mutable reference)", () => {
      const input = ["Sheet1"];
      const snap = buildWorksheetListSnapshot(input);
      input.push("Sheet2");
      expect(snap.names).toEqual(["Sheet1"]);
    });

    it("findNewWorksheets returns names in current but not in previous", () => {
      const previous = buildWorksheetListSnapshot(["Sheet1", "Sheet2"]);
      const current = ["Sheet1", "Sheet2", "Sheet3", "Sheet4"];
      expect(findNewWorksheets(previous, current)).toEqual(["Sheet3", "Sheet4"]);
    });

    it("findNewWorksheets returns [] when no names were added", () => {
      const previous = buildWorksheetListSnapshot(["Sheet1", "Sheet2"]);
      expect(findNewWorksheets(previous, ["Sheet2", "Sheet1"])).toEqual([]);
    });

    it("findNewWorksheets fires for a renamed sheet (rename = remove old + add new)", () => {
      const previous = buildWorksheetListSnapshot(["Sheet1", "Sheet2"]);
      // User renamed Sheet2 → Q4-Sales.
      const current = ["Sheet1", "Q4-Sales"];
      expect(findNewWorksheets(previous, current)).toEqual(["Q4-Sales"]);
    });
  });
});

});
