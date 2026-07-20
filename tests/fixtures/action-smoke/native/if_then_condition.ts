import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * native:if_then_condition — pure boolean branching (no OAuth, no provider
 * call). Genuinely EXECUTES through real V2 internals with NO credentials, so it
 * actually PASSes everywhere — including the full workflow-run modes (3/4).
 *
 * Branch wiring (BRANCH-ENT-1): the harness's workflow mode now wires one
 * format_transformer sink per RETURNABLE route label (here: "true", since
 * `onFalse: "skip"` removes "false" from the vocabulary), so the graph passes
 * the shared branch-wiring readiness rule. This fixture still lands on the
 * NULL branch (condition false + skip ⇒ `branchTaken: null`), so the sink is
 * persisted `skipped` — the handler fully executes (schema parse + real
 * condition evaluation) and the run succeeds.
 *
 * `"smoke" equals "different"` → conditionMet false → onFalse "skip" →
 * branchTaken null. A real run succeeds.
 */
export default defineActionSmokeFixture({
  provider: "native",
  action: "if_then_condition",
  risk: "read",
  config: {
    input: "smoke",
    operator: "equals",
    value: "different",
    onFalse: "skip",
  },
  // Pure local condition evaluation — no external boundary, trivially liveSafe.
  liveSafe: true,
  liveRisk: "read",
  expect: { outcome: "success" },
  notes:
    "Pure deterministic condition (false → skip → null branch); terminal-safe, runs anywhere with no connected provider.",
});
