/**
 * @jest-environment node
 *
 * Config-UX sweep — Airtable `list_records` meta ↔ runtime contract.
 *
 * Pins:
 *   - `sort` json → `object-list`: itemFields keys match the runtime
 *     schema's entry keys EXACTLY (`field`, `direction`); direction
 *     options ⊆ the runtime enum; a saved sort array round-trips
 *     through the runtime schema unchanged (identical committed shape),
 *   - `offset` (pagination cursor) and `filterByFormula` (formula
 *     grammar) are `advanced: true`,
 *   - `pageSize` / `maxRecords` stay in the normal setup path
 *     (result-count is a user decision — audit item 12 judgment call).
 */
import { airtableListRecordsMeta } from "@/integrations/airtable/actions/listRecords.meta";
import { ListRecordsConfigSchema } from "@/integrations/airtable/actions/listRecords.schema";

const byName = new Map(airtableListRecordsMeta.fields.map((f) => [f.name, f]));
const BASE = { baseId: "appX", tableIdOrName: "tblY" };

describe("airtable:list_records — sort object-list meta ↔ runtime schema", () => {
  const sort = byName.get("sort")!;

  it("is an optional advanced object-list (no json shape leftovers)", () => {
    expect(sort.type).toBe("object-list");
    expect(sort.required).toBe(false);
    expect(sort.advanced).toBe(true);
    expect(sort.jsonShape).toBeUndefined();
  });

  it("itemFields keys equal the runtime entry keys exactly", () => {
    expect(sort.itemFields!.map((f) => f.name)).toEqual(["field", "direction"]);
    const field = sort.itemFields!.find((f) => f.name === "field")!;
    const direction = sort.itemFields!.find((f) => f.name === "direction")!;
    expect(field.type).toBe("text");
    expect(field.required).toBe(true);
    expect(direction.type).toBe("select");
    expect(direction.required).toBe(false);
  });

  it("direction options ⊆ the runtime enum (asc | desc)", () => {
    const direction = sort.itemFields!.find((f) => f.name === "direction")!;
    expect(direction.options!.map((o) => o.value)).toEqual(["asc", "desc"]);
  });

  it("a saved sort array round-trips through the runtime schema unchanged", () => {
    const sortValue = [
      { field: "Name", direction: "asc" },
      { field: "Created" }, // direction optional — Airtable defaults asc
    ];
    const parsed = ListRecordsConfigSchema.parse({ ...BASE, sort: sortValue });
    expect(parsed.sort).toEqual(sortValue);
  });

  it("omitting sort stays valid", () => {
    expect(() => ListRecordsConfigSchema.parse(BASE)).not.toThrow();
  });
});

describe("airtable:list_records — advanced-tab placement", () => {
  it("offset (pagination cursor) is advanced", () => {
    expect(byName.get("offset")!.advanced).toBe(true);
  });

  it("filterByFormula (formula grammar) is advanced", () => {
    expect(byName.get("filterByFormula")!.advanced).toBe(true);
  });

  it("pageSize and maxRecords stay in the normal setup path", () => {
    expect(byName.get("pageSize")!.advanced).not.toBe(true);
    expect(byName.get("maxRecords")!.advanced).not.toBe(true);
  });

  it("base/table/view/fields pickers stay in the normal setup path", () => {
    for (const name of ["baseId", "tableIdOrName", "view", "fields"]) {
      expect(byName.get(name)!.advanced).not.toBe(true);
    }
  });
});
