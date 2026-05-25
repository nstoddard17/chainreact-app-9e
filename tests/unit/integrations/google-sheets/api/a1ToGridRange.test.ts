/**
 * @jest-environment node
 *
 * Tests for the pure `a1ToGridRange` helper used by `format_range`.
 * Verifies the 0-indexed half-open GridRange shape for single-cell
 * and range inputs, multi-letter column resolution, and explicit
 * rejection of unsupported shapes (full-column / full-row / sheet
 * prefix / inverted / lowercase).
 */
import {
  a1ToGridRange,
  InvalidA1RangeError,
} from "@/integrations/google-sheets/api/a1ToGridRange";

describe("a1ToGridRange — accepted shapes", () => {
  it("converts a single A1 cell to a 1x1 GridRange (0-indexed, half-open)", () => {
    expect(a1ToGridRange("A1")).toEqual({
      startRowIndex: 0,
      endRowIndex: 1,
      startColumnIndex: 0,
      endColumnIndex: 1,
    });
  });

  it("handles a single cell mid-sheet", () => {
    expect(a1ToGridRange("C5")).toEqual({
      startRowIndex: 4,
      endRowIndex: 5,
      startColumnIndex: 2,
      endColumnIndex: 3,
    });
  });

  it("converts an A1:B5 range to half-open GridRange", () => {
    expect(a1ToGridRange("A1:B5")).toEqual({
      startRowIndex: 0,
      endRowIndex: 5,
      startColumnIndex: 0,
      endColumnIndex: 2,
    });
  });

  it("handles two-letter columns (AA10:AB12)", () => {
    expect(a1ToGridRange("AA10:AB12")).toEqual({
      startRowIndex: 9,
      endRowIndex: 12,
      startColumnIndex: 26,
      endColumnIndex: 28,
    });
  });

  it("handles a 1x1 explicit range A3:A3", () => {
    expect(a1ToGridRange("A3:A3")).toEqual({
      startRowIndex: 2,
      endRowIndex: 3,
      startColumnIndex: 0,
      endColumnIndex: 1,
    });
  });

  it("handles asymmetric ranges (one cell wide, many rows)", () => {
    expect(a1ToGridRange("B2:B100")).toEqual({
      startRowIndex: 1,
      endRowIndex: 100,
      startColumnIndex: 1,
      endColumnIndex: 2,
    });
  });

  it("Z column is index 25 (last single-letter column)", () => {
    expect(a1ToGridRange("Z1")).toEqual({
      startRowIndex: 0,
      endRowIndex: 1,
      startColumnIndex: 25,
      endColumnIndex: 26,
    });
  });

  it("AA column is index 26", () => {
    expect(a1ToGridRange("AA1")).toEqual({
      startRowIndex: 0,
      endRowIndex: 1,
      startColumnIndex: 26,
      endColumnIndex: 27,
    });
  });
});

describe("a1ToGridRange — rejected shapes", () => {
  it("rejects empty string", () => {
    expect(() => a1ToGridRange("")).toThrow(InvalidA1RangeError);
  });

  it("rejects full-column reference (A:A)", () => {
    expect(() => a1ToGridRange("A:A")).toThrow(InvalidA1RangeError);
  });

  it("rejects full-row reference (1:1)", () => {
    expect(() => a1ToGridRange("1:1")).toThrow(InvalidA1RangeError);
  });

  it("rejects sheet-prefixed range (Sheet1!A1)", () => {
    expect(() => a1ToGridRange("Sheet1!A1")).toThrow(
      /must not include a sheet-name prefix/,
    );
  });

  it("rejects lowercase column letters (a1)", () => {
    // Schema-layer regex blocks this too, but the helper independently
    // rejects to keep its contract self-sufficient.
    expect(() => a1ToGridRange("a1")).toThrow(InvalidA1RangeError);
  });

  it("rejects row 0 (Sheets is 1-indexed)", () => {
    expect(() => a1ToGridRange("A0")).toThrow(InvalidA1RangeError);
  });

  it("rejects bare digits (no column letters)", () => {
    expect(() => a1ToGridRange("1")).toThrow(InvalidA1RangeError);
  });

  it("rejects bare letters (no row digits)", () => {
    expect(() => a1ToGridRange("A")).toThrow(InvalidA1RangeError);
  });

  it("rejects garbage input", () => {
    expect(() => a1ToGridRange("not-a-range")).toThrow(InvalidA1RangeError);
  });

  it("rejects inverted column range (B1:A1)", () => {
    expect(() => a1ToGridRange("B1:A1")).toThrow(
      /start column must come before/,
    );
  });

  it("rejects inverted row range (A5:A1)", () => {
    expect(() => a1ToGridRange("A5:A1")).toThrow(
      /start row must come before/,
    );
  });

  it("InvalidA1RangeError carries the input in `.input`", () => {
    try {
      a1ToGridRange("bogus");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidA1RangeError);
      expect((err as InvalidA1RangeError).input).toBe("bogus");
    }
  });
});
