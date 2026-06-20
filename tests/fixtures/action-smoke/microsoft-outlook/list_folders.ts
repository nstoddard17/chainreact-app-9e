import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook:list_folders — read-only mail folder list (metadata only).
 *
 * Lists top-level mail folders (id/displayName) on the connected mailbox.
 * Needs only a connected Outlook account; no selectors. The report asserts
 * only the terminal run status — never folder names. No message content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-outlook",
  action: "list_folders",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  requiredEnv: ["SMOKE_MICROSOFT_OUTLOOK_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Outlook folder list (metadata); needs only SMOKE_MICROSOFT_OUTLOOK_CONNECTED.",
});
