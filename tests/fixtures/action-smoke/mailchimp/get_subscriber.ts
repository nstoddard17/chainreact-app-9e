import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:get_subscriber — read-only single subscriber lookup by email + audience.
 *
 * Both `audience_id` and `email` are overlaid from smoke env. Read-only; a
 * missing subscriber surfaces as the handler's NotFoundError (caller's branch),
 * but a valid smoke subscriber returns success. Report asserts terminal status.
 */
export default defineActionSmokeFixture({
  provider: "mailchimp",
  action: "get_subscriber",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    audience_id: "SMOKE_MAILCHIMP_AUDIENCE_ID",
    email: "SMOKE_MAILCHIMP_SUBSCRIBER_EMAIL",
  },
  requiredEnv: [
    "SMOKE_MAILCHIMP_CONNECTED",
    "SMOKE_MAILCHIMP_AUDIENCE_ID",
    "SMOKE_MAILCHIMP_SUBSCRIBER_EMAIL",
  ],
  expect: { outcome: "success" },
  notes: "Read-only Mailchimp subscriber lookup (email + audience from env); SKIPs without Mailchimp env.",
});
