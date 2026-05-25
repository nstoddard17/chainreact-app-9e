/**
 * @jest-environment node
 *
 * Slice 4.AIRTABLE-META-3 — Airtable trigger discovery coverage.
 *
 * Pins the single `record_changed` webhook trigger: key, webhook
 * activation, base/table picker wiring, optional table scope, and
 * sensitive cell-value payload fields. The activation-registry side is
 * pinned by tests/structure/trigger-meta-activation-invariant.test.ts.
 */
import {
  getTriggerMeta,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

describe("airtable trigger discovery — record_changed", () => {
  it("registers exactly 1 trigger meta (record_changed)", () => {
    const metas = listTriggerMetasForProvider("airtable");
    expect(metas.map((m) => m.key)).toEqual(["airtable:record_changed"]);
  });

  it("is a webhook trigger requiring an integration, category data", () => {
    const t = getTriggerMeta("airtable:record_changed")!;
    expect(t.provider).toBe("airtable");
    expect(t.key).toBe("airtable:record_changed");
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("data");
  });

  it("baseId → airtable:bases (required); tableIdOrName → airtable:tables (dep baseId, optional)", () => {
    const t = getTriggerMeta("airtable:record_changed")!;
    const base = t.fields.find((f) => f.name === "baseId")!;
    const table = t.fields.find((f) => f.name === "tableIdOrName")!;
    expect(base.optionsSource).toBe("airtable:bases");
    expect(base.dependsOn).toBeUndefined();
    expect(base.required).toBe(true);
    expect(table.optionsSource).toBe("airtable:tables");
    expect(table.dependsOn).toBe("baseId");
    expect(table.required).toBe(false);
  });

  it("does not reference the rejected airtable:records resolver", () => {
    const t = getTriggerMeta("airtable:record_changed")!;
    for (const f of t.fields) {
      expect(f.optionsSource).not.toBe("airtable:records");
    }
  });

  it("cell-value payload fields are sensitive; ids / eventType / counts are not", () => {
    const t = getTriggerMeta("airtable:record_changed")!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    for (const name of ["fields", "parsedFields", "changedFieldsById", "previousValues"]) {
      expect(byName.get(name)!.sensitive).toBe(true);
    }
    for (const name of ["eventType", "baseId", "tableId", "recordId", "baseTransactionNumber", "deleted"]) {
      expect(byName.get(name)!.sensitive).not.toBe(true);
    }
  });

  it("no secret-shaped payload names", () => {
    const BANNED = ["token", "accessToken", "refreshToken", "apiKey", "secret", "webhookSecret", "password"];
    const t = getTriggerMeta("airtable:record_changed")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const b of BANNED) expect(names).not.toContain(b);
  });
});
