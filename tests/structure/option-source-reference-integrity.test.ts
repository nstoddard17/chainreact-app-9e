/**
 * @jest-environment node
 *
 * V2-READY-17 — option-source reference integrity (structural, no-DB).
 *
 * Every field across all action + trigger metas that names a dynamic
 * `optionsSource` must resolve to a REGISTERED option source, or the builder
 * ships a permanently-empty dropdown — the option-source analogue of the native
 * delay/schedule metadata drift fixed in V2-READY-14/16.
 *
 * The registry's own module-load guards already reject bad-format / duplicate /
 * wrong-provider ids at REGISTRATION time. This closes the missing reverse
 * direction (referenced ⊆ registered) and also checks cascade wiring: a field's
 * `dependsOn` must cover its resolver's `requiredDeps`, or the dropdown
 * short-circuits with MISSING_DEPENDENCY at the route and never loads.
 *
 * Pure module-load singletons — no DB, no mocks.
 */
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import { getOptionsResolver } from "@/services/options/_registry";

function dependsOnList(
  dependsOn: string | readonly string[] | undefined,
): string[] {
  if (dependsOn === undefined) return [];
  return Array.isArray(dependsOn) ? [...dependsOn] : [dependsOn as string];
}

interface FieldRef {
  metaKey: string;
  fieldName: string;
  optionsSource: string;
  dependsOn: string[];
}

function collectOptionSourceFields(): FieldRef[] {
  const refs: FieldRef[] = [];
  const metas = [...listAllActionMetas(), ...listAllTriggerMetas()];
  for (const meta of metas) {
    for (const field of meta.fields) {
      if (
        typeof field.optionsSource === "string" &&
        field.optionsSource.length > 0
      ) {
        refs.push({
          metaKey: meta.key,
          fieldName: field.name,
          optionsSource: field.optionsSource,
          dependsOn: dependsOnList(field.dependsOn),
        });
      }
      // RESOLVERS-3 — `itemFields` sub-fields can bind an option source too
      // (a picker for a provider id INSIDE an object-list row / object). They
      // reach the exact same resolver + route, so an unregistered source or
      // an uncovered `requiredDeps` ships the same permanently-dead dropdown
      // — walk them under the same guards.
      for (const sub of field.itemFields ?? []) {
        if (typeof sub.optionsSource === "string" && sub.optionsSource.length > 0) {
          refs.push({
            metaKey: meta.key,
            fieldName: `${field.name}[].${sub.name}`,
            optionsSource: sub.optionsSource,
            dependsOn: dependsOnList(sub.dependsOn),
          });
        }
      }
    }
  }
  return refs;
}

describe("option-source reference integrity", () => {
  const refs = collectOptionSourceFields();

  it("the meta walk finds optionsSource fields (sanity — registries loaded, walk non-empty)", () => {
    expect(refs.length).toBeGreaterThan(0);
  });

  it("every field optionsSource resolves to a registered option source (no broken dropdowns)", () => {
    const broken = refs
      .filter((r) => getOptionsResolver(r.optionsSource) === undefined)
      .map((r) => `${r.metaKey}.${r.fieldName} -> ${r.optionsSource}`);
    expect(broken).toEqual([]);
  });

  it("every field's dependsOn covers its resolver's requiredDeps (cascade wiring)", () => {
    const unwired: string[] = [];
    for (const r of refs) {
      const resolver = getOptionsResolver(r.optionsSource);
      if (!resolver) continue; // already reported by the previous test
      const required = resolver.requiredDeps ?? [];
      const missing = required.filter((dep) => !r.dependsOn.includes(dep));
      if (missing.length > 0) {
        unwired.push(
          `${r.metaKey}.${r.fieldName} -> ${r.optionsSource} missing dependsOn: [${missing.join(", ")}]`,
        );
      }
    }
    expect(unwired).toEqual([]);
  });

  /*
   * NOT GUARDED HERE ON PURPOSE — "every dependsOn names a real sibling field".
   *
   * A dependsOn pointing at a field the node does not have would be a
   * permanently-empty dropdown (the route short-circuits MISSING_DEPENDENCY on
   * every keystroke, with no error to explain it), and it is a live hazard:
   * Stripe lists payment methods only per-customer, but only create_subscription
   * HAS a customer field, so wiring update_subscription's picker to
   * `dependsOn: "customerId"` would look correct and ship a dead dropdown
   * (RESOLVERS-2 needed a subscriptionId-keyed variant instead).
   *
   * It needs no test: the ActionMeta/TriggerMeta Zod contract already rejects it
   * at MODULE LOAD — "Field 'default_payment_method' depends on unknown field
   * 'customerId'." That is strictly stronger than a structure test (it fails for
   * every importer, not just this suite), and a test asserting it could never
   * fail — the registry throws before the suite runs. Verified by deliberately
   * breaking updateSubscription.meta.ts and observing the load-time ZodError.
   */
});
