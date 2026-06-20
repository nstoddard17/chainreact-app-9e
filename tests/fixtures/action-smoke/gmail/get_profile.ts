import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:get_profile — read-only mailbox profile (metadata only).
 *
 * Returns the connected mailbox's own email + total message/thread counts +
 * historyId. Needs only a connected Gmail account; no selectors. The report
 * asserts only the terminal run status — never the email address or counts.
 * No message content.
 */
export default defineActionSmokeFixture({
  provider: "gmail",
  action: "get_profile",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  requiredEnv: ["SMOKE_GMAIL_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Gmail mailbox profile (counts + own email); needs only SMOKE_GMAIL_CONNECTED.",
});
