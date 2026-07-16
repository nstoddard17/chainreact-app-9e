/**
 * @jest-environment node
 *
 * Slice 4.AIRTABLE-META-3 — Airtable discovery-registry coverage.
 *
 * Pins the full 11-action Airtable surface: keys in displayOrder,
 * key===provider:type, category 'data', camelCase fields (Airtable
 * schemas are camelCase), resolver wiring (bases / tables dependsOn
 * baseId / fields+views+attachment_fields multi-parent dependsOn
 * [baseId, tableIdOrName] / records picker on get/update/delete_record
 * recordId — RESOLVERS-1, Marcus-required), delete_record risk trio, and
 * sensitive cell-data outputs.
 * Trigger assertions live in airtable-triggers-discovery.test.ts.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listProvidersWithMetadata,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "airtable:list_records",
  "airtable:get_record",
  "airtable:find_record",
  "airtable:get_base_schema",
  "airtable:get_table_schema",
  "airtable:create_record",
  "airtable:update_record",
  "airtable:create_multiple_records",
  "airtable:update_multiple_records",
  "airtable:add_attachment",
  "airtable:delete_record",
];

describe("airtable discovery — surface", () => {
  it("registers exactly 11 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("airtable");
    expect(metas).toHaveLength(11);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("every key equals provider:type and provider is 'airtable'", () => {
    for (const m of listActionMetasForProvider("airtable")) {
      expect(m.provider).toBe("airtable");
      expect(m.key).toBe(`airtable:${m.type}`);
    }
  });

  it("every action is category 'data' + requiresIntegration", () => {
    for (const m of listActionMetasForProvider("airtable")) {
      expect(m.category).toBe("data");
      expect(m.requiresIntegration).toBe(true);
    }
  });

  it("displayOrder is strictly ascending (10..110)", () => {
    const orders = listActionMetasForProvider("airtable").map((m) => m.displayOrder);
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(110);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("airtable is reported by listProvidersWithMetadata", () => {
    expect(listProvidersWithMetadata()).toContain("airtable");
  });

  it("only add_attachment consumes a FileRef; none produce one", () => {
    for (const m of listActionMetasForProvider("airtable")) {
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(m.key === "airtable:add_attachment");
    }
  });
});

describe("airtable discovery — field hygiene + resolver wiring", () => {
  it("all field names are camelCase (mirror the runtime Zod schemas)", () => {
    for (const m of listActionMetasForProvider("airtable")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("baseId fields use the bases resolver with no dep", () => {
    for (const m of listActionMetasForProvider("airtable")) {
      const base = m.fields.find((f) => f.name === "baseId")!;
      expect(base.optionsSource).toBe("airtable:bases");
      expect(base.dependsOn).toBeUndefined();
    }
  });

  it("tableIdOrName fields use the tables resolver dependsOn baseId (all actions except get_base_schema)", () => {
    for (const m of listActionMetasForProvider("airtable")) {
      const table = m.fields.find((f) => f.name === "tableIdOrName");
      if (!table) {
        // Only get_base_schema is base-level (no table field).
        expect(m.key).toBe("airtable:get_base_schema");
        continue;
      }
      expect(table.optionsSource).toBe("airtable:tables");
      expect(table.dependsOn).toBe("baseId");
    }
  });

  it("list_records view → airtable:views and fields → airtable:fields (multi-parent)", () => {
    const list = getActionMeta("airtable:list_records")!;
    const view = list.fields.find((f) => f.name === "view")!;
    const fields = list.fields.find((f) => f.name === "fields")!;
    expect(view.optionsSource).toBe("airtable:views");
    expect(view.dependsOn).toEqual(["baseId", "tableIdOrName"]);
    expect(fields.optionsSource).toBe("airtable:fields");
    expect(fields.dependsOn).toEqual(["baseId", "tableIdOrName"]);
    expect(fields.multiple).toBe(true);
  });

  it("add_attachment.fieldName → airtable:attachment_fields (multi-parent); file is a FileRef field", () => {
    const add = getActionMeta("airtable:add_attachment")!;
    const fieldName = add.fields.find((f) => f.name === "fieldName")!;
    expect(fieldName.optionsSource).toBe("airtable:attachment_fields");
    expect(fieldName.dependsOn).toEqual(["baseId", "tableIdOrName"]);
    expect(add.fields.find((f) => f.name === "file")!.type).toBe("file");
  });

  it("recordId on get/update/delete_record → airtable:records picker (multi-parent + manual entry; RESOLVERS-1)", () => {
    for (const key of [
      "airtable:get_record",
      "airtable:update_record",
      "airtable:delete_record",
    ]) {
      const f = getActionMeta(key)!.fields.find((x) => x.name === "recordId")!;
      expect(f.type).toBe("combobox");
      expect(f.optionsSource).toBe("airtable:records");
      expect(f.dependsOn).toEqual(["baseId", "tableIdOrName"]);
      expect(f.allowManualEntry).toBe(true);
    }
  });

  it("add_attachment.recordId is the airtable:records picker too (RESOLVERS-1 — every record reference is pickable)", () => {
    const f = getActionMeta("airtable:add_attachment")!.fields.find(
      (x) => x.name === "recordId",
    )!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("airtable:records");
    expect(f.allowManualEntry).toBe(true);
    expect(f.dependsOn).toEqual(["baseId", "tableIdOrName"]);
  });

  it("typed field maps + batch records are advanced json fields (no typed-field-map renderer yet — CONFIG-UX-AUDIT-2 parses to the schema shape)", () => {
    for (const key of ["airtable:create_record", "airtable:update_record"]) {
      const f = getActionMeta(key)!.fields.find((x) => x.name === "fields")!;
      expect(f.type).toBe("json");
      expect(f.jsonShape).toBe("object");
      expect(f.advanced).toBe(true);
    }
    for (const key of [
      "airtable:create_multiple_records",
      "airtable:update_multiple_records",
    ]) {
      const f = getActionMeta(key)!.fields.find((x) => x.name === "records")!;
      expect(f.type).toBe("json");
      expect(f.jsonShape).toBe("array");
      expect(f.advanced).toBe(true);
    }
  });

  it("airtable:records is referenced only by recordId fields (get/update/delete_record + add_attachment)", () => {
    const allowed = new Set([
      "airtable:get_record.recordId",
      "airtable:update_record.recordId",
      "airtable:delete_record.recordId",
      "airtable:add_attachment.recordId",
    ]);
    for (const m of listActionMetasForProvider("airtable")) {
      for (const f of m.fields) {
        if (f.optionsSource === "airtable:records") {
          expect(allowed.has(`${m.key}.${f.name}`)).toBe(true);
        }
      }
    }
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
    for (const m of listActionMetasForProvider("airtable")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });
});

describe("airtable discovery — risk classifications (Marcus decision)", () => {
  it("delete_record is high + destructive + requiresConfirmation", () => {
    const m = getActionMeta("airtable:delete_record")!;
    expect(m.riskLevel).toBe("high");
    expect(m.isDestructive).toBe(true);
    expect(m.requiresConfirmation).toBe(true);
    expect(m.riskDescription).toBeDefined();
  });

  it("reads are low; writes are medium; only delete_record is destructive", () => {
    const low = [
      "airtable:list_records",
      "airtable:get_record",
      "airtable:find_record",
      "airtable:get_base_schema",
      "airtable:get_table_schema",
    ];
    for (const k of low) expect(getActionMeta(k)!.riskLevel).toBe("low");

    const medium = [
      "airtable:create_record",
      "airtable:update_record",
      "airtable:create_multiple_records",
      "airtable:update_multiple_records",
      "airtable:add_attachment",
    ];
    for (const k of medium) expect(getActionMeta(k)!.riskLevel).toBe("medium");

    for (const m of listActionMetasForProvider("airtable")) {
      if (m.key !== "airtable:delete_record") {
        expect(m.isDestructive).toBe(false);
        expect(m.requiresConfirmation).toBe(false);
      }
    }
  });
});

describe("airtable discovery — sensitive cell-data outputs", () => {
  it("top-level record cell maps are sensitive", () => {
    for (const key of ["airtable:create_record", "airtable:update_record", "airtable:get_record"]) {
      const o = getActionMeta(key)!.outputs.find((x) => x.name === "fields")!;
      expect(o.sensitive).toBe(true);
    }
  });

  it("nested per-record `fields` inside record arrays / objects is sensitive (id is not)", () => {
    // list / batch return arrays of records; find returns a record object.
    const arrayKeys = [
      "airtable:list_records",
      "airtable:create_multiple_records",
      "airtable:update_multiple_records",
    ];
    for (const key of arrayKeys) {
      const records = getActionMeta(key)!.outputs.find((o) => o.name === "records")!;
      expect(records.fields!.find((f) => f.name === "fields")!.sensitive).toBe(true);
      expect(records.fields!.find((f) => f.name === "id")!.sensitive).not.toBe(true);
    }
    const record = getActionMeta("airtable:find_record")!.outputs.find(
      (o) => o.name === "record",
    )!;
    expect(record.fields!.find((f) => f.name === "fields")!.sensitive).toBe(true);
  });

  it("attachment URLs are sensitive", () => {
    const o = getActionMeta("airtable:add_attachment")!.outputs.find(
      (x) => x.name === "attachments",
    )!;
    expect(o.sensitive).toBe(true);
  });

  it("schema-metadata reads + ids / counts are NOT sensitive", () => {
    expect(
      getActionMeta("airtable:get_base_schema")!.outputs.find((o) => o.name === "tables")!.sensitive,
    ).not.toBe(true);
    expect(
      getActionMeta("airtable:get_table_schema")!.outputs.find((o) => o.name === "table")!.sensitive,
    ).not.toBe(true);
    const NON_SENSITIVE = new Set([
      "baseId",
      "tableIdOrName",
      "id",
      "recordId",
      "fieldName",
      "count",
      "offset",
      "createdCount",
      "updatedCount",
      "attachmentCount",
      "tableCount",
      "totalFieldCount",
      "fieldCount",
      "deleted",
      "found",
      "createdTime",
    ]);
    for (const m of listActionMetasForProvider("airtable")) {
      for (const o of m.outputs) {
        if (NON_SENSITIVE.has(o.name)) expect(o.sensitive).not.toBe(true);
      }
    }
  });
});
