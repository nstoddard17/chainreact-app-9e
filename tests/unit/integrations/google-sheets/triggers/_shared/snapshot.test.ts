/**
 * @jest-environment node
 */
import { createHash } from "node:crypto";
import {
  buildBoundedSnapshot,
  findAdded,
  findRemoved,
  findUpdated,
  hashRow,
  KeyColumnNotFoundError,
  KeyColumnRequiresHeaderError,
  SnapshotOverflowError,
  type BoundedSnapshot,
  type RowKeyed,
} from "@/integrations/google-sheets/triggers/_shared/snapshot";

const ts = new Date("2026-05-15T12:00:00.000Z");
const fixedNow = () => ts;

describe("hashRow", () => {
  it("is deterministic for the same input", () => {
    expect(hashRow(["a", 1, true])).toBe(hashRow(["a", 1, true]));
  });

  it("matches sha256(JSON.stringify(values))", () => {
    const expected = createHash("sha256")
      .update(JSON.stringify(["x", 42]))
      .digest("hex");
    expect(hashRow(["x", 42])).toBe(expected);
  });

  it("distinguishes value changes", () => {
    expect(hashRow(["a", 1])).not.toBe(hashRow(["a", 2]));
  });

  it("distinguishes null from empty string from 0", () => {
    expect(hashRow([null])).not.toBe(hashRow([""]));
    expect(hashRow([null])).not.toBe(hashRow([0]));
    expect(hashRow([""])).not.toBe(hashRow([0]));
  });

  it("distinguishes column-order changes", () => {
    expect(hashRow(["a", "b"])).not.toBe(hashRow(["b", "a"]));
  });
});

