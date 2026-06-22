import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:get_campaign — read-only single-record campaign read.
 *
 * Reads `/campaigns/{campaignId}`. `campaignId` is overlaid from smoke env.
 * Read-only; report asserts only terminal status.
 */
export default defineActionSmokeFixture({
  provider: "mailchimp",
  action: "get_campaign",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { campaignId: "SMOKE_MAILCHIMP_CAMPAIGN_ID" },
  requiredEnv: ["SMOKE_MAILCHIMP_CONNECTED", "SMOKE_MAILCHIMP_CAMPAIGN_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Mailchimp campaign read (campaign id from env); SKIPs without Mailchimp env.",
});
