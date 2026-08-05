/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — config-file parsing (Phase 3).
 *
 * The config file is a gitignored JSON file holding ONLY non-secret selection
 * data. Secrets (service-role keys, encryption keys) come exclusively from
 * env vars — parseConfig rejects any key that even looks secret-bearing.
 * Unknown keys are refused (fail closed: a typo must not silently relax a
 * safety field).
 */
import {
  expectedOwnerConfirmation,
  TransplantRefusalError,
  type ConflictStrategy,
  type TransplantConfig,
  type VerificationMode,
} from "./types";

const ALLOWED_KEYS = new Set([
  "sourceProjectRef",
  "destProjectRef",
  "sourceAccountId",
  "destAccountId",
  "destConnectedByUserId",
  "providerAllowlist",
  "sourceIntegrationIds",
  "conflictStrategy",
  "verificationMode",
  "sharedOAuthClientProviders",
  "acknowledgeRotationRiskProviders",
  "ownerConfirmation",
]);

const CONFLICT_STRATEGIES: readonly ConflictStrategy[] = [
  "fail",
  "skip",
  "replace-after-verification",
];
const VERIFICATION_MODES: readonly VerificationMode[] = ["strict", "lenient"];

/** Key names that must never appear in the config file (secrets live in env). */
const FORBIDDEN_KEY_PATTERN = /key|secret|token|password|credential/i;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_RE = /^[a-z0-9]{20}$/;

function fail(detail: string): never {
  throw new TransplantRefusalError("config_invalid", detail);
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim().length === 0) {
    fail(`config field '${key}' must be a non-empty string`);
  }
  return v.trim();
}

function optionalStringArray(
  obj: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || x.length === 0)) {
    fail(`config field '${key}' must be an array of non-empty strings`);
  }
  return v as string[];
}

export function parseConfig(raw: string): TransplantConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("config file is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fail("config file must contain a JSON object");
  }
  const obj = parsed as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      fail(`unknown config key '${key}' (fail closed — check for typos)`);
    }
  }
  // Defense-in-depth: a secret-shaped ALLOWED key can never exist, but scan
  // values for obviously pasted secrets anyway (long high-entropy strings are
  // fine to reject here: every legitimate field is a uuid/ref/short word).
  for (const [key, value] of Object.entries(obj)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      fail(`config key '${key}' looks secret-bearing; secrets must come from env vars`);
    }
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (typeof v === "string" && v.length > 200) {
        fail(`config value for '${key}' is implausibly long; secrets must come from env vars`);
      }
    }
  }

  const sourceProjectRef = requireString(obj, "sourceProjectRef");
  const destProjectRef = requireString(obj, "destProjectRef");
  if (!REF_RE.test(sourceProjectRef)) fail("sourceProjectRef is not a valid project ref");
  if (!REF_RE.test(destProjectRef)) fail("destProjectRef is not a valid project ref");

  const sourceAccountId = requireString(obj, "sourceAccountId");
  const destAccountId = requireString(obj, "destAccountId");
  const destConnectedByUserId = requireString(obj, "destConnectedByUserId");
  for (const [k, v] of [
    ["sourceAccountId", sourceAccountId],
    ["destAccountId", destAccountId],
    ["destConnectedByUserId", destConnectedByUserId],
  ] as const) {
    if (!UUID_RE.test(v)) fail(`${k} is not a valid uuid`);
  }

  const providerAllowlist = optionalStringArray(obj, "providerAllowlist");
  if (!providerAllowlist || providerAllowlist.length === 0) {
    fail("providerAllowlist must explicitly name at least one provider");
  }

  const sourceIntegrationIds = optionalStringArray(obj, "sourceIntegrationIds");
  if (sourceIntegrationIds) {
    for (const id of sourceIntegrationIds) {
      if (!UUID_RE.test(id)) fail("sourceIntegrationIds must contain uuids");
    }
  }

  const conflictStrategy = requireString(obj, "conflictStrategy") as ConflictStrategy;
  if (!CONFLICT_STRATEGIES.includes(conflictStrategy)) {
    fail(`conflictStrategy must be one of: ${CONFLICT_STRATEGIES.join(", ")}`);
  }

  const verificationMode = requireString(obj, "verificationMode") as VerificationMode;
  if (!VERIFICATION_MODES.includes(verificationMode)) {
    fail(`verificationMode must be one of: ${VERIFICATION_MODES.join(", ")}`);
  }

  const config: TransplantConfig = {
    sourceProjectRef,
    destProjectRef,
    sourceAccountId,
    destAccountId,
    destConnectedByUserId,
    providerAllowlist,
    sourceIntegrationIds,
    conflictStrategy,
    verificationMode,
    sharedOAuthClientProviders: optionalStringArray(obj, "sharedOAuthClientProviders"),
    acknowledgeRotationRiskProviders: optionalStringArray(
      obj,
      "acknowledgeRotationRiskProviders",
    ),
    ownerConfirmation: requireString(obj, "ownerConfirmation"),
  };

  const expected = expectedOwnerConfirmation(config);
  if (config.ownerConfirmation !== expected) {
    throw new TransplantRefusalError(
      "owner_confirmation_missing_or_wrong",
      `ownerConfirmation must be exactly: "${expected}"`,
    );
  }

  return config;
}

/** Placeholder template written by `--init` (obvious placeholders only). */
export const CONFIG_TEMPLATE = `{
  "sourceProjectRef": "REPLACE-WITH-PRODUCTION-PROJECT-REF",
  "destProjectRef": "REPLACE-WITH-DEV-PROJECT-REF",
  "sourceAccountId": "00000000-0000-0000-0000-000000000000",
  "destAccountId": "00000000-0000-0000-0000-000000000000",
  "destConnectedByUserId": "00000000-0000-0000-0000-000000000000",
  "providerAllowlist": ["gmail", "slack"],
  "conflictStrategy": "fail",
  "verificationMode": "strict",
  "sharedOAuthClientProviders": [],
  "acknowledgeRotationRiskProviders": [],
  "ownerConfirmation": "REPLACE — run once and the error message shows the exact required sentence"
}
`;
