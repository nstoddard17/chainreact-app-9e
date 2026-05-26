/**
 * @jest-environment node
 *
 * Tests for services/ai/tools/providerCatalog.ts (Slice 4.AI-2).
 *
 * These run against the REAL registries (no mocks) so they prove the catalog
 * is grounded in actual metadata and invents nothing. Real keys are derived
 * at runtime so the tests don't drift as providers are added.
 */
import {
  getProviderCatalog,
  getActionMeta,
  getTriggerMeta,
  getNodeSchema,
} from "@/services/ai/tools/providerCatalog";
import { isSecretKey } from "@/services/ai/tools/redact";
import { listProviders } from "@/integrations/_registry";
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import type { OutputMeta } from "@/contracts/actionMeta";

function hasSensitiveOutput(outputs: readonly OutputMeta[]): boolean {
  return outputs.some(
    (o) => o.sensitive === true || (o.fields ? hasSensitiveOutput(o.fields) : false),
  );
}

/** Recursively assert no OBJECT KEY in a result looks secret-bearing. */
function assertNoSecretKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoSecretKeys);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      expect(isSecretKey(key)).toBe(false);
      assertNoSecretKeys(val);
    }
  }
}

describe("getProviderCatalog", () => {
  it("returns only real registered providers (plus synthetic native), inventing none", () => {
    const result = getProviderCatalog();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const realIds = new Set(listProviders().map((m) => m.id));
    realIds.add("native");

    expect(result.data.providers.length).toBeGreaterThan(0);
    for (const p of result.data.providers) {
      expect(realIds.has(p.id)).toBe(true);
    }
  });

  it("is sorted by displayName and carries no secret-shaped keys", () => {
    const result = getProviderCatalog();
    if (!result.ok) throw new Error("expected ok");
    const names = result.data.providers.map((p) => p.displayName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    assertNoSecretKeys(result.data);
  });

  it("surfaces static-enum config options on the compact catalog entry (AI-12B)", () => {
    const all = [...listAllActionMetas(), ...listAllTriggerMetas()];
    const withStatic = all.find((m) =>
      m.fields.some((f) => f.options && f.options.length > 0),
    );
    if (!withStatic) return; // registry has no static-options node yet — skip

    const result = getProviderCatalog();
    if (!result.ok) throw new Error("expected ok");
    const provider = result.data.providers.find((p) => p.id === withStatic.provider)!;
    const entry = [...provider.actions, ...provider.triggers].find(
      (e) => e.key === withStatic.key,
    )!;
    expect(entry.configOptions).toBeDefined();
    expect(entry.configOptions!.length).toBeGreaterThan(0);

    const field = withStatic.fields.find((f) => f.options && f.options.length > 0)!;
    const surfaced = entry.configOptions!.find((c) => c.field === field.name)!;
    expect(surfaced).toBeDefined();
    // Mirrors the metadata's option VALUES, capped at 24.
    expect(surfaced.values).toEqual(field.options!.slice(0, 24).map((o) => o.value));
  });

  it("includes action keys sourced from the discovery registry", () => {
    const sample = listAllActionMetas()[0];
    expect(sample).toBeDefined();
    const result = getProviderCatalog();
    if (!result.ok) throw new Error("expected ok");

    const entry = result.data.providers.find((p) => p.id === sample!.provider);
    expect(entry).toBeDefined();
    expect(entry!.actions.some((a) => a.key === sample!.key)).toBe(true);
    // Every action key is provider-scoped — never a foreign provider's key.
    for (const p of result.data.providers) {
      for (const a of p.actions) expect(a.key.startsWith(`${p.id}:`)).toBe(true);
      for (const t of p.triggers) expect(t.key.startsWith(`${p.id}:`)).toBe(true);
    }
  });

  describe("configFields grounding (AI-12D)", () => {
    it("includes every action's declared config fields in metadata order with required + type", () => {
      const result = getProviderCatalog();
      if (!result.ok) throw new Error("expected ok");
      for (const p of result.data.providers) {
        for (const a of p.actions) {
          const meta = listAllActionMetas().find((m) => m.key === a.key)!;
          expect(meta).toBeDefined();
          expect(a.configFields).toBeDefined();
          expect(a.configFields.map((f) => f.name)).toEqual(meta.fields.map((f) => f.name));
          expect(a.configFields.map((f) => f.type)).toEqual(meta.fields.map((f) => f.type));
          expect(a.configFields.map((f) => f.required)).toEqual(meta.fields.map((f) => f.required));
        }
      }
    });

    it("includes every trigger's declared config fields in metadata order (empty array for fields-less triggers)", () => {
      const result = getProviderCatalog();
      if (!result.ok) throw new Error("expected ok");
      for (const p of result.data.providers) {
        for (const t of p.triggers) {
          const meta = listAllTriggerMetas().find((m) => m.key === t.key)!;
          expect(meta).toBeDefined();
          expect(t.configFields).toBeDefined();
          expect(t.configFields.map((f) => f.name)).toEqual(meta.fields.map((f) => f.name));
        }
      }
    });

    it("uses the exact field names from slack:send_direct_message (userId, text required; threadTs optional) — pins the message-vs-text fix", () => {
      const result = getProviderCatalog();
      if (!result.ok) throw new Error("expected ok");
      const slack = result.data.providers.find((p) => p.id === "slack");
      // If Slack is not registered in this build, the assertion is moot.
      if (!slack) return;
      const dm = slack.actions.find((a) => a.key === "slack:send_direct_message");
      if (!dm) return;
      const required = dm.configFields.filter((f) => f.required).map((f) => f.name);
      const optional = dm.configFields.filter((f) => !f.required).map((f) => f.name);
      expect(required).toContain("userId");
      expect(required).toContain("text");
      // `message` is an OUTPUT, not a config key — the catalog must not expose it as a field.
      expect(dm.configFields.map((f) => f.name)).not.toContain("message");
      expect(optional).toContain("threadTs");
    });

    it("uses the exact field names from native:if_then_condition (input, operator required) — pins the field-vs-input fix", () => {
      const result = getProviderCatalog();
      if (!result.ok) throw new Error("expected ok");
      const native = result.data.providers.find((p) => p.id === "native");
      if (!native) return;
      const ifThen = native.actions.find((a) => a.key === "native:if_then_condition");
      if (!ifThen) return;
      const required = ifThen.configFields.filter((f) => f.required).map((f) => f.name);
      expect(required).toContain("input");
      expect(required).toContain("operator");
      // `field` is what the model invented for input — must never appear as a config key.
      expect(ifThen.configFields.map((f) => f.name)).not.toContain("field");
    });
  });
});

describe("getActionMeta", () => {
  it("returns the full view for a real action key", () => {
    const sample = listAllActionMetas()[0]!;
    const result = getActionMeta(sample.key);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.key).toBe(sample.key);
    expect(result.data.provider).toBe(sample.provider);
    expect(Array.isArray(result.data.fields)).toBe(true);
    expect(["low", "medium", "high"]).toContain(result.data.riskLevel);
  });

  it("returns INVALID_INPUT for a bare provider id (no colon)", () => {
    const result = getActionMeta("slack");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_INPUT");
  });

  it("returns NOT_FOUND for an unknown key (never invents a node)", () => {
    const result = getActionMeta("madeup:does_not_exist");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_FOUND");
  });

  it("preserves sensitive output flags", () => {
    const withSensitive = listAllActionMetas().find((m) => hasSensitiveOutput(m.outputs));
    expect(withSensitive).toBeDefined();
    const result = getActionMeta(withSensitive!.key);
    if (!result.ok) throw new Error("expected ok");
    expect(hasSensitiveOutput(result.data.outputs)).toBe(true);
  });
});