describe("buildBoundedSnapshot — positional mode", () => {
  it("hashes every row in a small sheet (no header)", () => {
    const result = buildBoundedSnapshot({
      rows: [
        ["alice", 30],
        ["bob", 25],
        ["carol", 40],
      ],
      headerRow: false,
      snapshotRowLimit: 1000,
      keyColumn: null,
      now: fixedNow,
    });
    expect(result.snapshot.keyMode).toBe("positional");
    expect(result.snapshot.keyColumn).toBeNull();
    expect(result.snapshot.rowCount).toBe(3);
    expect(result.snapshot.windowStart).toBe(1);
    expect(result.snapshot.windowEnd).toBe(3);
    expect(Object.keys(result.snapshot.rowHashes).sort()).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(result.snapshot.rowHashes["1"]).toBe(hashRow(["alice", 30]));
    expect(result.snapshot.rowHashes["2"]).toBe(hashRow(["bob", 25]));
    expect(result.snapshot.rowHashes["3"]).toBe(hashRow(["carol", 40]));
    expect(result.duplicateKeyCount).toBe(0);
    expect(result.emptyKeyCount).toBe(0);
  });

  it("excludes the header row when headerRow=true and offsets keys", () => {
    const result = buildBoundedSnapshot({
      rows: [
        ["Name", "Age"],
        ["alice", 30],
        ["bob", 25],
      ],
      headerRow: true,
      snapshotRowLimit: 1000,
      keyColumn: null,
      now: fixedNow,
    });
    // Data rows count is 2 (excluding header).
    expect(result.snapshot.rowCount).toBe(2);
    // Sheet row numbers are 1-indexed AND include the header — first
    // data row is sheet row 2.
    expect(result.snapshot.windowStart).toBe(2);
    expect(result.snapshot.windowEnd).toBe(3);
    expect(Object.keys(result.snapshot.rowHashes).sort()).toEqual(["2", "3"]);
    expect(result.snapshot.rowHashes["2"]).toBe(hashRow(["alice", 30]));
    expect(result.snapshot.rowHashes["3"]).toBe(hashRow(["bob", 25]));
  });

  it("handles an empty sheet (no rows)", () => {
    const result = buildBoundedSnapshot({
      rows: [],
      headerRow: false,
      snapshotRowLimit: 1000,
      keyColumn: null,
      now: fixedNow,
    });
    expect(result.snapshot.rowCount).toBe(0);
    expect(result.snapshot.windowEnd).toBe(0);
    expect(result.snapshot.windowStart).toBe(1);
    expect(result.snapshot.rowHashes).toEqual({});
  });

  it("handles a header-only sheet (no data rows)", () => {
    const result = buildBoundedSnapshot({
      rows: [["Name", "Age"]],
      headerRow: true,
      snapshotRowLimit: 1000,
      keyColumn: null,
      now: fixedNow,
    });
    expect(result.snapshot.rowCount).toBe(0);
    expect(result.snapshot.windowEnd).toBe(0);
    // First data row would be sheet row 2 — windowStart points there.
    expect(result.snapshot.windowStart).toBe(2);
    expect(result.snapshot.rowHashes).toEqual({});
  });

  it("windows to last N rows when total > snapshotRowLimit (within 2x overflow guard)", () => {
    // 150 data rows, cap 100 → 150 > 100 (window trim) but 150 ≤ 200
    // (no overflow). Window covers rows 51..150 (sheet row numbers
    // without header offset).
    const rows: ReadonlyArray<ReadonlyArray<unknown>> = Array.from(
      { length: 150 },
      (_, i) => [`v${i + 1}`],
    );
    const result = buildBoundedSnapshot({
      rows,
      headerRow: false,
      snapshotRowLimit: 100,
      keyColumn: null,
      now: fixedNow,
    });
    expect(result.snapshot.rowCount).toBe(150);
    expect(result.snapshot.windowStart).toBe(51);
    expect(result.snapshot.windowEnd).toBe(150);
    expect(Object.keys(result.snapshot.rowHashes)).toHaveLength(100);
    // First windowed row is sheet row 51 → value v51.
    expect(result.snapshot.rowHashes["51"]).toBe(hashRow(["v51"]));
    // Last windowed row is sheet row 150 → value v150.
    expect(result.snapshot.rowHashes["150"]).toBe(hashRow(["v150"]));
    // Sheet row 50 (just before the window) is absent.
    expect(result.snapshot.rowHashes["50"]).toBeUndefined();
  });

  it("windows correctly with header offset when total > snapshotRowLimit", () => {
    // 1 header + 150 data rows, cap 100 → window covers data rows
    // 51..150, sheet rows 52..151. 150 ≤ 200 so no overflow.
    const rows: ReadonlyArray<ReadonlyArray<unknown>> = [
      ["Name"],
      ...Array.from({ length: 150 }, (_, i) => [`v${i + 1}`]),
    ];
    const result = buildBoundedSnapshot({
      rows,
      headerRow: true,
      snapshotRowLimit: 100,
      keyColumn: null,
      now: fixedNow,
    });
    expect(result.snapshot.rowCount).toBe(150);
    expect(result.snapshot.windowStart).toBe(52);
    expect(result.snapshot.windowEnd).toBe(151);
    expect(Object.keys(result.snapshot.rowHashes)).toHaveLength(100);
    expect(result.snapshot.rowHashes["52"]).toBe(hashRow(["v51"]));
  });

  it("records updatedAt from the supplied now() function", () => {
    const result = buildBoundedSnapshot({
      rows: [["a"]],
      headerRow: false,
      snapshotRowLimit: 100,
      keyColumn: null,
      now: fixedNow,
    });
    expect(result.snapshot.updatedAt).toBe(ts.toISOString());
  });

  it("uses Date.now() when no now() override is supplied", () => {
    const before = Date.now();
    const result = buildBoundedSnapshot({
      rows: [["a"]],
      headerRow: false,
      snapshotRowLimit: 100,
      keyColumn: null,
    });
    const after = Date.now();
    const ms = new Date(result.snapshot.updatedAt).getTime();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });
});

