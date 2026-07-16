import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:add_or_update_gateway_datasource_user — NOT live-safe.
 *
 * Grants a real principal access to a real gateway data source — an ACL
 * change on shared infrastructure that outlives the run (no smoke-owned
 * gateway exists to scope it to). Live certification is the owner-run
 * Phase 13 pass (grant SMOKE_POWERBI_TEST_USER_EMAIL, verify, remove).
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "add_or_update_gateway_datasource_user",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    accessRight: "Read",
  },
  configFromEnv: {
    gatewayId: "SMOKE_POWERBI_GATEWAY_ID",
    datasourceId: "SMOKE_POWERBI_GATEWAY_DATASOURCE_ID",
    principalEmail: "SMOKE_POWERBI_TEST_USER_EMAIL",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_GATEWAY_ID",
    "SMOKE_POWERBI_GATEWAY_DATASOURCE_ID",
    "SMOKE_POWERBI_TEST_USER_EMAIL",
  ],
  expect: { outcome: "success" },
  notes:
    "liveSafe:false — grants datasource access to a real principal on shared gateway infra. Certify manually in Phase 13: grant the dedicated test user Read, verify via the users list, then remove.",
});
