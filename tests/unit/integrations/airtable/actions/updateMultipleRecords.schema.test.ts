/**
 * @jest-environment node
 */
import { UpdateMultipleRecordsConfigSchema } from "@/integrations/airtable/actions/updateMultipleRecords.schema";

function record(recordId: string, value: string) {
  return {
    recordId,
    fields: { Name: { type: "singleLineText", value } },
  };
}

describe("UpdateMultipleRecordsConfigSchema", () => {
  it("accepts a minimal valid config with one record", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "Alice")],
      typecast: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts the max of 10 records", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      record(`rec${i}`, `r${i}`),
    );
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records,
      typecast: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty records array (min 1)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 records (fail loud — no Math.min cap)", () => {
    const records = Array.from({ length: 11 }, (_, i) =>
      record(`rec${i}`, `r${i}`),
    );
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records,
      typecast: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(" ");
      expect(message).toMatch(/10|cap/i);
    }
  });

  it("rejects missing baseId", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      tableIdOrName: "tbl",
      records: [record("rec1", "Alice")],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing tableIdOrName", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      records: [record("rec1", "Alice")],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty-string baseId / tableIdOrName", () => {
    expect(
      UpdateMultipleRecordsConfigSchema.safeParse({
        baseId: "",
        tableIdOrName: "tbl",
        records: [record("rec1", "x")],
        typecast: false,
      }).success,
    ).toBe(false);
    expect(
      UpdateMultipleRecordsConfigSchema.safeParse({
        baseId: "appBASE",
        tableIdOrName: "",
        records: [record("rec1", "x")],
        typecast: false,
      }).success,
    ).toBe(false);
  });

  it("rejects missing recordId on any record entry", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          fields: { Name: { type: "singleLineText", value: "Alice" } },
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty-string recordId on any record entry", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          recordId: "",
          fields: { Name: { type: "singleLineText", value: "Alice" } },
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing typecast (Q11 — no silent default)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "Alice")],
      // typecast omitted intentionally
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid field-input shape inside records", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          recordId: "rec1",
          fields: {
            Bad: { type: "singleLineText" /* value missing */ },
          },
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred field types inside records (defense in depth — rollup still deferred)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          recordId: "rec1",
          fields: {
            R: { type: "rollup", value: 1 },
          },
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts attachment field type inside records (promoted in Airtable 2.1 Commit 1)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          recordId: "rec1",
          fields: {
            Photo: {
              type: "attachment",
              value: [
                { url: "https://files.example/a.png", filename: "a.png" },
              ],
            },
          },
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown top-level fields (.strict)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "x")],
      typecast: false,
      somethingExtra: "boom",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys inside each record entry (.strict)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          recordId: "rec1",
          fields: { Name: { type: "singleLineText", value: "x" } },
          createdTime: "2026-01-01T00:00:00Z",
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred continueOnError flag (V1 envelope NOT ported)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "x")],
      typecast: false,
      continueOnError: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred preserveExisting flag (NPD-A5 — feature deferred)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "x")],
      typecast: false,
      preserveExisting: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred appendToExisting flag (NPD-A6 — feature deferred)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "x")],
      typecast: false,
      appendToExisting: true,
    });
    expect(result.success).toBe(false);
  });
});