describe("buildBoundedSnapshot — keyColumn mode", () => {
  it("keys hashes by the named column's value", () => {
    const result = buildBoundedSnapshot({
      rows: [
        ["id", "Name", "Status"],
        ["a1", "alice", "open"],
        ["b2", "bob", "closed"],
        ["c3", "carol", "open"],
      ],
      headerRow: true,
      snapshotRowLimit: 1000,
      keyColumn: "id",
      now: fixedNow,
    });
    expect(result.snapshot.keyMode).toBe("keyColumn");
    expect(result.snapshot.keyColumn).toBe("id");
    expect(Object.keys(result.snapshot.rowHashes).sort()).toEqual([
      "a1",
      "b2",
      "c3",
    ]);
    expect(result.snapshot.rowHashes["a1"]).toBe(
      hashRow(["a1", "alice", "open"]),
    );
  });

  it("excludes rows with empty keyColumn cells (null/empty/undefined)", () => {
    const result = buildBoundedSnapshot({
      rows: [
        ["id", "name"],
        ["a1", "alice"],
        [null, "noid-null"],
        ["", "noid-empty"],
        ["b2", "bob"],
      ],
      headerRow: true,
      snapshotRowLimit: 1000,
      keyColumn: "id",
      now: fixedNow,
    });
    expect(Object.keys(result.snapshot.rowHashes).sort()).toEqual(["a1", "b2"]);
    expect(result.emptyKeyCount).toBe(2);
  });

  it("last-write-wins on duplicate keyColumn values + reports duplicate count", () => {
    const result = buildBoundedSnapshot({
      rows: [
        ["id", "name"],
        ["dup", "first"],
        ["dup", "second"],
        ["dup", "third"],
      ],
      headerRow: true,
      snapshotRowLimit: 1000,
      keyColumn: "id",
      now: fixedNow,
    });
    expect(Object.keys(result.snapshot.rowHashes)).toEqual(["dup"]);
    // last-write-wins: the hash is "third"'s
    expect(result.snapshot.rowHashes["dup"]).toBe(hashRow(["dup", "third"]));
    expect(result.duplicateKeyCount).toBe(2);
  });

  it("coerces numeric keyColumn values to strings", () => {
    const result = buildBoundedSnapshot({
      rows: [
        ["id", "name"],
        [1, "alice"],
        [2, "bob"],
      ],
      headerRow: true,
      snapshotRowLimit: 1000,
      keyColumn: "id",
      now: fixedNow,
    });
    expect(Object.keys(result.snapshot.rowHashes).sort()).toEqual(["1", "2"]);
  });

  it("throws KeyColumnNotFoundError when the column isn't in the header", () => {
    expect(() =>
      buildBoundedSnapshot({
        rows: [
          ["name", "age"],
          ["alice", 30],
        ],
        headerRow: true,
        snapshotRowLimit: 1000,
        keyColumn: "id",
      }),
    ).toThrow(KeyColumnNotFoundError);
  });

  it("throws KeyColumnRequiresHeaderError when the sheet has no rows", () => {
    expect(() =>
      buildBoundedSnapshot({
        rows: [],
        headerRow: true,
        snapshotRowLimit: 1000,
        keyColumn: "id",
      }),
    ).toThrow(KeyColumnRequiresHeaderError);
  });

  it("windows keyColumn snapshots to last N data rows when over cap", () => {
    // 150 data rows, cap 100 → window trim but no overflow (150 ≤ 200).
    const rows: ReadonlyArray<ReadonlyArray<unknown>> = [
      ["id", "v"],
      ...Array.from({ length: 150 }, (_, i) => [`k${i + 1}`, i]),
    ];
    const result = buildBoundedSnapshot({
      rows,
      headerRow: true,
      snapshotRowLimit: 100,
      keyColumn: "id",
      now: fixedNow,
    });
    expect(result.snapshot.rowCount).toBe(150);
    expect(Object.keys(result.snapshot.rowHashes)).toHaveLength(100);
    // Last 100 data rows = k51..k150.
    expect(result.snapshot.rowHashes["k51"]).toBeDefined();
    expect(result.snapshot.rowHashes["k150"]).toBeDefined();
    expect(result.snapshot.rowHashes["k50"]).toBeUndefined();
  });
});

