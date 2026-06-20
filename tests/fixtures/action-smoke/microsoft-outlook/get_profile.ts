import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook:get_profile — read-only mailbox profile (metadata only).
 *
 * Returns the connected mailbox's own identity (email / UPN / display name /
 * object id). Needs only a connected Outlook account; no selectors. The
 * report asserts only the terminal run status — never the email or name.
 * No message content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-outlook",
  action: "get_profile",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  requiredEnv: ["SMOKE_MICROSOFT_OUTLOOK_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Outlook mailbox profile (own identity); needs only SMOKE_MICROSOFT_OUTLOOK_CONNECTED.",
});
