import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:test_gateway_datasource_connection — read-only
 * connectivity probe (Get Datasource Status). No provider mutation; an
 * unreachable datasource is a RESULT ({online:false, errorCode}), still
 * outcome "success". Needs a real on-premises gateway + datasource ids in
 * env; SKIPs until provided.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "test_gateway_datasource_connection",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    gatewayId: "SMOKE_POWERBI_GATEWAY_ID",
    datasourceId: "SMOKE_POWERBI_GATEWAY_DATASOURCE_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_GATEWAY_ID",
    "SMOKE_POWERBI_GATEWAY_DATASOURCE_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only status probe against the smoke gateway datasource. Succeeds whether the source is online or not (connectivity is the output, not an error). Requires an on-prem gateway the connected user administers.",
});