describe("buildBoundedSnapshot — overflow", () => {
  it("throws SnapshotOverflowError when total > snapshotRowLimit * 2", () => {
    const rows: ReadonlyArray<ReadonlyArray<unknown>> = Array.from(
      { length: 2001 },
      (_, i) => [i],
    );
    expect(() =>
      buildBoundedSnapshot({
        rows,
        headerRow: false,
        snapshotRowLimit: 1000,
        keyColumn: null,
      }),
    ).toThrow(SnapshotOverflowError);
  });

  it("accepts total === snapshotRowLimit * 2 (boundary, no overflow)", () => {
    const rows: ReadonlyArray<ReadonlyArray<unknown>> = Array.from(
      { length: 200 },
      (_, i) => [i],
    );
    const result = buildBoundedSnapshot({
      rows,
      headerRow: false,
      snapshotRowLimit: 100,
      keyColumn: null,
    });
    expect(result.snapshot.rowCount).toBe(200);
    expect(Object.keys(result.snapshot.rowHashes)).toHaveLength(100);
  });

  it("does NOT silently truncate — overflow throws even when no keyColumn is set", () => {
    expect(() =>
      buildBoundedSnapshot({
        rows: Array.from({ length: 100_000 }, (_, i) => [i]),
        headerRow: false,
        snapshotRowLimit: 100,
        keyColumn: null,
      }),
    ).toThrow(SnapshotOverflowError);
  });

  it("does NOT auto-raise the cap — error includes the configured cap, not the sheet size", () => {
    try {
      buildBoundedSnapshot({
        rows: Array.from({ length: 5000 }, (_, i) => [i]),
        headerRow: false,
        snapshotRowLimit: 1000,
        keyColumn: null,
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SnapshotOverflowError);
      expect((err as SnapshotOverflowError).snapshotRowLimit).toBe(1000);
      expect((err as SnapshotOverflowError).totalRows).toBe(5000);
    }
  });

  it("overflow check uses DATA rows, not raw rows — header is excluded", () => {
    // 1 header + 201 data rows, cap 100. Data count = 201 > 200 → overflow.
    const rows: ReadonlyArray<ReadonlyArray<unknown>> = [
      ["h"],
      ...Array.from({ length: 201 }, (_, i) => [i]),
    ];
    expect(() =>
      buildBoundedSnapshot({
        rows,
        headerRow: true,
        snapshotRowLimit: 100,
        keyColumn: null,
      }),
    ).toThrow(SnapshotOverflowError);
  });
});

describe("buildBoundedSnapshot — snapshot shape includes window-slide metadata", () => {
  it("records keyMode='positional' + keyColumn=null in positional mode", () => {
    const result = buildBoundedSnapshot({
      rows: [["a"]],
      headerRow: false,
      snapshotRowLimit: 100,
      keyColumn: null,
    });
    expect(result.snapshot.keyMode).toBe("positional");
    expect(result.snapshot.keyColumn).toBeNull();
  });

  it("records keyMode='keyColumn' + keyColumn=<name> in keyColumn mode", () => {
    const result = buildBoundedSnapshot({
      rows: [
        ["id"],
        ["x"],
      ],
      headerRow: true,
      snapshotRowLimit: 100,
      keyColumn: "id",
    });
    expect(result.snapshot.keyMode).toBe("keyColumn");
    expect(result.snapshot.keyColumn).toBe("id");
  });

  it("provides windowStart and windowEnd so downstream diff can detect window slides", () => {
    // 150 data rows, cap 100 → window 51..150 (no header, no overflow).
    const rows: ReadonlyArray<ReadonlyArray<unknown>> = Array.from(
      { length: 150 },
      (_, i) => [i],
    );
    const result = buildBoundedSnapshot({
      rows,
      headerRow: false,
      snapshotRowLimit: 100,
      keyColumn: null,
    });
    expect(result.snapshot.windowStart).toBe(51);
    expect(result.snapshot.windowEnd).toBe(150);
  });
});

// ──────────────────────────────────────────────────────────────────
// Diff helpers (Sheets 2.3 Commit 3).
// ──────────────────────────────────────────────────────────────────

// Tiny helper: build a snapshot pair from two row-sets in positional
// mode for clean diff tests.
function positionalSnapshots(
  prevRows: ReadonlyArray<ReadonlyArray<unknown>>,
  currRows: ReadonlyArray<ReadonlyArray<unknown>>,
  opts: { headerRow?: boolean; snapshotRowLimit?: number } = {},
): {
  previous: BoundedSnapshot;
  current: BoundedSnapshot;
  currentEntries: RowKeyed[];
} {
  const headerRow = opts.headerRow ?? false;
  const snapshotRowLimit = opts.snapshotRowLimit ?? 1000;
  const previousBuilt = buildBoundedSnapshot({
    rows: prevRows,
    headerRow,
    snapshotRowLimit,
    keyColumn: null,
    now: fixedNow,
  });
  const currentBuilt = buildBoundedSnapshot({
    rows: currRows,
    headerRow,
    snapshotRowLimit,
    keyColumn: null,
    now: fixedNow,
  });
  return {
    previous: previousBuilt.snapshot,
    current: currentBuilt.snapshot,
    currentEntries: currentBuilt.entries,
  };
}

// Same for keyColumn mode.
function keyColumnSnapshots(
  prevRows: ReadonlyArray<ReadonlyArray<unknown>>,
  currRows: ReadonlyArray<ReadonlyArray<unknown>>,
  keyColumn: string,
  opts: { snapshotRowLimit?: number } = {},
): {
  previous: BoundedSnapshot;
  current: BoundedSnapshot;
  currentEntries: RowKeyed[];
} {
  const snapshotRowLimit = opts.snapshotRowLimit ?? 1000;
  const previousBuilt = buildBoundedSnapshot({
    rows: prevRows,
    headerRow: true,
    snapshotRowLimit,
    keyColumn,
    now: fixedNow,
  });
  const currentBuilt = buildBoundedSnapshot({
    rows: currRows,
    headerRow: true,
    snapshotRowLimit,
    keyColumn,
    now: fixedNow,
  });
  return {
    previous: previousBuilt.snapshot,
    current: currentBuilt.snapshot,
    currentEntries: currentBuilt.entries,
  };
}

describe("findAdded — positional mode", () => {
  it("returns keys present in current but absent from previous", () => {
    const { previous, current, currentEntries } = positionalSnapshots(
      [["a"], ["b"]],
      [["a"], ["b"], ["c"], ["d"]],
    );
    const added = findAdded(previous, current, currentEntries);
    expect(added.map((e) => e.key).sort()).toEqual(["3", "4"]);
    // Entries carry rowIndex + rowValues for payload construction.
    const c = added.find((e) => e.key === "3")!;
    expect(c.rowIndex).toBe(3);
    expect(c.rowValues).toEqual(["c"]);
    expect(c.hash).toBe(hashRow(["c"]));
  });

  it("returns [] when no keys are new", () => {
    const { previous, current, currentEntries } = positionalSnapshots(
      [["a"], ["b"]],
      [["a"], ["b"]],
    );
    expect(findAdded(previous, current, currentEntries)).toEqual([]);
  });

  it("ignores hash changes on existing keys (those are updates, not added)", () => {
    const { previous, current, currentEntries } = positionalSnapshots(
      [["a"], ["b"]],
      [["a-changed"], ["b"]],
    );
    expect(findAdded(previous, current, currentEntries)).toEqual([]);
  });
});

describe("findUpdated — positional mode", () => {
  it("returns keys with differing hashes", () => {
    const { previous, current, currentEntries } = positionalSnapshots(
      [
        ["alice", 30],
        ["bob", 25],
      ],
      [
        ["alice", 31], // age updated
        ["bob", 25],
      ],
    );
    const updated = findUpdated(previous, current, currentEntries);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.key).toBe("1");
    expect(updated[0]!.rowIndex).toBe(1);
    expect(updated[0]!.rowValues).toEqual(["alice", 31]);
    expect(updated[0]!.hash).toBe(hashRow(["alice", 31]));
  });

  it("returns [] when nothing changed", () => {
    const { previous, current, currentEntries } = positionalSnapshots(
      [["a"], ["b"]],
      [["a"], ["b"]],
    );
    expect(findUpdated(previous, current, currentEntries)).toEqual([]);
  });

  it("ignores new keys (those are added, not updated)", () => {
    const { previous, current, currentEntries } = positionalSnapshots(
      [["a"]],
      [["a"], ["b"]],
    );
    expect(findUpdated(previous, current, currentEntries)).toEqual([]);
  });

  it("flags every shifted row when a mid-sheet row is deleted (positional noise — accepted limitation)", () => {
    // Pre: rows 1=A, 2=B, 3=C. Delete row 2 → now rows 1=A, 2=C.
    // Position-keyed diff: key "2" was B, is now C → updated.
    // Key "3" was C, is now absent → removed (genuine).
    const { previous, current, currentEntries } = positionalSnapshots(
      [["A"], ["B"], ["C"]],
      [["A"], ["C"]],
    );
    const updated = findUpdated(previous, current, currentEntries);
    expect(updated.map((e) => e.key)).toEqual(["2"]);
    expect(updated[0]!.rowValues).toEqual(["C"]);
  });
});

