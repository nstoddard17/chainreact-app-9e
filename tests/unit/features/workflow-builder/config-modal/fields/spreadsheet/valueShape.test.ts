/**
 * The `valueShape` field capability (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * Three shipped actions depend on the pre-S3 behavior, so the risk this
 * suite exists to close is a REGRESSION: the new capability must be inert
 * when omitted, and the three metas that never declare it must keep
 * behaving exactly as they did.
 */
import { ActionMetaSchema, type ActionMeta } from "@/contracts/actionMeta";
import { googleSheetsAppendRowMeta } from "@/integrations/google-sheets/actions/appendRow.meta";
import { microsoftExcelAddRowMeta } from "@/integrations/microsoft-excel/actions/addRow.meta";
import { microsoftExcelAddTableRowMeta } from "@/integrations/microsoft-excel/actions/addTableRow.meta";

function fieldNamed(meta: ActionMeta, name: string) {
  return meta.fields.find((f) => f.name === name);
}

describe("the default is the behavior that already shipped", () => {
  it.each([
    ["google-sheets:append_row", googleSheetsAppendRowMeta],
    ["microsoft-excel:add_row", microsoftExcelAddRowMeta],
    ["microsoft-excel:add_table_row", microsoftExcelAddTableRowMeta],
  ])("%s declares no valueShape, so nothing about it changed", (_key, meta) => {
    expect(fieldNamed(meta as ActionMeta, "values")?.valueShape).toBeUndefined();
  });

  it("every shipped meta still parses against the contract", () => {
    for (const meta of [
      googleSheetsAppendRowMeta,
      microsoftExcelAddRowMeta,
      microsoftExcelAddTableRowMeta,
    ]) {
      expect(() => ActionMetaSchema.parse(meta)).not.toThrow();
    }
  });
});

describe("the contract keeps the capability where it belongs", () => {
  const base: ActionMeta = {
    key: "microsoft-excel:update_row",
    provider: "microsoft-excel",
    type: "update_row",
    displayName: "Test",
    description: "Test action for the valueShape contract.",
    category: "data",
    requiresIntegration: true,
    fields: [],
    outputs: [],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: 1,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "low",
    riskDescription: "Test.",
  };

  function withField(field: Record<string, unknown>): unknown {
    return { ...base, fields: [field] };
  }

  it("accepts each of the three shapes on a spreadsheet-rows field", () => {
    for (const valueShape of ["preserve", "record", "positional"]) {
      expect(() =>
        ActionMetaSchema.parse(
          withField({
            name: "values",
            label: "Values",
            type: "spreadsheet-rows",
            required: true,
            valueShape,
          }),
        ),
      ).not.toThrow();
    }
  });

  it("rejects valueShape on any other field type", () => {
    expect(() =>
      ActionMetaSchema.parse(
        withField({
          name: "values",
          label: "Values",
          type: "keyvalue",
          required: true,
          valueShape: "record",
        }),
      ),
    ).toThrow(/valueShape.*only valid on .*spreadsheet-rows/i);
  });

  it("rejects an unknown shape", () => {
    expect(() =>
      ActionMetaSchema.parse(
        withField({
          name: "values",
          label: "Values",
          type: "spreadsheet-rows",
          required: true,
          valueShape: "keyed",
        }),
      ),
    ).toThrow();
  });

  it("rejects a record field that also promises a batch mode it cannot save", () => {
    // A record-only runtime schema has no array branch, so offering
    // "Several rows" would be offering a save shape the action rejects.
    expect(() =>
      ActionMetaSchema.parse({
        ...base,
        fields: [
          {
            name: "values",
            label: "Values",
            type: "spreadsheet-rows",
            required: true,
            valueShape: "record",
            batchRowsField: "rows",
          },
          {
            name: "rows",
            label: "Rows",
            type: "keyvalue-list",
            required: false,
            renderedBy: "values",
          },
        ],
      }),
    ).toThrow(/no positional shape to switch to/i);
  });
});
