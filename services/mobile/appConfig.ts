import {
  MobileAppConfigSchema,
  MOBILE_API_VERSION,
  MOBILE_CONTRACTS_SCHEMA_VERSION,
  type MobileAppConfig,
} from "@chainreact/mobile-contracts";
import {
  MOBILE_MIN_SUPPORTED_APP_VERSION,
  MOBILE_LATEST_APP_VERSION,
  MOBILE_FORCE_UPDATE,
  MOBILE_MAINTENANCE,
} from "@/core/mobile/appVersionPolicy";

/**
 * `GET /api/mobile/v1/app-config` payload (MOBILE-COMPANION-M1).
 *
 * Every value flows from exactly two version-owning modules — the contracts
 * package (api/schema versions) and `core/mobile/appVersionPolicy.ts`
 * (app-version + maintenance policy). Nothing here reads the environment;
 * nothing server-internal (refs, URLs, deployment ids, flags) can appear
 * because the strict contract rejects unknown fields at egress.
 */
export function buildMobileAppConfig(): MobileAppConfig {
  return MobileAppConfigSchema.parse({
    apiVersion: MOBILE_API_VERSION,
    contractsSchemaVersion: MOBILE_CONTRACTS_SCHEMA_VERSION,
    minSupportedVersion: MOBILE_MIN_SUPPORTED_APP_VERSION,
    latestVersion: MOBILE_LATEST_APP_VERSION,
    forceUpdate: MOBILE_FORCE_UPDATE,
    maintenance: MOBILE_MAINTENANCE,
  });
}
