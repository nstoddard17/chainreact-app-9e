import { z } from "zod";
import { MOBILE_API_VERSION } from "./version";

/**
 * `GET /api/mobile/v1/app-config` — unauthenticated, cacheable client gate.
 *
 * `minSupportedVersion` drives the compatibility banner; `forceUpdate` is the
 * hard gate RESERVED for security-critical cases only (backward-compat policy
 * §18 of the foundation plan). Versions are plain semver strings compared
 * client-side with a semver comparator, never lexically.
 */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

export const MobileSemverSchema = z.string().regex(SEMVER_PATTERN, {
  message: "Expected a plain semver string like 1.2.3",
});

/** Maintenance banner state. `message` is pre-sanitized display copy or null. */
export const MobileMaintenanceSchema = z
  .object({
    active: z.boolean(),
    message: z.string().max(500).nullable(),
  })
  .strict();
export type MobileMaintenance = z.infer<typeof MobileMaintenanceSchema>;

export const MobileAppConfigSchema = z
  .object({
    apiVersion: z.literal(MOBILE_API_VERSION),
    /** Wire-shape generation of the contracts the server was built with. */
    contractsSchemaVersion: z.number().int().positive(),
    minSupportedVersion: MobileSemverSchema,
    latestVersion: MobileSemverSchema,
    forceUpdate: z.boolean(),
    maintenance: MobileMaintenanceSchema,
  })
  .strict();
export type MobileAppConfig = z.infer<typeof MobileAppConfigSchema>;