describe("findRemoved — positional mode", () => {
  it("returns keys in previous but absent from current (within sheet bounds)", () => {
    const { previous, current } = positionalSnapshots(
      [["a"], ["b"], ["c"]],
      [["a"]],
    );
    const removed = findRemoved(previous, current);
    expect(removed.map((e) => e.key).sort()).toEqual(["2", "3"]);
    // Removed entries carry the PREVIOUS hash (for stable eventId)
    // and explicitly null rowIndex + rowValues (D-PreviousValues).
    const k2 = removed.find((e) => e.key === "2")!;
    expect(k2.hash).toBe(hashRow(["b"]));
    expect(k2.rowIndex).toBeNull();
    expect(k2.rowValues).toBeNull();
  });

  it("returns [] when nothing was removed", () => {
    const { previous, current } = positionalSnapshots([["a"]], [["a"], ["b"]]);
    expect(findRemoved(previous, current)).toEqual([]);
  });

  it("fires removed when the sheet was cleared entirely", () => {
    const { previous, current } = positionalSnapshots([["a"], ["b"]], []);
    const removed = findRemoved(previous, current);
    expect(removed.map((e) => e.key).sort()).toEqual(["1", "2"]);
  });

  describe("window-slide distinction (D-RemovedWindowSlide)", () => {
    it("DOES NOT fire removed for rows that slid out of the front of the window (sheet grew past cap)", () => {
      // Previous: 50 data rows, cap=50 → window=1..50.
      // Current: 100 data rows, cap=50 → window=51..100 (no overflow, 100 = 2x cap exactly).
      // Previous keys 1..50 are absent from current. None should
      // fire removed — they're slide artifacts.
      const prevRows = Array.from({ length: 50 }, (_, i) => [`v${i + 1}`]);
      const currRows = Array.from({ length: 100 }, (_, i) => [`v${i + 1}`]);
      const { previous, current } = positionalSnapshots(prevRows, currRows, {
        snapshotRowLimit: 50,
      });
      expect(previous.windowStart).toBe(1);
      expect(previous.windowEnd).toBe(50);
      expect(current.windowStart).toBe(51);
      expect(current.windowEnd).toBe(100);
      expect(findRemoved(previous, current)).toEqual([]);
    });

    it("DOES fire removed for rows past the new sheet's end (genuine deletion at the tail)", () => {
      // Previous: 60 data rows, cap=50 → window=11..60.
      // Current: 40 data rows, cap=50 → window=1..40.
      // Previous keys 41..60 are absent. Of those, 41..50 are within
      // [windowStart=1, windowEnd=40]? No, 41..50 > windowEnd=40 →
      // genuine removal. 51..60 also > windowEnd=40 → genuine removal.
      const prevRows = Array.from({ length: 60 }, (_, i) => [`v${i + 1}`]);
      const currRows = Array.from({ length: 40 }, (_, i) => [`v${i + 1}`]);
      const { previous, current } = positionalSnapshots(prevRows, currRows, {
        snapshotRowLimit: 50,
      });
      const removed = findRemoved(previous, current);
      // Previous keys 11..60 (50 keys). Current keys 1..40.
      // Missing from current: 11..40 (which are in current AND not?
      // Wait — current snapshot has keys "1".."40" (positional from
      // current.windowStart=1). prev has "11".."60". Intersection at
      // keys "11".."40" present in both. Missing from current: "41"..
      // "60" AND "1".."10" (which aren't in prev so don't matter).
      // So removed: "41".."60" = 20 keys, all genuine.
      expect(removed.map((e) => e.key).sort()).toEqual(
        Array.from({ length: 20 }, (_, i) => String(41 + i)).sort(),
      );
    });

    it("DOES fire removed for empty sheet (sheet cleared past windowEnd=0)", () => {
      // Previous: 5 data rows, cap=50 → window=1..5.
      // Current: 0 data rows → windowEnd=0.
      // All previous keys are genuine removals.
      const { previous, current } = positionalSnapshots(
        [["a"], ["b"], ["c"], ["d"], ["e"]],
        [],
      );
      expect(current.windowEnd).toBe(0);
      const removed = findRemoved(previous, current);
      expect(removed.map((e) => e.key).sort()).toEqual([
        "1",
        "2",
        "3",
        "4",
        "5",
      ]);
    });

    it("returns the previous hash so removed events have stable dedup keys", () => {
      const { previous, current } = positionalSnapshots([["a"], ["b"]], []);
      const removed = findRemoved(previous, current);
      const k1 = removed.find((e) => e.key === "1")!;
      const k2 = removed.find((e) => e.key === "2")!;
      expect(k1.hash).toBe(hashRow(["a"]));
      expect(k2.hash).toBe(hashRow(["b"]));
    });
  });
});

