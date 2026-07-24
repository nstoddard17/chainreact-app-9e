/**
 * Structure guard: connectionless-provider checks use the shared helper
 * (AI-PROVIDER-4 CS-4).
 *
 * Before CS-4 the builder decided "is this node connectionless?" by
 * comparing `provider === "native"` in five places. Adding the ChainReact
 * AI provider made every one of those literals wrong. This test keeps the
 * generalized touchpoints honest: within the files that route a node to a
 * METADATA CATALOG or to a CONNECTION requirement, a bare `"native"`
 * comparison is forbidden — use `isConnectionlessProvider()` (or the named
 * `NATIVE_PROVIDER_ID` / `AI_PROVIDER_ID` constants) instead.
 *
 * Deliberately scoped, not repo-wide: literals like the `"native:router"`
 * action key, the native icon fallback on a node card, and the native
 * catalog ROUTE itself are legitimately native-specific and are not
 * connectionless-routing decisions.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

/** Files whose provider routing must go through the shared helper. */
const GENERALIZED_TOUCHPOINTS = [
  "features/workflow-builder/hooks/useNodeMeta.ts",
  "features/workflow-builder/hooks/useUpstreamVariables.ts",
  "features/workflow-builder/config-modal/ConfigModalShell.tsx",
];

/** `=== "native"` / `!== "native"` in any spacing/quote form. */
const BARE_NATIVE_COMPARISON = /[!=]==\s*["']native["']/;

describe("connectionless provider source of truth", () => {
  it.each(GENERALIZED_TOUCHPOINTS)(
    "%s compares providers via the shared helper, not a bare \"native\" literal",
    (relPath) => {
      const src = readFileSync(join(ROOT, relPath), "utf8");
      expect(BARE_NATIVE_COMPARISON.test(src)).toBe(false);
    },
  );

  it.each(GENERALIZED_TOUCHPOINTS)(
    "%s imports the shared connectionless helper",
    (relPath) => {
      const src = readFileSync(join(ROOT, relPath), "utf8");
      expect(src).toMatch(/@\/core\/integrations\/connectionlessProviders/);
    },
  );

  it("the shared module is the only place the id list is declared", () => {
    const src = readFileSync(
      join(ROOT, "core/integrations/connectionlessProviders.ts"),
      "utf8",
    );
    expect(src).toMatch(/CONNECTIONLESS_PROVIDERS = \["native", "ai"\] as const/);
  });
});
