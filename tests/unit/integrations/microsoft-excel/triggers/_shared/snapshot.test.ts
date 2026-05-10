/**
 * @jest-environment node
 */
import {
  buildSnapshot,
  findNewKeys,
  hashRow,
} from "@/integrations/microsoft-excel/triggers/_shared/snapshot";

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

  it("findNewKeys returns only entries whose key is new", () => {
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

  it("findNewKeys ignores hash changes on existing keys (Slice 15: new-only)", () => {
    // Slice 15 doesn't ship `updated_row` / `updated_table_row`. Hash
    // change on a same-key entry is intentionally NOT a "new row".
    const previous = buildSnapshot([{ key: "1", values: ["alice"] }]);
    const current = [{ key: "1", values: ["alice-renamed"] }];
    expect(findNewKeys(previous, current)).toEqual([]);
  });

  it("findNewKeys returns [] when nothing changed", () => {
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