describe("getTriggerMeta", () => {
  it("returns the full view for a real trigger key", () => {
    const sample = listAllTriggerMetas()[0]!;
    const result = getTriggerMeta(sample.key);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.key).toBe(sample.key);
    expect(["webhook", "polling", "manual", "scheduled"]).toContain(result.data.activation);
    expect(Array.isArray(result.data.payloadShape)).toBe(true);
  });

  it("returns NOT_FOUND for an unknown trigger key", () => {
    const result = getTriggerMeta("madeup:nope");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_FOUND");
  });
});

describe("getNodeSchema", () => {
  it("returns an action schema view with required fields + risk + outputs", () => {
    const sample = listAllActionMetas()[0]!;
    const result = getNodeSchema(sample.key);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.kind).toBe("action");
    expect(result.data.outputs).toBeDefined();
    expect(result.data.payloadShape).toBeUndefined();
    const expectedRequired = sample.fields.filter((f) => f.required).map((f) => f.name);
    expect(result.data.requiredFieldNames).toEqual(expectedRequired);
  });

  it("returns a trigger schema view with payloadShape + default low risk", () => {
    const sample = listAllTriggerMetas()[0]!;
    const result = getNodeSchema(sample.key);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.kind).toBe("trigger");
    expect(result.data.payloadShape).toBeDefined();
    expect(result.data.risk).toEqual({
      riskLevel: "low",
      isDestructive: false,
      requiresConfirmation: false,
      riskDescription: null,
    });
  });

  it("captures optionsSource dependencies when present", () => {
    const withOptions = listAllActionMetas().find((m) =>
      m.fields.some((f) => f.optionsSource),
    );
    if (!withOptions) return; // registry has no optionsSource action — skip
    const result = getNodeSchema(withOptions.key);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.optionsSourceDeps.length).toBeGreaterThan(0);
    for (const dep of result.data.optionsSourceDeps) {
      expect(typeof dep.field).toBe("string");
      expect(typeof dep.optionsSource).toBe("string");
    }
  });

  it("returns NOT_FOUND for an unknown node type", () => {
    const result = getNodeSchema("madeup:nope");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_FOUND");
  });
});
