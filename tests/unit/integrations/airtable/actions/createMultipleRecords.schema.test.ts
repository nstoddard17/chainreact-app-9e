/**
 * @jest-environment node
 */
import { CreateMultipleRecordsConfigSchema } from "@/integrations/airtable/actions/createMultipleRecords.schema";

function record(value: string) {
  return {
    fields: { Name: { type: "singleLineText", value } },
  };
}

describe("CreateMultipleRecordsConfigSchema", () => {
  it("accepts a minimal valid config with one record", () => {
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("Alice")],
      typecast: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts the max of 10 records", () => {
    const records = Array.from({ length: 10 }, (_, i) => record(`r${i}`));
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records,
      typecast: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty records array (min 1)", () => {
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 records (fail loud — no Math.min cap)", () => {
    const records = Array.from({ length: 11 }, (_, i) => record(`r${i}`));
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records,
      typecast: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Error message mentions the cap so authors know why it failed.
      const message = result.error.issues.map((i) => i.message).join(" ");
      expect(message).toMatch(/10|cap/i);
    }
  });

  it("rejects missing baseId", () => {
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      tableIdOrName: "tbl",
      records: [record("Alice")],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing tableIdOrName", () => {
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      records: [record("Alice")],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty-string baseId / tableIdOrName", () => {
    expect(
      CreateMultipleRecordsConfigSchema.safeParse({
        baseId: "",
        tableIdOrName: "tbl",
        records: [record("x")],
        typecast: false,
      }).success,
    ).toBe(false);
    expect(
      CreateMultipleRecordsConfigSchema.safeParse({
        baseId: "appBASE",
        tableIdOrName: "",
        records: [record("x")],
        typecast: false,
      }).success,
    ).toBe(false);
  });

  it("rejects missing typecast (Q11 — no silent default)", () => {
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("Alice")],
      // typecast omitted intentionally
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid field-input shape inside records", () => {
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
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
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
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
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
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
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("x")],
      typecast: false,
      somethingExtra: "boom",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys inside each record entry (.strict)", () => {
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          fields: { Name: { type: "singleLineText", value: "x" } },
          id: "rec_should_not_exist_on_create",
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred continueOnError flag (V1 envelope NOT ported)", () => {
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("x")],
      typecast: false,
      continueOnError: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred preserveExisting flag (NPD-A5 — feature deferred)", () => {
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("x")],
      typecast: false,
      preserveExisting: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred appendToExisting flag (NPD-A6 — feature deferred)", () => {
    const result = CreateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("x")],
      typecast: false,
      appendToExisting: true,
    });
    expect(result.success).toBe(false);
  });
});
