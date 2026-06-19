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
  expect: { outcome: "success" },
  notes: "Pure deterministic transform; runs anywhere with no connected provider.",
});
