/**
 * @jest-environment node
 */
import {
  buildSnapshot,
  buildWorksheetListSnapshot,
  findChangedKeys,
  findNewKeys,
  findNewWorksheets,
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
