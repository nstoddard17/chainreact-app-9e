/**
 * @jest-environment node
 *
 * Slice 4.AIRTABLE-META-3 — Airtable provider-route coverage.
 *
 * GET /api/providers/airtable/actions returns the 11 actions in display
 * order with the full wire shape (optionsSource / dependsOn arrays /
 * risk / FileRef / sensitive outputs); GET .../triggers returns the
 * record_changed webhook trigger; the providers index marks airtable
 * hasMetadata=true. No provider API calls (pure registry read).
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

import { GET as getProviders } from "@/app/api/providers/route";
import { GET as getActions } from "@/app/api/providers/[id]/actions/route";
import { GET as getTriggers } from "@/app/api/providers/[id]/triggers/route";

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
});

interface WireOutput {
  name: string;
  type: string;
  sensitive?: boolean;
  fields?: WireOutput[];
}
interface WireField {
  name: string;
  type: string;
  required: boolean;
  optionsSource?: string;
  dependsOn?: string | string[];
  multiple?: boolean;
  allowManualEntry?: boolean;
}
interface WireAction {
  key: string;
  category: string;
  requiresIntegration: boolean;
  producesFileRef: boolean;
  consumesFileRef: boolean;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  riskLevel: string;
  fields: WireField[];
  outputs: WireOutput[];
}

async function fetchActions(): Promise<WireAction[]> {
  const res = await getActions(new Request("http://x/airtable/actions"), {
    params: Promise.resolve({ id: "airtable" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("airtable");
  return body.actions;
}

describe("GET /api/providers/airtable/actions", () => {
  it("returns the full 11-action surface in display order", async () => {
    const actions = await fetchActions();
    expect(actions.map((a) => a.key)).toEqual([
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
    ]);
  });

  it("every action requiresIntegration + category data", async () => {
    for (const a of await fetchActions()) {
      expect(a.requiresIntegration).toBe(true);
      expect(a.category).toBe("data");
    }
  });

  it("baseId → airtable:bases (no dep); tableIdOrName → airtable:tables (dep baseId)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const get = byKey.get("airtable:get_record")!;
    const base = get.fields.find((f) => f.name === "baseId")!;
    const table = get.fields.find((f) => f.name === "tableIdOrName")!;
    expect(base.type).toBe("combobox");
    expect(base.optionsSource).toBe("airtable:bases");
    expect(base.dependsOn).toBeUndefined();
    expect(table.optionsSource).toBe("airtable:tables");
    expect(table.dependsOn).toBe("baseId");
  });

  it("list_records view → airtable:views and fields → airtable:fields, both multi-parent [baseId, tableIdOrName]", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const list = byKey.get("airtable:list_records")!;
    const view = list.fields.find((f) => f.name === "view")!;
    const fields = list.fields.find((f) => f.name === "fields")!;
    expect(view.optionsSource).toBe("airtable:views");
    expect(view.dependsOn).toEqual(["baseId", "tableIdOrName"]);
    expect(fields.optionsSource).toBe("airtable:fields");
    expect(fields.dependsOn).toEqual(["baseId", "tableIdOrName"]);
    expect(fields.multiple).toBe(true);
  });

  it("add_attachment.fieldName → airtable:attachment_fields (multi-parent), consumesFileRef, file field", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const add = byKey.get("airtable:add_attachment")!;
    const fieldName = add.fields.find((f) => f.name === "fieldName")!;
    expect(fieldName.optionsSource).toBe("airtable:attachment_fields");
    expect(fieldName.dependsOn).toEqual(["baseId", "tableIdOrName"]);
    expect(add.consumesFileRef).toBe(true);
    expect(add.producesFileRef).toBe(false);
    const file = add.fields.find((f) => f.name === "file")!;
    expect(file.type).toBe("file");
  });

  it("recordId serializes the airtable:records picker on every record-referencing action (multi-parent + manual entry; RESOLVERS-1)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    for (const key of [
      "airtable:get_record",
      "airtable:update_record",
      "airtable:delete_record",
      "airtable:add_attachment",
    ]) {
      const recordId = byKey.get(key)!.fields.find((f) => f.name === "recordId")!;
      expect(recordId.type).toBe("combobox");
      expect(recordId.optionsSource).toBe("airtable:records");
      expect(recordId.dependsOn).toEqual(["baseId", "tableIdOrName"]);
      expect(recordId.allowManualEntry).toBe(true);
    }
  });

  it("create/update fields maps are json editors (CONFIG-UX-SETUP-ADVANCED-1)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    for (const key of ["airtable:create_record", "airtable:update_record"]) {
      const fields = byKey.get(key)!.fields.find((f) => f.name === "fields")!;
      expect(fields.type).toBe("json");
    }
    for (const key of ["airtable:create_multiple_records", "airtable:update_multiple_records"]) {
      const records = byKey.get(key)!.fields.find((f) => f.name === "records")!;
      expect(records.type).toBe("json");
    }
  });

  it("delete_record serializes the destructive trio + high risk", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const del = byKey.get("airtable:delete_record")!;
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskLevel).toBe("high");
  });

  it("read/write risk levels match the accepted taxonomy", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    for (const key of ["airtable:list_records", "airtable:get_record", "airtable:find_record", "airtable:get_base_schema", "airtable:get_table_schema"]) {
      expect(byKey.get(key)!.riskLevel).toBe("low");
    }
    for (const key of ["airtable:create_record", "airtable:update_record", "airtable:create_multiple_records", "airtable:update_multiple_records", "airtable:add_attachment"]) {
      expect(byKey.get(key)!.riskLevel).toBe("medium");
      expect(byKey.get(key)!.isDestructive).toBe(false);
    }
  });

  it("record cell-value outputs are sensitive; schema-metadata + ids are not", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    // Top-level object fields.
    const create = byKey.get("airtable:create_record")!;
    expect(create.outputs.find((o) => o.name === "fields")!.sensitive).toBe(true);
    expect(create.outputs.find((o) => o.name === "id")!.sensitive).not.toBe(true);
    // Nested per-row fields inside the records array.
    const list = byKey.get("airtable:list_records")!;
    const records = list.outputs.find((o) => o.name === "records")!;
    const nestedFields = records.fields!.find((f) => f.name === "fields")!;
    expect(nestedFields.sensitive).toBe(true);
    expect(records.fields!.find((f) => f.name === "id")!.sensitive).not.toBe(true);
    // Attachment URLs.
    const add = byKey.get("airtable:add_attachment")!;
    expect(add.outputs.find((o) => o.name === "attachments")!.sensitive).toBe(true);
    // Schema-metadata reads are NOT sensitive.
    const baseSchema = byKey.get("airtable:get_base_schema")!;
    expect(baseSchema.outputs.find((o) => o.name === "tables")!.sensitive).not.toBe(true);
  });

  it("airtable:records is referenced only by recordId fields (no accidental spread)", async () => {
    const allowed = new Set([
      "airtable:get_record.recordId",
      "airtable:update_record.recordId",
      "airtable:delete_record.recordId",
      "airtable:add_attachment.recordId",
    ]);
    for (const a of await fetchActions()) {
      for (const f of a.fields) {
        if (f.optionsSource === "airtable:records") {
          expect(allowed.has(`${a.key}.${f.name}`)).toBe(true);
        }
      }
    }
  });
});

interface WireTriggerField {
  name: string;
  type: string;
  required: boolean;
  optionsSource?: string;
  dependsOn?: string | string[];
}
interface WireTrigger {
  key: string;
  type: string;
  activation: string;
  requiresIntegration: boolean;
  category: string;
  fields: WireTriggerField[];
  payloadShape: Array<{ name: string; type: string; sensitive?: boolean }>;
}

async function fetchTriggers(): Promise<WireTrigger[]> {
  const res = await getTriggers(new Request("http://x/airtable/triggers"), {
    params: Promise.resolve({ id: "airtable" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; triggers: WireTrigger[] };
  expect(body.provider).toBe("airtable");
  return body.triggers;
}

describe("GET /api/providers/airtable/triggers", () => {
  it("returns the 1 record_changed webhook trigger", async () => {
    const triggers = await fetchTriggers();
    expect(triggers.map((t) => t.key)).toEqual(["airtable:record_changed"]);
    const t = triggers[0]!;
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("data");
  });

  it("baseId → airtable:bases (required); tableIdOrName → airtable:tables (dep baseId, optional)", async () => {
    const t = (await fetchTriggers())[0]!;
    const base = t.fields.find((f) => f.name === "baseId")!;
    const table = t.fields.find((f) => f.name === "tableIdOrName")!;
    expect(base.optionsSource).toBe("airtable:bases");
    expect(base.required).toBe(true);
    expect(table.optionsSource).toBe("airtable:tables");
    expect(table.dependsOn).toBe("baseId");
    expect(table.required).toBe(false);
  });

  it("record cell-value payload fields are sensitive; ids/eventType are not", async () => {
    const t = (await fetchTriggers())[0]!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    for (const name of ["fields", "parsedFields", "changedFieldsById", "previousValues"]) {
      expect(byName.get(name)!.sensitive).toBe(true);
    }
    for (const name of ["eventType", "baseId", "tableId", "recordId"]) {
      expect(byName.get(name)!.sensitive).not.toBe(true);
    }
  });

  it("trigger does not reference airtable:records", async () => {
    const t = (await fetchTriggers())[0]!;
    for (const f of t.fields) {
      expect(f.optionsSource).not.toBe("airtable:records");
    }
  });
});

describe("GET /api/providers — airtable hasMetadata", () => {
  it("marks airtable hasMetadata=true now that AIRTABLE-META-3 shipped its metas", async () => {
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const airtable = body.providers.find((p) => p.id === "airtable");
    expect(airtable).toBeDefined();
    expect(airtable?.hasMetadata).toBe(true);
  });
});