describe("findAdded — keyColumn mode", () => {
  it("returns keys present in current but absent from previous", () => {
    const { previous, current, currentEntries } = keyColumnSnapshots(
      [
        ["id", "name"],
        ["a1", "alice"],
        ["b2", "bob"],
      ],
      [
        ["id", "name"],
        ["a1", "alice"],
        ["b2", "bob"],
        ["c3", "carol"],
      ],
      "id",
    );
    const added = findAdded(previous, current, currentEntries);
    expect(added).toHaveLength(1);
    expect(added[0]!.key).toBe("c3");
    expect(added[0]!.rowIndex).toBe(4); // sheet row 4 (1-indexed, header at 1)
    expect(added[0]!.rowValues).toEqual(["c3", "carol"]);
  });
});

describe("findUpdated — keyColumn mode", () => {
  it("detects updates by key value, NOT by row position", () => {
    // Pre: a1@row2, b2@row3. Post: b2@row2 (was moved), a1@row3,
    // and a1's email changed. Position-keyed mode would see both row
    // 2 and row 3 as "updated" (positional shift noise). keyColumn
    // mode picks up only a1's actual content change.
    const { previous, current, currentEntries } = keyColumnSnapshots(
      [
        ["id", "email"],
        ["a1", "alice@e.test"],
        ["b2", "bob@e.test"],
      ],
      [
        ["id", "email"],
        ["b2", "bob@e.test"], // moved up
        ["a1", "alice-new@e.test"], // changed
      ],
      "id",
    );
    const updated = findUpdated(previous, current, currentEntries);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.key).toBe("a1");
    expect(updated[0]!.rowValues).toEqual(["a1", "alice-new@e.test"]);
  });

  it("SUPPRESSES positional shift noise (the entire point of keyColumn mode)", () => {
    // Pre: 3 rows. Delete row 2 → 2 rows. In positional mode this
    // would flag old row 3 as "updated" (its key "3" is now gone,
    // and key "2" has different hash). In keyColumn mode, each row's
    // key is stable.
    const { previous, current, currentEntries } = keyColumnSnapshots(
      [
        ["id", "v"],
        ["a", 1],
        ["b", 2],
        ["c", 3],
      ],
      [
        ["id", "v"],
        ["a", 1],
        ["c", 3],
      ],
      "id",
    );
    const updated = findUpdated(previous, current, currentEntries);
    expect(updated).toEqual([]);
  });
});

