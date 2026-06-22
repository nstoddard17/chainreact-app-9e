import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * native:delay — pure in-process sleep (no OAuth, no provider call). Like
 * `format_transformer`, this fixture genuinely EXECUTES end-to-end through real
 * V2 internals (strict resolver → real registered handler) with NO credentials,
 * so it actually PASSes everywhere (CI included), not just SKIPs.
 *
 * `seconds: 1` is the schema minimum — keeps the smoke fast while still
 * exercising the real `setTimeout` path and the `{ delayedSeconds, startedAt,
 * completedAt }` output.
 */
export default defineActionSmokeFixture({
  provider: "native",
  action: "delay",
  risk: "read",
  config: {
    seconds: 1,
  },
  // Pure local timer — no external boundary, trivially liveSafe.
  liveSafe: true,
  liveRisk: "read",
  expect: { outcome: "success" },
  notes: "Pure 1s in-process delay; runs anywhere with no connected provider.",
});
