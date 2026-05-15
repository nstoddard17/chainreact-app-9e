/**
 * @jest-environment node
 */
import { createHash } from "node:crypto";
import {
  buildBoundedSnapshot,
  hashRow,
  KeyColumnNotFoundError,
  KeyColumnRequiresHeaderError,
  SnapshotOverflowError,
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
