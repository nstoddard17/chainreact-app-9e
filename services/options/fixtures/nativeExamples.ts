import {
  OptionsResolverError,
  type OptionsResolver,
} from "../types";

/**
 * Static `native:examples` fixture resolver — Slice 3.30.
 *
 * Exists ONLY so the option-source API skeleton (route + registry +
 * client) can be tested end-to-end without dragging in a real provider
 * (OAuth token decryption, provider SDK, scope handling). The first
 * real provider resolver (`slack:channels`) lands in Slice 3.32; this
 * fixture stays around so future structural / smoke tests can
 * exercise the path without provider mocks.
 *
 * Behavior:
 *   - `requiresIntegration: false` — no integration lookup in the
 *     route; `ctx.integration` is `null`.
 *   - `requiredDeps: ["category"]` — the route validates that
 *     `?deps[category]=<value>` is present before calling resolve;
 *     enables tests of the `MISSING_DEPENDENCY` path against a real
 *     resolver, not a synthetic stub. Production resolvers may or
 *     may not declare `requiredDeps`; this fixture declares one to
 *     give the test surface a deterministic dependency to assert.
 *   - Returns a small canned set filtered by:
 *     - `category` (required) — restricts the list to items in that
 *       category. Throws `OptionsResolverError("PROVIDER_ERROR", …)`
 *       for the special category `"throw"`, so tests can drive the
 *       PROVIDER_ERROR path through a real resolver.
 *     - `q` (optional) — case-insensitive substring match on label.
 *   - `hasMore` is always `false`; the fixture's canned set is tiny.
 *
 * The "throw"-category branch is the only branch that throws — any
 * other unexpected input returns an empty `items` array, never
 * crashes.
 */

const SAMPLE_ITEMS: ReadonlyArray<{
  category: string;
  value: string;
  label: string;
  description?: string;
}> = [
  { category: "fruit", value: "apple", label: "Apple", description: "Pomaceous." },
  { category: "fruit", value: "banana", label: "Banana", description: "Yellow." },
  { category: "fruit", value: "cherry", label: "Cherry" },
  { category: "color", value: "red", label: "Red" },
  { category: "color", value: "green", label: "Green" },
  { category: "color", value: "blue", label: "Blue" },
];

export const nativeExamplesResolver: OptionsResolver = {
  source: "native:examples",
  provider: "native",
  requiresIntegration: false,
  requiredDeps: ["category"],
  async resolve(ctx) {
    const category = ctx.deps["category"];
    if (category === "throw") {
      // Test surface for the PROVIDER_ERROR mapping. Production
      // resolvers throw `OptionsResolverError("PROVIDER_ERROR", …)`
      // with a sanitized caller-friendly message; this fixture
      // mirrors that contract.
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load examples. Try again.",
      );
    }
    const inCategory = SAMPLE_ITEMS.filter((it) => it.category === category);
    const lowerQ = ctx.q.toLowerCase();
    const filtered = lowerQ.length > 0
      ? inCategory.filter((it) => it.label.toLowerCase().includes(lowerQ))
      : inCategory;
    return {
      items: filtered.map(({ value, label, description }) =>
        description !== undefined
          ? { value, label, description }
          : { value, label },
      ),
      hasMore: false,
    };
  },
};