describe("findRemoved — keyColumn mode", () => {
  it("detects removal by missing key value", () => {
    const { previous, current } = keyColumnSnapshots(
      [
        ["id", "v"],
        ["a", 1],
        ["b", 2],
      ],
      [
        ["id", "v"],
        ["a", 1],
      ],
      "id",
    );
    const removed = findRemoved(previous, current);
    expect(removed).toHaveLength(1);
    expect(removed[0]!.key).toBe("b");
    expect(removed[0]!.hash).toBe(hashRow(["b", 2]));
    expect(removed[0]!.rowIndex).toBeNull();
    expect(removed[0]!.rowValues).toBeNull();
  });

  it("ignores window-slide checks in keyColumn mode (no slide concept by key)", () => {
    // Sheet grew way past the cap. Previous keys "a".."e" all
    // absent from current ("f".."o" in current). All previous keys
    // are genuine removals — keyColumn mode has no slide artifact.
    const prevRows = [
      ["id", "v"],
      ...Array.from({ length: 5 }, (_, i) => [`k${i + 1}`, i]),
    ];
    const currRows = [
      ["id", "v"],
      ...Array.from({ length: 5 }, (_, i) => [`k${i + 6}`, i]),
    ];
    const { previous, current } = keyColumnSnapshots(prevRows, currRows, "id", {
      snapshotRowLimit: 5,
    });
    const removed = findRemoved(previous, current);
    expect(removed.map((e) => e.key).sort()).toEqual([
      "k1",
      "k2",
      "k3",
      "k4",
      "k5",
    ]);
  });

  it("detects key-value change as removal+addition (workflow author asked to track by key)", () => {
    // Same row, but its keyColumn value changed. The OLD key is
    // "removed", the NEW key is "added". This is the documented
    // behavior of keyColumn mode.
    const { previous, current, currentEntries } = keyColumnSnapshots(
      [
        ["id", "v"],
        ["old-key", 1],
      ],
      [
        ["id", "v"],
        ["new-key", 1],
      ],
      "id",
    );
    const added = findAdded(previous, current, currentEntries);
    const removed = findRemoved(previous, current);
    expect(added.map((e) => e.key)).toEqual(["new-key"]);
    expect(removed.map((e) => e.key)).toEqual(["old-key"]);
  });
});

