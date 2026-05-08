/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockValuesGet = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/valuesGet", () => ({
  valuesGet: (...args: unknown[]) => mockValuesGet(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { pull } from "@/integrations/google-sheets/triggers/rowChanged/pull";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesGet.mockReset();
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
  id: "tr-1",
  workflowId: "wf-1",
  userId: "user-1",
  provider: "google-sheets",
  eventType: "row_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    spreadsheetId: "ss-1",
    sheetName: "Sheet1",
    headerRow: false,
    lastRowCount: 3,
    channelId: "channel-1",
  },
  accountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Sheets row_changed pull", () => {
  it("emits one TriggerEvent per newly added row when count grew", async () => {
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["a", "b"],
        ["c", "d"],
        ["e", "f"],
        ["g", "h"], // row 4 — new
        ["i", "j"], // row 5 — new
      ],
    });

    const result = await pull(baseTrigger);

    expect(mockValuesGet).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        spreadsheetId: "ss-1",
        range: "Sheet1!A:Z",
      }),
    );
    expect(result.events).toHaveLength(2);
    expect(result.events[0]!.payload).toMatchObject({
      changeKind: "added",
      spreadsheetId: "ss-1",
      sheetName: "Sheet1",
      rowIndex: 4,
      rowValues: ["g", "h"],
      headers: null,
    });
    expect(result.events[1]!.payload).toMatchObject({
      rowIndex: 5,
      rowValues: ["i", "j"],
    });
    expect(result.resyncRequired).toBe(false);

    // lastRowCount advances to the new total.
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      "tr-1",
      expect.objectContaining({ lastRowCount: 5 }),
    );
  });

  it("emits zero events when row count is unchanged AND does not persist", async () => {
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["a", "b"],
        ["c", "d"],
        ["e", "f"],
      ],
    });

    const result = await pull(baseTrigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(false);
    // No change → no persist (avoids no-op writes).
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("emits zero events when row count decreased BUT still updates the snapshot down", async () => {
    // Going from 3 → 1 means rows were deleted. Slice 5 Batch 1 doesn't
    // emit "removed" events, BUT the stored snapshot must update down so
    // a subsequent re-add fires correctly.
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    mockValuesGet.mockResolvedValueOnce({ values: [["a"]] });

    const result = await pull(baseTrigger);

    expect(result.events).toEqual([]);
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      "tr-1",
      expect.objectContaining({ lastRowCount: 1 }),
    );
    debugSpy.mockRestore();
  });

  it("when headerRow=true, surfaces values[0] as `headers` in each event", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, headerRow: true },
    };
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["Name", "Email"], // header row (row 1)
        ["alice", "a@e"], // row 2
        ["bob", "b@e"], // row 3
        ["charlie", "c@e"], // row 4 — new
      ],
    });

    const result = await pull(trigger);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload.headers).toEqual(["Name", "Email"]);
    expect(result.events[0]!.payload.rowIndex).toBe(4);
    expect(result.events[0]!.payload.rowValues).toEqual(["charlie", "c@e"]);
  });

  it("returns resyncRequired:true when lastRowCount is missing from config", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, lastRowCount: undefined },
    };
    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    expect(mockValuesGet).not.toHaveBeenCalled();
  });

  it("returns resyncRequired:true when spreadsheetId or sheetName missing", async () => {
    const trigger = {
      ...baseTrigger,
      config: { ...baseTrigger.config, sheetName: undefined },
    };
    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
  });

  it("returns empty result when integration row is missing", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const result = await pull(baseTrigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(false);
    expect(mockValuesGet).not.toHaveBeenCalled();
  });

  it("emits stable eventId so duplicate notifications dedup at the dispatcher", async () => {
    // Two pulls, same delta — should produce events with identical eventIds
    // for the dispatcher's webhook_event_dedup lookup.
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["a"],
        ["b"],
        ["c"],
        ["d"], // row 4 — new
      ],
    });

    const r1 = await pull(baseTrigger);
    expect(r1.events).toHaveLength(1);
    const eventId1 = r1.events[0]!.eventId;

    // Reset mocks for the second call. Simulate "lastRowCount didn't
    // advance in DB yet" (race condition on duplicate notification).
    mockUpdateConfig.mockReset();
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["a"],
        ["b"],
        ["c"],
        ["d"],
      ],
    });

    const r2 = await pull(baseTrigger);
    expect(r2.events).toHaveLength(1);
    expect(r2.events[0]!.eventId).toBe(eventId1);
  });
});
