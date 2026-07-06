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
  // liveSafe and serves as the live-mode baseline (always PASSes).
  liveSafe: true,
  liveRisk: "read",
  expect: { outcome: "success" },
  // INTENTIONALLY UNCERTIFIED (LIVE_NOT_RUN) — confirmed 2026-07-06. This is the
  // one always-run action-smoke canary: it stays uncertified so a default `smoke
  // actions` sweep still EXECUTES at least one real end-to-end run (strict resolver
  // -> registered handler) with zero credentials, proving the harness + execution
  // path itself works every sweep. Certifying it would make it skippable
  // (shouldCertifiedSkip), removing that signal, and a replacement would mean a
  // fake registry-only baseline action. So the design REMAINS: 4 native actions
  // certified LIVE_PASS + this one documented always-run baseline. The
  // native-coverage pin test allow-lists exactly this key as the baseline, so the
  // NOT_RUN is an explicit intentional status, never a silent coverage gap.
  notes: "Pure deterministic transform; runs anywhere with no connected provider. Intentional always-run baseline (LIVE_NOT_RUN by design; see native-coverage.test.ts).",
});
