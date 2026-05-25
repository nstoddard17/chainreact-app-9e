/**
 * @jest-environment node
 *
 * Slice 4.EXCEL-META-3 — Microsoft Excel trigger discovery coverage.
 *
 * Pins the 5 polling trigger metas: keys in displayOrder, polling
 * activation, resolver-backed config (workbooks / worksheets|tables
 * dependsOn workbookId), and sensitive `values` payload on the 4 row
 * triggers. Activation wiring is enforced by
 * trigger-meta-activation-invariant.test.ts.
 */
import {
  getTriggerMeta,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "microsoft-excel:new_row",
  "microsoft-excel:updated_row",
  "microsoft-excel:new_table_row",
  "microsoft-excel:updated_table_row",
  "microsoft-excel:new_worksheet",
];

describe("microsoft-excel triggers discovery — surface", () => {
  it("registers exactly 5 trigger metas in displayOrder", () => {
    const metas = listTriggerMetasForProvider("microsoft-excel");
    expect(metas).toHaveLength(5);
    expect(metas.map((t) => t.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("all 5 are polling, category 'data', integration-bound, key===provider:type", () => {
    for (const t of listTriggerMetasForProvider("microsoft-excel")) {
      expect(t.activation).toBe("polling");
      expect(t.category).toBe("data");
      expect(t.requiresIntegration).toBe(true);
      expect(t.key).toBe(`microsoft-excel:${t.type}`);
    }
  });
});

describe("microsoft-excel triggers discovery — resolver wiring", () => {
  it("every trigger's workbookId uses the workbooks resolver (no dep)", () => {
    for (const t of listTriggerMetasForProvider("microsoft-excel")) {
      const wb = t.fields.find((f) => f.name === "workbookId")!;
      expect(wb.optionsSource).toBe("microsoft-excel:workbooks");
      expect(wb.dependsOn).toBeUndefined();
    }
  });

  it("worksheet triggers wire worksheetName → worksheets dependsOn workbookId", () => {
    for (const key of ["microsoft-excel:new_row", "microsoft-excel:updated_row"]) {
      const f = getTriggerMeta(key)!.fields.find((x) => x.name === "worksheetName")!;
      expect(f.optionsSource).toBe("microsoft-excel:worksheets");
      expect(f.dependsOn).toBe("workbookId");
    }
  });

  it("table triggers wire tableName → tables dependsOn workbookId", () => {
    for (const key of [
      "microsoft-excel:new_table_row",
      "microsoft-excel:updated_table_row",
    ]) {
      const f = getTriggerMeta(key)!.fields.find((x) => x.name === "tableName")!;
      expect(f.optionsSource).toBe("microsoft-excel:tables");
      expect(f.dependsOn).toBe("workbookId");
    }
  });

  it("new_worksheet has only the workbookId field (no worksheet/table picker)", () => {
    const fields = getTriggerMeta("microsoft-excel:new_worksheet")!.fields;
    expect(fields.map((f) => f.name)).toEqual(["workbookId"]);
  });

  it("internal polling state (pollingEnabled/snapshot/polling) is never surfaced as a field", () => {
    for (const t of listTriggerMetasForProvider("microsoft-excel")) {
      const names = t.fields.map((f) => f.name);
      expect(names).not.toContain("pollingEnabled");
      expect(names).not.toContain("snapshot");
      expect(names).not.toContain("polling");
    }
  });
});

describe("microsoft-excel triggers discovery — sensitive payload", () => {
  it("row/table triggers mark the `values` payload sensitive", () => {
    for (const key of [
      "microsoft-excel:new_row",
      "microsoft-excel:updated_row",
      "microsoft-excel:new_table_row",
      "microsoft-excel:updated_table_row",
    ]) {
      const values = getTriggerMeta(key)!.payloadShape.find((p) => p.name === "values")!;
      expect(values.sensitive).toBe(true);
    }
  });

  it("structural ids/names/indexes are not sensitive; new_worksheet carries no cell values", () => {
    const nw = getTriggerMeta("microsoft-excel:new_worksheet")!;
    expect(nw.payloadShape.map((p) => p.name)).toEqual([
      "workbookId",
      "worksheetName",
      "worksheetId",
      "position",
    ]);
    for (const p of nw.payloadShape) {
      expect(p.sensitive).not.toBe(true);
    }
  });
});
