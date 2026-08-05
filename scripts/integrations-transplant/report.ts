/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — deterministic plan fingerprint +
 * report serialization guard.
 */
import { createHash } from "node:crypto";
import { assertNoSecretMaterial } from "./redact";
import type { TransplantConfig, TransplantReport } from "./types";

export interface FingerprintItem {
  sourceIntegrationId: string;
  provider: string;
  intendedAction: string;
  conflict: string;
}

/**
 * Deterministic fingerprint binding an apply run to the reviewed dry-run:
 * covers environment identity, selection config, and the per-item plan. Any
 * change (different rows, different conflict picture, different strategy)
 * changes the fingerprint and forces a fresh dry-run.
 */
export function computePlanFingerprint(
  config: TransplantConfig,
  items: readonly FingerprintItem[],
): string {
  const stable = JSON.stringify({
    v: 1,
    sourceProjectRef: config.sourceProjectRef,
    destProjectRef: config.destProjectRef,
    sourceAccountId: config.sourceAccountId,
    destAccountId: config.destAccountId,
    destConnectedByUserId: config.destConnectedByUserId,
    providerAllowlist: [...config.providerAllowlist].sort(),
    sourceIntegrationIds: config.sourceIntegrationIds
      ? [...config.sourceIntegrationIds].sort()
      : null,
    conflictStrategy: config.conflictStrategy,
    verificationMode: config.verificationMode,
    sharedOAuthClientProviders: [...(config.sharedOAuthClientProviders ?? [])].sort(),
    acknowledgeRotationRiskProviders: [
      ...(config.acknowledgeRotationRiskProviders ?? []),
    ].sort(),
    items: [...items].sort((a, b) =>
      a.sourceIntegrationId.localeCompare(b.sourceIntegrationId),
    ),
  });
  return createHash("sha256").update(stable, "utf8").digest("hex");
}

/**
 * Serialize a report AFTER proving it contains none of the sensitive values
 * observed during the run. Throws (without echoing anything) on violation.
 */
export function serializeReport(
  report: TransplantReport,
  sensitiveValues: readonly (string | null | undefined)[],
): string {
  const serialized = JSON.stringify(report, null, 2);
  assertNoSecretMaterial(serialized, sensitiveValues);
  return serialized;
}
