import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * native:format_transformer — a pure, no-OAuth transform action. This is the
 * one fixture in the initial set that actually EXECUTES end-to-end through real
 * V2 internals (strict resolver → real registered handler) with NO credentials,
 * so it proves the execution path works, not just the inventory.
 *
 * Markdown bold (`**x**`) → HTML (`<strong>x</strong>`); a real run succeeds.
 */
export default defineActionSmokeFixture({
  provider: "native",
  action: "format_transformer",
  risk: "read",
  config: {
    content: "**hello smoke**",
    sourceFormat: "markdown",
    targetFormat: "html",
  },
  // Pure local transform — no external boundary at all, so it is trivially
  // liveSafe and always PASSes.
  liveSafe: true,
  liveRisk: "read",
  expect: { outcome: "success" },
  // CERTIFIED LIVE_PASS (2026-07-06). Previously the intentional always-run baseline
  // canary, now certified per Marcus's decision: no real registered native action
  // stays uncertified just to serve as a harness baseline. It is certified like the
  // other 4 native actions, so a default sweep CERT-SKIPs it. The always-run canary
  // role is preserved WITHOUT leaving it NOT_RUN: SMOKE_RERUN_PASSED=1 force-runs any
  // certified native fixture through the real engine (strict resolver -> registered
  // handler, zero credentials) whenever the operator wants an execution-path proof.
  notes: "Pure deterministic transform; runs anywhere with no connected provider. Certified LIVE_PASS; re-run the real end-to-end path any time with SMOKE_RERUN_PASSED=1 (the baseline canary path).",
});
