/**
 * @jest-environment node
 *
 * Slice 4.EXCEL-META-3 — Microsoft Excel discovery-registry coverage.
 *
 * Pins the full 13-action Excel surface (EXCEL-READ-2 added the read-only
 * `read_range` / `read_table_rows` / `find_row`): keys in displayOrder,
 * key===provider:type, category 'data', camelCase fields (Excel schemas
 * are camelCase), resolver wiring (workbooks / worksheets dependsOn
 * workbookId / tables dependsOn workbookId), delete risk trio, and
 * sensitive cell-data outputs. Trigger assertions live in
 * microsoft-excel-triggers-discovery.test.ts.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listProvidersWithMetadata,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "microsoft-excel:add_row",
  "microsoft-excel:update_row",
  "microsoft-excel:delete_row",
  "microsoft-excel:export_sheet",
  "microsoft-excel:add_table_row",
  "microsoft-excel:create_worksheet",
  "microsoft-excel:rename_worksheet",
  "microsoft-excel:delete_worksheet",
  "microsoft-excel:get_workbooks",
  "microsoft-excel:get_worksheets",
  "microsoft-excel:read_range",
  "microsoft-excel:read_table_rows",
  "microsoft-excel:find_row",
];

describe("microsoft-excel discovery — surface", () => {
  it("registers exactly 13 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("microsoft-excel");
    expect(metas).toHaveLength(13);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("every key equals provider:type and provider is 'microsoft-excel'", () => {
    for (const m of listActionMetasForProvider("microsoft-excel")) {
      expect(m.provider).toBe("microsoft-excel");
      expect(m.key).toBe(`microsoft-excel:${m.type}`);
    }
  });

  it("every action is category 'data' + requiresIntegration; no FileRef flags", () => {
    for (const m of listActionMetasForProvider("microsoft-excel")) {
      expect(m.category).toBe("data");
      expect(m.requiresIntegration).toBe(true);
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(false);
    }
  });

  it("displayOrder is strictly ascending (10..130)", () => {
    const orders = listActionMetasForProvider("microsoft-excel").map((m) => m.displayOrder);
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(130);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("microsoft-excel is reported by listProvidersWithMetadata", () => {
    expect(listProvidersWithMetadata()).toContain("microsoft-excel");
  });
});

describe("microsoft-excel discovery — field hygiene + resolver wiring", () => {
  it("all field names are camelCase (mirror the runtime Zod schemas)", () => {
    for (const m of listActionMetasForProvider("microsoft-excel")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("workbookId fields use the workbooks resolver with no dep", () => {
    for (const m of listActionMetasForProvider("microsoft-excel")) {
      const wb = m.fields.find((f) => f.name === "workbookId");
      if (!wb) continue; // get_workbooks has no workbookId field
      expect(wb.optionsSource).toBe("microsoft-excel:workbooks");
      expect(wb.dependsOn).toBeUndefined();
    }
  });

  it("worksheetName fields use the worksheets resolver dependsOn workbookId", () => {
    const withWorksheet = [
      "microsoft-excel:add_row",
      "microsoft-excel:update_row",
      "microsoft-excel:delete_row",
      "microsoft-excel:export_sheet",
      "microsoft-excel:rename_worksheet",
      "microsoft-excel:delete_worksheet",
      "microsoft-excel:read_range",
    ];
    for (const key of withWorksheet) {
      const f = getActionMeta(key)!.fields.find((x) => x.name === "worksheetName")!;
      expect(f.optionsSource).toBe("microsoft-excel:worksheets");
      expect(f.dependsOn).toBe("workbookId");
    }
  });

  it("tableName fields use the tables resolver dependsOn workbookId", () => {
    for (const key of [
      "microsoft-excel:add_table_row",
      "microsoft-excel:read_table_rows",
      "microsoft-excel:find_row",
    ]) {
      const f = getActionMeta(key)!.fields.find((x) => x.name === "tableName")!;
      expect(f.optionsSource).toBe("microsoft-excel:tables");
      expect(f.dependsOn).toBe("workbookId");
    }
  });

  it("find_row.lookupColumn uses the table_columns resolver (dependsOn workbook + table, manual entry kept) — RESOLVERS-1", () => {
    const f = getActionMeta("microsoft-excel:find_row")!.fields.find(
      (x) => x.name === "lookupColumn",
    )!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("microsoft-excel:table_columns");
    expect(f.dependsOn).toEqual(["workbookId", "tableName"]);
    expect(f.allowManualEntry).toBe(true);
    expect(f.required).toBe(true);
  });

  it("new-name fields stay plain text (no picker)", () => {
    expect(
      getActionMeta("microsoft-excel:create_worksheet")!.fields.find((f) => f.name === "name")!.type,
    ).toBe("text");
    expect(
      getActionMeta("microsoft-excel:rename_worksheet")!.fields.find(
        (f) => f.name === "newWorksheetName",
      )!.type,
    ).toBe("text");
  });

  it("update_row.values is the guided spreadsheet-rows editor committing a column → value map", () => {
    const f = getActionMeta("microsoft-excel:update_row")!.fields.find((x) => x.name === "values")!;
    // SPREADSHEET-GUIDED-CONFIG s3 upgraded the WIDGET (keyvalue -> the
    // column-aware guided editor) without changing the persisted shape:
    // `values` is and stays Record<string, unknown>. `valueShape: "record"`
    // is what now carries that column → value map guarantee, so it is pinned
    // explicitly here rather than left implied by the old widget type.
    expect(f.type).toBe("spreadsheet-rows");
    expect(f.valueShape).toBe("record");
    expect(f.required).toBe(true);
  });

  it("no secret-shaped output names anywhere", () => {
    const BANNED = [
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "clientSecret",
      "secret",
      "webhookSecret",
      "password",
    ];
    for (const m of listActionMetasForProvider("microsoft-excel")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });
});

describe("microsoft-excel discovery — risk classifications", () => {
  it("delete_row + delete_worksheet are high + destructive + requiresConfirmation", () => {
    for (const key of ["microsoft-excel:delete_row", "microsoft-excel:delete_worksheet"]) {
      const m = getActionMeta(key)!;
      expect(m.riskLevel).toBe("high");
      expect(m.isDestructive).toBe(true);
      expect(m.requiresConfirmation).toBe(true);
      expect(m.riskDescription).toBeDefined();
    }
  });

  it("reads are low; writes are medium; only deletes are destructive", () => {
    const low = [
      "microsoft-excel:export_sheet",
      "microsoft-excel:get_workbooks",
      "microsoft-excel:get_worksheets",
      "microsoft-excel:read_range",
      "microsoft-excel:read_table_rows",
      "microsoft-excel:find_row",
    ];
    for (const k of low) expect(getActionMeta(k)!.riskLevel).toBe("low");

    const medium = [
      "microsoft-excel:add_row",
      "microsoft-excel:update_row",
      "microsoft-excel:add_table_row",
      "microsoft-excel:create_worksheet",
      "microsoft-excel:rename_worksheet",
    ];
    for (const k of medium) expect(getActionMeta(k)!.riskLevel).toBe("medium");

    for (const m of listActionMetasForProvider("microsoft-excel")) {
      const isDelete =
        m.key === "microsoft-excel:delete_row" ||
        m.key === "microsoft-excel:delete_worksheet";
      if (!isDelete) {
        expect(m.isDestructive).toBe(false);
        expect(m.requiresConfirmation).toBe(false);
      }
    }
  });
});

describe("microsoft-excel discovery — sensitive cell-data outputs", () => {
  it("cell-data outputs are marked sensitive", () => {
    const cases: Array<[string, string]> = [
      ["microsoft-excel:add_row", "valuesWritten"],
      ["microsoft-excel:add_row", "rowsAdded"],
      ["microsoft-excel:add_table_row", "valuesWritten"],
      ["microsoft-excel:export_sheet", "rows"],
      ["microsoft-excel:read_range", "values"],
      ["microsoft-excel:read_table_rows", "rows"],
      ["microsoft-excel:find_row", "firstMatch"],
    ];
    for (const [key, outName] of cases) {
      const o = getActionMeta(key)!.outputs.find((x) => x.name === outName)!;
      expect(o.sensitive).toBe(true);
    }
  });

  it("ids / names / addresses / counts / headers are NOT sensitive", () => {
    const NON_SENSITIVE = new Set([
      "workbookId",
      "worksheetName",
      "worksheetId",
      "address",
      "rowIndex",
      "rowNumber",
      "columnCount",
      "rowCount",
      "headers",
      "updatedColumns",
      "deleted",
      "renamed",
      "position",
      "count",
    ]);
    for (const m of listActionMetasForProvider("microsoft-excel")) {
      for (const o of m.outputs) {
        if (NON_SENSITIVE.has(o.name)) expect(o.sensitive).not.toBe(true);
      }
    }
  });
});
