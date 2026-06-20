import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:list_labels — read-only label list (metadata only).
 *
 * Lists every label on the connected mailbox (id/name/type). Needs only a
 * connected Gmail account; no selectors. The report asserts only the
 * terminal run status — never label names or counts. No message content.
 */
export default defineActionSmokeFixture({
  provider: "gmail",
  action: "list_labels",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  requiredEnv: ["SMOKE_GMAIL_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Gmail label list (metadata); needs only SMOKE_GMAIL_CONNECTED.",
});
