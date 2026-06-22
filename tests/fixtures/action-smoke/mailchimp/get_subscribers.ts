import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:get_subscribers — read-only single-page audience member list.
 *
 * Lists members of one audience. `listId` is overlaid from the smoke audience
 * env; `count` is a small literal page size (schema clamps 1..100). Read-only;
 * report asserts only terminal status.
 */
export default defineActionSmokeFixture({
  provider: "mailchimp",
  action: "get_subscribers",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { count: 10 },
  configFromEnv: { listId: "SMOKE_MAILCHIMP_AUDIENCE_ID" },
  requiredEnv: ["SMOKE_MAILCHIMP_CONNECTED", "SMOKE_MAILCHIMP_AUDIENCE_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Mailchimp audience member list (one page, max 10); SKIPs without Mailchimp env.",
});
