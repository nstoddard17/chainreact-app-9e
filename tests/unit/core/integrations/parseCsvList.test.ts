/** @jest-environment node */
import { parseCsvList } from "@/core/integrations/parseCsvList";

describe("parseCsvList — shape-agnostic CSV-or-array splitter", () => {
  it("returns empty array for nullish input", () => {
    expect(parseCsvList(null)).toEqual([]);
    expect(parseCsvList(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseCsvList("")).toEqual([]);
    expect(parseCsvList("   ")).toEqual([]);
  });

  it("returns single-value passthrough", () => {
    expect(parseCsvList("Important")).toEqual(["Important"]);
  });

  it("splits CSV string into trimmed entries", () => {
    expect(parseCsvList("Important, Urgent, Follow-up")).toEqual([
      "Important",
      "Urgent",
      "Follow-up",
    ]);
  });

  it("drops empty entries from trailing commas / whitespace-only segments", () => {
    expect(parseCsvList("A,,B,   ,C,")).toEqual(["A", "B", "C"]);
  });

  it("accepts a string array as-is when entries are single values", () => {
    expect(parseCsvList(["A", "B", "C"])).toEqual(["A", "B", "C"]);
  });

  it("flattens a mixed array of singles and CSVs", () => {
    expect(parseCsvList(["A", "B, C", "  D  "])).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("preserves duplicates (no dedup)", () => {
    expect(parseCsvList("A,A,B")).toEqual(["A", "A", "B"]);
  });

  it("ignores non-string entries inside an array", () => {
    expect(
      parseCsvList(["A", 42 as unknown as string, "B", null as unknown as string]),
    ).toEqual(["A", "B"]);
  });
});
