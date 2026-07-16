import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:create_gateway_datasource — NOT live-safe.
 *
 * Creating a gateway datasource requires a REAL on-premises data gateway
 * (gateway-admin rights) plus a reachable backing data source for the
 * credentials to validate against — infrastructure a smoke run cannot
 * assume. The action also persists encrypted credentials on shared
 * gateway infrastructure. Live certification happens in the owner-run
 * Phase 13 pass with a dedicated gateway; unit tests cover the
 * encryption + wire shape offline.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "create_gateway_datasource",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    datasourceName: "crsmoke datasource",
    datasourceType: "SQL",
    server: "smoke-server",
    database: "smoke-db",
    credentialType: "Basic",
    username: "smoke-user",
    password: "smoke-placeholder-password",
    privacyLevel: "Organizational",
  },
  configFromEnv: {
    gatewayId: "SMOKE_POWERBI_GATEWAY_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_GATEWAY_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "liveSafe:false — needs a real on-prem gateway (admin rights) and a reachable data source; creates a datasource with stored credentials on shared gateway infra. Certify manually in Phase 13 with a dedicated smoke gateway, then delete the datasource.",
});
