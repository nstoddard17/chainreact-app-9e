/**
 * @jest-environment node
 *
 * CS-6E — production publication lock for the first MCP-catalog apps. Asserts,
 * against the REAL registry (not mocks), that Linear + Eden are published
 * (`isExperimental: false`) and therefore catalog-visible under the production
 * rule (`isEnabled && !isExperimental` — the same predicate `isCatalogVisible`
 * applies for non-experimental providers), that they stay MCP-backed + enabled,
 * and that Eden's three deferred publishing actions remain UNREGISTERED (hidden).
 */
import { getProvider, listProviders } from "@/integrations/_registry";
import { EDEN_ACTION_METAS } from "@/services/discovery/providers/eden";
import { getActionMeta } from "@/services/discovery/_registry";

/** Production Apps-catalog visibility rule for a non-experimental provider. */
const productionCatalogVisible = (p: { isEnabled: boolean; isExperimental: boolean }) =>
  p.isEnabled && !p.isExperimental;

describe("CS-6E — Linear + Eden published to the production catalog", () => {
  it.each(["linear", "eden"])("%s is enabled, non-experimental, MCP-backed, catalog-visible", (id) => {
    const p = getProvider(id);
    expect(p).toBeDefined();
    expect(p!.isEnabled).toBe(true);
    expect(p!.isExperimental).toBe(false);
    expect(p!.apiVersion).toBe("mcp");
    expect(p!.capabilities.actions).toBe(true);
    expect(productionCatalogVisible(p!)).toBe(true);
  });

  it("both appear among the catalog-visible providers in the real registry", () => {
    const visible = listProviders().filter(productionCatalogVisible).map((p) => p.id);
    expect(visible).toEqual(expect.arrayContaining(["linear", "eden"]));
  });

  it("Eden's 3 deferred publishing actions remain unregistered (hidden)", () => {
    const registered = new Set(EDEN_ACTION_METAS.map((m) => m.key));
    for (const k of ["eden:schedule_post", "eden:publish_post_now", "eden:update_scheduled_post"]) {
      expect(registered.has(k)).toBe(false);
      expect(getActionMeta(k)).toBeUndefined(); // discovery registry returns undefined for unknown keys
    }
  });

  it("does not accidentally publish an unrelated experimental provider", () => {
    // Every catalog-visible provider is genuinely non-experimental — the flip is
    // scoped, not a blanket reveal.
    for (const p of listProviders().filter(productionCatalogVisible)) {
      expect(p.isExperimental).toBe(false);
    }
  });
});
