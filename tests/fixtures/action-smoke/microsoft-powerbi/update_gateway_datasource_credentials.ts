import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:update_gateway_datasource_credentials — NOT live-safe.
 *
 * Replacing datasource credentials on a shared on-premises gateway breaks
 * every dependent dataset refresh if the smoke placeholder value lands —
 * there is no safe throwaway target without a dedicated smoke gateway +
 * datasource. Live certification is the owner-run Phase 13 pass; unit
 * tests cover the encryption + PATCH wire shape offline.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "update_gateway_datasource_credentials",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    credentialType: "Basic",
    username: "smoke-user",
    password: "smoke-placeholder-password",
    privacyLevel: "Organizational",
  },
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
    "liveSafe:false — overwrites the stored credentials of a real gateway datasource (breaks dependent refreshes if wrong). Certify manually in Phase 13 against a dedicated smoke datasource with restorable credentials.",
});
