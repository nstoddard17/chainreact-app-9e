import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * native:router — pure N-label branching (no OAuth, no provider call).
 * Genuinely EXECUTES through real V2 internals with NO credentials, so it
 * actually PASSes everywhere — including the full workflow-run modes (3/4).
 *
 * Branch wiring (BRANCH-ENT-1): the harness's workflow mode now wires one
 * format_transformer sink per RETURNABLE route label (here: "never"), so the
 * graph passes the shared branch-wiring readiness rule. This fixture still
 * lands on the NULL branch (the single route does not match and there is no
 * `defaultRoute` ⇒ `branchTaken: null`), so the sink is persisted `skipped` —
 * the handler fully executes (schema parse + real route evaluation) and the
 * run succeeds.
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
