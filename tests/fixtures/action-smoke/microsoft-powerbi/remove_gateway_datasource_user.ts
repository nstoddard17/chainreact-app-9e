import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:remove_gateway_datasource_user — destructive, NOT
 * live-safe.
 *
 * Revokes a real principal's gateway datasource access — dependent
 * dataset refreshes stop immediately, and there is no smoke-owned
 * gateway to scope the revocation to. Live certification is the
 * owner-run Phase 13 pass, paired with the add action (grant the test
 * user, then certify this removal).
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "remove_gateway_datasource_user",
  risk: "destructive",
  liveSafe: false,
  liveRisk: "destructive",
  config: {},
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
    "liveSafe:false destructive — revokes a real principal's datasource access (dependent refreshes stop). Certify manually in Phase 13 immediately after add_or_update_gateway_datasource_user grants the dedicated test user.",
});
