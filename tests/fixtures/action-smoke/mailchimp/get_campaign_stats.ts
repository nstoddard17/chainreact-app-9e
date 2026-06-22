import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:get_campaign_stats — read-only single-record campaign report read.
 *
 * Reads `/reports/{campaignId}`. `campaignId` is overlaid from smoke env (must
 * reference a SENT campaign — unsent campaigns 404). Read-only; report asserts
 * only terminal status.
 */
export default defineActionSmokeFixture({
  provider: "mailchimp",
  action: "get_campaign_stats",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { campaignId: "SMOKE_MAILCHIMP_CAMPAIGN_ID" },
  requiredEnv: ["SMOKE_MAILCHIMP_CONNECTED", "SMOKE_MAILCHIMP_CAMPAIGN_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Mailchimp campaign report read (sent campaign id from env); SKIPs without Mailchimp env.",
});
