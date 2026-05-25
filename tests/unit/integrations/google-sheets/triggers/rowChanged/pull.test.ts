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

// ──────────────────────────────────────────────────────────────────
// Sheets 2.3 — extended changeKinds (snapshot-diff path).
// ──────────────────────────────────────────────────────────────────
describe("Sheets row_changed pull — extended changeKinds (snapshot-diff)", () => {
  // Build a trigger config with a previously-seeded snapshot. The
  // snapshot's rowHashes use the SAME hashRow algorithm normalize.ts
  // uses, so eventIds align.
  function buildPriorSnapshotPositional(rows: ReadonlyArray<ReadonlyArray<unknown>>) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const rowHashes: Record<string, string> = {};
    rows.forEach((row, i) => {
      rowHashes[String(i + 1)] = createHash("sha256")
        .update(JSON.stringify(row))
        .digest("hex");
    });
    return {
      rowHashes,
      rowCount: rows.length,
      windowStart: rows.length === 0 ? 1 : 1,
      windowEnd: rows.length,
      keyMode: "positional" as const,
      keyColumn: null,
      updatedAt: "2026-05-15T00:00:00.000Z",
    };
  }

  function extendedTrigger(opts: {
    rows?: ReadonlyArray<ReadonlyArray<unknown>>;
    changeKinds?: ("added" | "updated" | "removed")[];
    headerRow?: boolean;
    keyColumn?: string | null;
    snapshotRowLimit?: number;
  } = {}) {
    const rows = opts.rows ?? [["a"], ["b"], ["c"]];
    const snapshot = buildPriorSnapshotPositional(rows);
    return {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        headerRow: opts.headerRow ?? false,
        changeKinds: opts.changeKinds ?? ["added", "updated", "removed"],
        snapshotRowLimit: opts.snapshotRowLimit ?? 1000,
        keyColumn: opts.keyColumn ?? null,
        snapshot,
        lastRowCount: rows.length,
      },
    };
  }

  it("emits 'updated' event when an existing row's values change", async () => {
    const trigger = extendedTrigger({
      rows: [["alice", 30]],
      changeKinds: ["updated"],
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [["alice", 31]], // age changed
    });

    const result = await pull(trigger);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload).toMatchObject({
      changeKind: "updated",
      rowIndex: 1,
      rowKey: "1",
      rowValues: ["alice", 31],
      previousValues: null,
    });
    // EventId carries the changeKind infix.
    expect(result.events[0]!.eventId).toMatch(/^ss-1:Sheet1:updated:1:[0-9a-f]{12}$/);
    // Snapshot persisted with the new hash + updated rowCount.
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const persistedConfig = mockUpdateConfig.mock.calls[0]![1] as {
      snapshot: { rowHashes: Record<string, string>; rowCount: number };
      lastRowCount: number;
    };
    expect(persistedConfig.lastRowCount).toBe(1);
    expect(persistedConfig.snapshot.rowHashes["1"]).toBeDefined();
  });

  it("emits NO event when changeKinds is ['updated'] but only an 'added' delta occurred", async () => {
    const trigger = extendedTrigger({
      rows: [["a"]],
      changeKinds: ["updated"],
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [["a"], ["b"]], // row 2 added — but changeKinds excludes "added"
    });

    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    // Snapshot still persists with the new row count + new hash.
    expect(mockUpdateConfig).toHaveBeenCalled();
  });

  it("emits 'removed' event when a row is deleted from the sheet", async () => {
    const trigger = extendedTrigger({
      rows: [["a"], ["b"]],
      changeKinds: ["removed"],
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [["a"]], // row 2 deleted
    });

    const result = await pull(trigger);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload).toMatchObject({
      changeKind: "removed",
      rowIndex: null,
      rowKey: "2",
      rowValues: null,
      previousValues: null,
    });
    expect(result.events[0]!.eventId).toMatch(
      /^ss-1:Sheet1:removed:2:[0-9a-f]{12}$/,
    );
  });

  it("DOES NOT fire 'removed' when a row aged out of the bounded window (D-RemovedWindowSlide)", async () => {
    // Activate seeded a snapshot of 50 rows (cap=50, total=50, window=1..50).
    // Sheet now has 100 rows. Cap=50 → new snapshot covers rows 51..100.
    // Previous keys "1".."50" are absent from the new snapshot.
    // None should fire as removed — they slid out of the window.
    // (100 = 2x cap exactly, no overflow.)
    const prevRows = Array.from({ length: 50 }, (_, i) => [`v${i + 1}`]);
    const snapshot = buildPriorSnapshotPositional(prevRows);
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        changeKinds: ["added", "updated", "removed"] as const,
        snapshotRowLimit: 50,
        keyColumn: null,
        snapshot,
        lastRowCount: 50,
        headerRow: false,
      },
    };
    mockValuesGet.mockResolvedValueOnce({
      values: Array.from({ length: 100 }, (_, i) => [`v${i + 1}`]),
    });

    const result = await pull(trigger);

    // Previous covered keys 1..50; new covers 51..100. Intersection: empty.
    // All 50 new keys (51..100) are "added"; prev keys 1..50 are
    // "removed candidates" → each is < new.windowStart (51) → slide.
    const removed = result.events.filter(
      (e) => (e.payload as { changeKind: string }).changeKind === "removed",
    );
    expect(removed).toEqual([]);
    const added = result.events.filter(
      (e) => (e.payload as { changeKind: string }).changeKind === "added",
    );
    expect(added).toHaveLength(50);
  });

  it("DOES fire 'removed' for rows past the new sheet's tail (genuine deletion at the bottom)", async () => {
    const prevRows = Array.from({ length: 10 }, (_, i) => [`v${i + 1}`]);
    const snapshot = buildPriorSnapshotPositional(prevRows);
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        changeKinds: ["removed"] as const,
        snapshotRowLimit: 50,
        keyColumn: null,
        snapshot,
        lastRowCount: 10,
        headerRow: false,
      },
    };
    // Sheet shrunk to 5 rows. Previous keys "6".."10" absent from
    // current snapshot — all genuine.
    mockValuesGet.mockResolvedValueOnce({
      values: Array.from({ length: 5 }, (_, i) => [`v${i + 1}`]),
    });

    const result = await pull(trigger);
    expect(result.events).toHaveLength(5);
    expect(result.events.map((e) => (e.payload as { rowKey: string }).rowKey).sort()).toEqual(
      ["10", "6", "7", "8", "9"],
    );
  });

  it("emits 'added' + 'updated' + 'removed' for a mixed-change webhook", async () => {
    const trigger = extendedTrigger({
      rows: [
        ["alice", 30],
        ["bob", 25],
        ["carol", 40],
      ],
      changeKinds: ["added", "updated", "removed"],
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["alice", 31], // row 1 updated
        ["bob", 25], // row 2 unchanged
        // row 3 (carol) removed
        ["dave", 50], // row 3 added (new "dave" in position formerly held by carol)
        ["eve", 22], // row 4 added
      ],
    });

    const result = await pull(trigger);
    // Positional shifts mean "row 3" appears updated (was carol, now
    // dave). "row 4" is new (added). No genuine "removed" — the
    // sheet got bigger.
    const byKind: Record<string, number> = {};
    for (const ev of result.events) {
      const k = (ev.payload as { changeKind: string }).changeKind;
      byKind[k] = (byKind[k] ?? 0) + 1;
    }
    expect(byKind["updated"]).toBe(2); // rows 1 + 3 differ from prev
    expect(byKind["added"]).toBe(1); // row 4 is new
    expect(byKind["removed"]).toBeUndefined();
  });

  it("keyColumn mode: detects update by key, suppresses positional shift noise", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    // Prior snapshot keyed by id column.
    const prevRows: ReadonlyArray<ReadonlyArray<unknown>> = [
      ["a1", "alice@e.test"],
      ["b2", "bob@e.test"],
    ];
    const rowHashes: Record<string, string> = {};
    prevRows.forEach((row) => {
      rowHashes[String(row[0])] = createHash("sha256")
        .update(JSON.stringify(row))
        .digest("hex");
    });
    const snapshot = {
      rowHashes,
      rowCount: 2,
      windowStart: 2,
      windowEnd: 3,
      keyMode: "keyColumn" as const,
      keyColumn: "id",
      updatedAt: "2026-05-15T00:00:00.000Z",
    };
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        headerRow: true,
        changeKinds: ["added", "updated", "removed"] as const,
        snapshotRowLimit: 1000,
        keyColumn: "id",
        snapshot,
        lastRowCount: 2,
      },
    };
    // Reorder rows + change a1's email. Positional mode would fire 2
    // updated events; keyColumn should fire 1.
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["id", "email"],
        ["b2", "bob@e.test"], // moved to position 2 (was at 3)
        ["a1", "alice-new@e.test"], // moved to position 3 (was at 2), changed
      ],
    });

    const result = await pull(trigger);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.payload).toMatchObject({
      changeKind: "updated",
      rowKey: "a1",
      keyColumn: "id",
      keyValue: "a1",
      rowValues: ["a1", "alice-new@e.test"],
    });
  });

  it("keyColumn mode: emits structured warning on duplicate keys but does not fail", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const rowHashes: Record<string, string> = {
      a: createHash("sha256").update(JSON.stringify(["a", 1])).digest("hex"),
    };
    const snapshot = {
      rowHashes,
      rowCount: 1,
      windowStart: 2,
      windowEnd: 2,
      keyMode: "keyColumn" as const,
      keyColumn: "id",
      updatedAt: "2026-05-15T00:00:00.000Z",
    };
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        headerRow: true,
        changeKinds: ["added", "updated", "removed"] as const,
        snapshotRowLimit: 1000,
        keyColumn: "id",
        snapshot,
        lastRowCount: 1,
      },
    };
    // Current snapshot will see 2 rows both with key="a" → duplicate.
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["id", "v"],
        ["a", 1],
        ["a", 2], // duplicate key
      ],
    });

    const result = await pull(trigger);

    expect(result.events).toBeDefined();
    // Warn was called with the duplicate-key payload.
    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls.flat().find(
      (a) => typeof a === "string" && a.includes("keycolumn_duplicate"),
    );
    expect(warnArgs).toBeDefined();
    warnSpy.mockRestore();
  });

  it("returns resyncRequired:true when snapshot field is missing", async () => {
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        changeKinds: ["added", "updated"] as const,
        snapshotRowLimit: 1000,
        keyColumn: null,
        // snapshot intentionally missing
        lastRowCount: 0,
      },
    };
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await pull(trigger);
    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    expect(mockValuesGet).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("persists the new snapshot AFTER successful diff (snapshot path requires updated/removed in changeKinds)", async () => {
    const trigger = extendedTrigger({
      rows: [["a"]],
      changeKinds: ["added", "updated"], // snapshot path active
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [["a"], ["b"]],
    });

    await pull(trigger);

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [triggerId, newConfig] = mockUpdateConfig.mock.calls[0]!;
    expect(triggerId).toBe("tr-1");
    const persisted = newConfig as {
      snapshot: { rowCount: number; rowHashes: Record<string, string> };
      lastRowCount: number;
    };
    expect(persisted.snapshot.rowCount).toBe(2);
    expect(Object.keys(persisted.snapshot.rowHashes).sort()).toEqual(["1", "2"]);
    expect(persisted.lastRowCount).toBe(2);
  });

  it("does NOT corrupt the prior snapshot when persistence fails", async () => {
    const trigger = extendedTrigger({
      rows: [["a"]],
      changeKinds: ["added", "updated"], // snapshot path active
    });
    mockValuesGet.mockResolvedValueOnce({
      values: [["a"], ["b"]],
    });
    mockUpdateConfig.mockRejectedValueOnce(new Error("DB write failed"));

    await expect(pull(trigger)).rejects.toThrow(/DB write failed/);
    // Caller sees the failure and retries; the trigger row's
    // existing snapshot is unchanged (updateConfig rejected). The
    // helper only attempts the update once.
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
  });

  it("legacy added-only path still uses legacy eventId format for backwards-compat", async () => {
    // Trigger with default changeKinds (no snapshot field at all).
    // Should hit the legacy count-delta fast path → legacy eventId.
    const trigger = {
      ...baseTrigger,
      config: {
        ...baseTrigger.config,
        // No changeKinds field — defaults to ["added"] in the
        // schema, but the pull function reads config.changeKinds
        // directly and the fast path triggers when "updated" /
        // "removed" are absent.
        lastRowCount: 1,
      },
    };
    mockValuesGet.mockResolvedValueOnce({ values: [["a"], ["b"]] });
    const result = await pull(trigger);
    expect(result.events).toHaveLength(1);
    // Legacy format: ss-1:Sheet1:2:<hash> (no changeKind infix)
    expect(result.events[0]!.eventId).toMatch(/^ss-1:Sheet1:2:[0-9a-f]{12}$/);
    expect(result.events[0]!.eventId).not.toContain(":added:");
  });
});