describe("Empty-key + duplicate-key behavior", () => {
  it("empty-key rows in current snapshot do not generate added events", () => {
    const { previous, current, currentEntries } = keyColumnSnapshots(
      [
        ["id", "v"],
        ["a", 1],
      ],
      [
        ["id", "v"],
        ["a", 1],
        ["", 2], // empty key — excluded from snapshot
        [null, 3], // empty key — excluded from snapshot
      ],
      "id",
    );
    expect(findAdded(previous, current, currentEntries)).toEqual([]);
  });

  it("duplicate keys in current snapshot collapse to last-write-wins (per snapshot helper)", () => {
    // Previous: a=v1. Current: a=v1 then a=v2 (duplicate). Snapshot
    // keeps a=v2 (last write). a's hash differs from prev a's hash →
    // updated event for a, with the LAST values.
    const { previous, current, currentEntries } = keyColumnSnapshots(
      [
        ["id", "v"],
        ["a", "v1"],
      ],
      [
        ["id", "v"],
        ["a", "v1"], // matches prev
        ["a", "v2"], // duplicate key — last-write-wins → snapshot keeps v2
      ],
      "id",
    );
    const updated = findUpdated(previous, current, currentEntries);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.key).toBe("a");
    expect(updated[0]!.rowValues).toEqual(["a", "v2"]);
  });
});

describe("entries from buildBoundedSnapshot", () => {
  it("paired with the snapshot to drive payload construction", () => {
    const result = buildBoundedSnapshot({
      rows: [["a"], ["b"], ["c"]],
      headerRow: false,
      snapshotRowLimit: 1000,
      keyColumn: null,
      now: fixedNow,
    });
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]).toEqual({
      key: "1",
      rowIndex: 1,
      rowValues: ["a"],
    });
    expect(result.entries[2]).toEqual({
      key: "3",
      rowIndex: 3,
      rowValues: ["c"],
    });
  });

  it("excludes empty-key rows from entries (keyColumn mode)", () => {
    const result = buildBoundedSnapshot({
      rows: [
        ["id", "v"],
        ["a", 1],
        ["", "empty"],
        ["b", 2],
      ],
      headerRow: true,
      snapshotRowLimit: 1000,
      keyColumn: "id",
      now: fixedNow,
    });
    expect(result.entries.map((e) => e.key).sort()).toEqual(["a", "b"]);
  });

  it("keeps only the LAST entry per duplicate key (last-write-wins)", () => {
    const result = buildBoundedSnapshot({
      rows: [
        ["id", "v"],
        ["dup", "first"],
        ["dup", "second"],
      ],
      headerRow: true,
      snapshotRowLimit: 1000,
      keyColumn: "id",
      now: fixedNow,
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.rowValues).toEqual(["dup", "second"]);
  });
});
