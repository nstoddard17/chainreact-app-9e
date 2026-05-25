/**
 * @jest-environment node
 *
 * Tests for the Excel `add_row` config schema (Microsoft Excel parity
 * Commit 3 — batch-mode fold). Pins:
 *   - existing single-row `values: unknown[]` shape still valid
 *   - new batch `rows: Array<Record<string, unknown>>` shape valid
 *   - mutual exclusion (XOR) — both rejected; neither rejected
 *   - row-array bounds (1..1000)
 *   - empty row object rejected
 *   - unknown fields rejected (strict)
 */
import { AddRowConfigSchema } from "@/integrations/microsoft-excel/actions/addRow.schema";

describe("AddRowConfigSchema — single-row shape (backwards-compatible)", () => {
  it("accepts the slice-15 default config (workbookId + worksheetName + values)", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["alice", 30, "Seattle"],
      }).success,
    ).toBe(true);
  });

  it("accepts mixed cell-value types in single-row values", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["alice", 30, true, null],
      }).success,
    ).toBe(true);
  });

  it("rejects empty values array (existing slice-15 contract)", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: [],
      }).success,
    ).toBe(false);
  });
});

describe("AddRowConfigSchema — batch shape", () => {
  it("accepts a minimal batch config (rows length 1)", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows: [{ Name: "alice", Age: 30 }],
      }).success,
    ).toBe(true);
  });

  it("accepts a batch of 1000 rows (boundary)", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      Name: `row${i}`,
    }));
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows,
      }).success,
    ).toBe(true);
  });

  it("accepts mixed cell-value types per row entry", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows: [
          { Name: "alice", Age: 30, Active: true, Notes: null },
          { Name: "bob", Age: 25, Active: false, Notes: "hi" },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects an empty rows array", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a batch of 1001 rows (over the 1000 cap — no silent chunking)", () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      Name: `row${i}`,
    }));
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows,
      }).success,
    ).toBe(false);
  });

  it("rejects an empty row object inside rows array", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows: [{ Name: "alice" }, {}],
      }).success,
    ).toBe(false);
  });

  it("rejects when a row entry has an empty-string key", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows: [{ "": "alice" }],
      }).success,
    ).toBe(false);
  });
});

describe("AddRowConfigSchema — mutual exclusion (values XOR rows)", () => {
  it("rejects when BOTH values and rows are provided", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["alice"],
        rows: [{ Name: "alice" }],
      }).success,
    ).toBe(false);
  });

  it("rejects when NEITHER values nor rows is provided", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }).success,
    ).toBe(false);
  });
});

describe("AddRowConfigSchema — required base fields", () => {
  it("rejects when workbookId is missing", () => {
    expect(
      AddRowConfigSchema.safeParse({
        worksheetName: "Sheet1",
        values: ["alice"],
      }).success,
    ).toBe(false);
  });

  it("rejects when workbookId is empty string", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "",
        worksheetName: "Sheet1",
        values: ["alice"],
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is missing", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        values: ["alice"],
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is empty string", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "",
        values: ["alice"],
      }).success,
    ).toBe(false);
  });
});

describe("AddRowConfigSchema — strict mode (V1 field rejection)", () => {
  it("rejects unknown fields generally", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["alice"],
        xCustom: "v",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `hasHeaders` flag", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows: [{ Name: "alice" }],
        hasHeaders: "yes",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `inputMode` discriminator", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows: [{ Name: "alice" }],
        inputMode: "json",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 flat `row1..row10` fields", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        row1: "alice",
        row2: "bob",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `columnMapping` field", () => {
    expect(
      AddRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows: [{ Name: "alice" }],
        columnMapping: { Name: "A" },
      }).success,
    ).toBe(false);
  });
});
