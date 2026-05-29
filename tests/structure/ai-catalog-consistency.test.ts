/**
 * @jest-environment node
 *
 * Structural audit: the AI planner catalog ⊆ the VALIDATED registry, and every
 * catalog key is well-formed (Slice 4.PROVIDER-CATALOG-INTEGRITY-1).
 *
 * Complements `discovery-meta-coverage.test.ts` (which enforces handler↔meta
 * 1:1 for covered providers). This file guards the AI surface specifically:
 *   - every action/trigger the planner can see resolves via the SAME registry
 *     lookups `validateWorkflowPatch` / `checks.ts` use, so the planner can
 *     never be shown a node that validation would reject (catalog ⊆ registry);
 *   - no key is malformed or double-qualified (e.g. `gmail:gmail:new_email`),
 *     which is the class of bug behind the live UNKNOWN_TRIGGER failure;
 *   - the supported Gmail new-email trigger IS exposed (regression guard).
 */
import { getProviderCatalog } from "@/services/ai/tools/providerCatalog";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";

const result = getProviderCatalog();
if (!result.ok) {
  throw new Error("getProviderCatalog() failed to build — catalog is unusable.");
}
const catalog = result.data;

/** A well-formed `provider:type` key has exactly one colon, prefixed by the provider id. */
function expectWellFormedKey(key: string, providerId: string): void {
  expect((key.match(/:/g) ?? []).length).toBe(1); // never `provider:provider:type`
  expect(key.startsWith(`${providerId}:`)).toBe(true);
  expect(key.slice(providerId.length + 1).length).toBeGreaterThan(0);
}

describe("AI planner catalog consistency", () => {
  it("builds successfully and is non-empty", () => {
    expect(catalog.providers.length).toBeGreaterThan(0);
  });

  it("every catalog ACTION key resolves in the validated registry and is well-formed", () => {
    for (const p of catalog.providers) {
      for (const a of p.actions) {
        expectWellFormedKey(a.key, p.id);
        // The SAME lookup checks.ts uses — proves catalog ⊆ validated registry.
        expect(getActionMeta(a.key)).toBeTruthy();
      }
    }
  });

  it("every catalog TRIGGER key resolves in the validated registry and is well-formed", () => {
    for (const p of catalog.providers) {
      for (const t of p.triggers) {
        expectWellFormedKey(t.key, p.id);
        expect(getTriggerMeta(t.key)).toBeTruthy();
      }
    }
  });

  it("no catalog key is double-qualified (e.g. gmail:gmail:new_email)", () => {
    const keys = catalog.providers.flatMap((p) => [
      ...p.actions.map((a) => a.key),
      ...p.triggers.map((t) => t.key),
    ]);
    for (const key of keys) {
      const provider = key.split(":")[0]!;
      expect(key.startsWith(`${provider}:${provider}:`)).toBe(false);
    }
  });

  it("exposes the supported Gmail new-email trigger (the live-failure node is in the catalog)", () => {
    const gmail = catalog.providers.find((p) => p.id === "gmail");
    expect(gmail).toBeDefined();
    expect(gmail!.triggers.some((t) => t.key === "gmail:new_email")).toBe(true);
    expect(getTriggerMeta("gmail:new_email")).toBeTruthy();
  });
});
