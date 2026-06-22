import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * native:router — pure N-label branching (no OAuth, no provider call).
 * Genuinely EXECUTES through real V2 internals with NO credentials, so it
 * actually PASSes everywhere — including the full workflow-run modes (3/4).
 *
 * IMPORTANT terminal-node safety: the smoke harness runs every action as a
 * SINGLE terminal node (`manual.run → action`) with no outgoing edges. A router
 * that returns a non-null `branchTaken` (a matched/default label) fails the
 * engine with INVALID_BRANCH because there is no edge with that label. So this
 * fixture is authored to land on the NULL branch: the single route does NOT
 * match and there is NO `defaultRoute` ⇒ `branchTaken: null` ⇒ no labeled edge
 * required ⇒ terminal-safe. The handler still fully executes (schema parse +
 * real route evaluation); it just selects no route.
 *
 * Route `"smoke" equals "different"` is false → no match → no defaultRoute →
 * branchTaken null. A real run succeeds and returns `{ matched:false, ... }`.
 */
export default defineActionSmokeFixture({
  provider: "native",
  action: "router",
  risk: "read",
  config: {
    routes: [
      {
        label: "never",
        condition: { input: "smoke", operator: "equals", value: "different" },
      },
    ],
    // No defaultRoute on purpose → no-match yields branchTaken null (terminal-safe).
  },
  // Pure local route evaluation — no external boundary, trivially liveSafe.
  liveSafe: true,
  liveRisk: "read",
  expect: { outcome: "success" },
  notes:
    "Pure deterministic router (no route matches, no default → null branch); terminal-safe, runs anywhere with no connected provider.",
});
