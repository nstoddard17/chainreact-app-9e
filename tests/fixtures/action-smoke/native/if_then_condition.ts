import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * native:if_then_condition — pure boolean branching (no OAuth, no provider
 * call). Genuinely EXECUTES through real V2 internals with NO credentials, so it
 * actually PASSes everywhere — including the full workflow-run modes (3/4).
 *
 * IMPORTANT terminal-node safety: the smoke harness runs every action as a
 * SINGLE terminal node (`manual.run → action`) with no outgoing edges. A
 * branching node that returns a non-null `branchTaken` (e.g. "true"/"false")
 * fails the engine with INVALID_BRANCH because there is no edge with that label.
 * So this fixture is authored to land on the NULL branch: the condition is
 * false AND `onFalse: "skip"` ⇒ `branchTaken: null` ⇒ no labeled edge required
 * ⇒ terminal-safe. The handler still fully executes (schema parse + real
 * condition evaluation); it just selects the skip path.
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
