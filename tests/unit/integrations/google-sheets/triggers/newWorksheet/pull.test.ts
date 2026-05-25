/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockSpreadsheetsGet = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/spreadsheetsGet", () => ({
  spreadsheetsGet: (...args: unknown[]) => mockSpreadsheetsGet(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { pull } from "@/integrations/google-sheets/triggers/newWorksheet/pull";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSpreadsheetsGet.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "google-sheets",
    providerAccountId: "alice@example.com",
  });
});

const baseTrigger = {
  id: "tr-nw-1",
  workflowId: "wf-1",
  userId: "user-1",
  provider: "google-sheets",
  eventType: "new_worksheet",
  nodeId: "n-nw",
  config: {
    type: "subscription-watch",
    spreadsheetId: "ss-1",
    channelId: "channel-nw",
    worksheetSnapshot: {
      names: ["Sheet1"],
      updatedAt: "2026-05-15T00:00:00.000Z",
    },
  },
  accountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Sheets new_worksheet pull", () => {
  it("emits one event when a new worksheet appears", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1", index: 0, sheetType: "GRID" } },
        { properties: { sheetId: 12, title: "Notes", index: 1, sheetType: "GRID" } },
      ],
    });

    const result = await pull(baseTrigger);

    expect(result.events).toHaveLength(1);
    const ev = result.events[0]!;
    expect(ev.eventType).toBe("new_worksheet");
    expect(ev.payload).toEqual({
      changeKind: "added",
      spreadsheetId: "ss-1",
      worksheetId: 12,
      worksheetName: "Notes",
      index: 1,
      sheetType: "GRID",
    });
    expect(ev.eventId).toMatch(/^ss-1:new_worksheet:12:[0-9a-f]{12}$/);
  });

  it("emits zero events when the worksheet list is unchanged", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });

    const result = await pull(baseTrigger);
    expect(result.events).toEqual([]);
  });

  it("emits multiple events when multiple worksheets are added", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 10, title: "A" } },
        { properties: { sheetId: 11, title: "B" } },
        { properties: { sheetId: 12, title: "C" } },
      ],
    });

    const result = await pull(baseTrigger);
    expect(result.events).toHaveLength(3);
    const names = result.events
      .map((e) => (e.payload as { worksheetName: string }).worksheetName)
      .sort();
    expect(names).toEqual(["A", "B", "C"]);
  });

  it("fires for the NEW name when a sheet is renamed (matches V1 + Excel)", async () => {
    // Baseline contained "Sheet1". Sheet renamed to "Renamed". From
    // the diff's perspective: "Sheet1" disappears + "Renamed" appears
    // → ONE event for "Renamed". Stable behavior documented in
    // normalize.ts module comment.
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Renamed", index: 0 } }],
    });

    const result = await pull(baseTrigger);
    expect(result.events).toHaveLength(1);
    expect(
      (result.events[0]!.payload as { worksheetName: string }).worksheetName,
    ).toBe("Renamed");
  });

  it("persists the new worksheet snapshot AFTER successful pull (zero events case)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });

    await pull(baseTrigger);
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [triggerId, newConfig] = mockUpdateConfig.mock.calls[0]!;
    expect(triggerId).toBe("tr-nw-1");
    expect(
      (newConfig as { worksheetSnapshot: { names: string[] } }).worksheetSnapshot.names,
    ).toEqual(["Sheet1"]);
  });

  it("persists the new worksheet snapshot AFTER emitting events", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 10, title: "Tab2" } },
      ],
    });

    await pull(baseTrigger);
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [, newConfig] = mockUpdateConfig.mock.calls[0]!;
    expect(
      (newConfig as { worksheetSnapshot: { names: string[] } }).worksheetSnapshot.names,
    ).toEqual(["Sheet1", "Tab2"]);
  });

  it("propagates persistence failure (does not corrupt prior snapshot)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 10, title: "Tab2" } },
      ],
    });
    mockUpdateConfig.mockRejectedValueOnce(new Error("DB write failed"));

    await expect(pull(baseTrigger)).rejects.toThrow(/DB write failed/);
    // Only one persist attempt; the trigger row's existing snapshot
    // is unchanged.
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
  });

  it("returns resyncRequired:true when spreadsheetId is missing", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, spreadsheetId: undefined },
    };
    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    expect(mockSpreadsheetsGet).not.toHaveBeenCalled();
  });

  it("returns resyncRequired:true when worksheetSnapshot is missing (activate didn't seed)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, worksheetSnapshot: undefined },
    };
    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    expect(mockSpreadsheetsGet).not.toHaveBeenCalled();
    const warned = warnSpy.mock.calls
      .flat()
      .find(
        (a) =>
          typeof a === "string" && a.includes("no_worksheet_snapshot"),
      );
    expect(warned).toBeDefined();
    warnSpy.mockRestore();
  });

  it("returns empty result when integration row is missing", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const result = await pull(baseTrigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(false);
    expect(mockSpreadsheetsGet).not.toHaveBeenCalled();
  });

  it("skips sheets missing a sheetId + logs (defensive)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { title: "MalformedNew" } }, // no sheetId
      ],
    });

    const result = await pull(baseTrigger);
    // MalformedNew would be "new" but is skipped → zero events.
    expect(result.events).toEqual([]);
    const warned = warnSpy.mock.calls
      .flat()
      .find(
        (a) =>
          typeof a === "string" && a.includes("missing_sheet_id"),
      );
    expect(warned).toBeDefined();
    warnSpy.mockRestore();
  });

  it("identical webhook fires produce identical eventIds (dedup at dispatcher)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 12, title: "NewSheet" } },
      ],
    });
    const r1 = await pull(baseTrigger);
    expect(r1.events).toHaveLength(1);
    const id1 = r1.events[0]!.eventId;

    // Simulate "snapshot didn't advance in DB yet" — second pull
    // with the same baseline.
    mockUpdateConfig.mockReset();
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 12, title: "NewSheet" } },
      ],
    });
    const r2 = await pull(baseTrigger);
    expect(r2.events).toHaveLength(1);
    expect(r2.events[0]!.eventId).toBe(id1);
  });
});
