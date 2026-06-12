import {
  credentialSharingForProvider,
  type CredentialSharing,
} from "@/core/integrations/credentialSharing";

/**
 * Pure connection-diagnosis derivation (Slice 4.MCP-STAGE-2B-2, CS-1).
 *
 * The single source of truth for "given the stored integration state + the
 * provider manifest, what is the connection's usability status." It is the
 * derivation layer behind the future `diagnose_integration_connection`
 * diagnostic route (CS-2) — designed in
 * docs/slices/phase-4/mcp-stage-2b2-integration-connection-plan.md §7.
 *
 * Hard constraints (this module is deliberately inert):
 *   - FRAMEWORK-FREE + DB-FREE. No `next/*`, no Supabase, no repositories.
 *   - No token decryption, no provider API calls, no `process.env`, no `Date.now()`
 *     (the caller passes `now` so the function is DETERMINISTIC).
 *   - NO-LEAK BY CONSTRUCTION: the row input type
 *     (`ConnectionDiagnosisRow`) exposes ONLY the three non-secret fields the
 *     derivation reads. Structural typing means a full integration record can be
 *     passed, but this function can only ever read `scopes`,
 *     `accessTokenExpiresAt`, and `disconnectedAt` — token blobs,
 *     `connectedByUserId`, `providerAccountId`, `displayName`, and
 *     `accountMetadata` are never touched and never reach the result.
 *
 * V2 has no stored per-integration health column (see
 * services/ai/tools/integrations.ts:13), so every field here is DERIVED at call
 * time, not read from a status record.
 */

/** Closed connection-status taxonomy (plan §7 precedence order). */
export type ConnectionStatus =
  | "PROVIDER_UNKNOWN"
  | "NO_ACCOUNT_ACCESS"
  | "NOT_WORKFLOW_OWNER"
  | "DISCONNECTED"
  | "PROVIDER_DISABLED"
  | "RECONNECT_REQUIRED"
  | "TOKEN_EXPIRED"
  | "MISSING_SCOPES"
  | "CONNECTED";

/**
 * Authz/preclassification decided UPSTREAM by the route (CS-2) — not derivable
 * from a row. When present, it short-circuits the ladder so no row/manifest fact
 * is inspected (the route already declined to fetch the row in these cases).
 */
export type ConnectionPrecondition = "NO_ACCOUNT_ACCESS" | "NOT_WORKFLOW_OWNER";

/**
 * Minimal, non-secret manifest facts the derivation needs. The route maps a
 * `ProviderManifest` (integrations/_registry.getProvider) → this. `null` means
 * the provider id is not registered → `PROVIDER_UNKNOWN`.
 */
export interface ConnectionDiagnosisManifest {
  /** Provider id — used only to classify credential sharing. */
  readonly id: string;
  /** `manifest.isEnabled`. */
  readonly isEnabled: boolean;
  /** `manifest.refreshable`. */
  readonly refreshable: boolean;
  /** `manifest.scopes.required` — the only source of truth for required scopes. */
  readonly requiredScopes: readonly string[];
}

/**
 * Narrow projection of the active integration row. ONLY these three fields are
 * read; the route maps its `IntegrationRecord` down to this. `null` means no
 * active row was resolved (→ `DISCONNECTED`).
 */
export interface ConnectionDiagnosisRow {
  /** Granted scopes on the connection. Compared against `requiredScopes`. */
  readonly scopes: readonly string[];
  /** ISO-8601 access-token expiry, or null when the provider exposes no expiry. */
  readonly accessTokenExpiresAt: string | null;
  /** ISO-8601 soft-disconnect timestamp, or null when active. */
  readonly disconnectedAt: string | null;
}

/** The sanitized, derived result. Enums / counts / booleans / public scope names only. */
export interface ConnectionDiagnosis {
  readonly status: ConnectionStatus;
  /** `manifest.isEnabled` (false when manifest unknown). */
  readonly providerEnabled: boolean;
  /** `manifest.refreshable` (false when manifest unknown). */
  readonly refreshable: boolean;
  /** Credential class for the provider (`personal` default when unknown). */
  readonly credentialClass: CredentialSharing;
  /**
   * Whether the access token is past expiry. `null` when there is no active row
   * OR the provider exposes no expiry (`accessTokenExpiresAt === null`). The
   * exact expiry instant is intentionally NOT returned — only this boolean.
   */
  readonly tokenExpired: boolean | null;
  /** True when no required scope is missing (only meaningful with an active row). */
  readonly scopesSatisfied: boolean;
  /** Count of required scopes not present on the connection. */
  readonly missingScopeCount: number;
  /**
   * NAMES of the missing required scopes (the gap only — never the full granted
   * set). Plan Q7-approved: required scopes are provider-public constants.
   */
  readonly missingScopes: readonly string[];
  /** Active connections for (account, provider) — echoed from the caller. */
  readonly activeConnectionCount: number;
  /** True when an active (non-disconnected) row was resolved. */
  readonly hasActiveRow: boolean;
}

function isExpired(accessTokenExpiresAt: string | null, now: Date): boolean | null {
  if (accessTokenExpiresAt === null) return null; // provider exposes no expiry → unknown
  const expMs = Date.parse(accessTokenExpiresAt);
  if (Number.isNaN(expMs)) return null; // unparseable → treat as unknown, never throw
  return expMs <= now.getTime();
}

function scopeGap(
  requiredScopes: readonly string[],
  granted: readonly string[],
): readonly string[] {
  const have = new Set(granted);
  // De-dupe + preserve manifest order; a required scope is missing iff not granted.
  const missing: string[] = [];
  for (const s of requiredScopes) {
    if (!have.has(s) && !missing.includes(s)) missing.push(s);
  }
  return missing;
}

/**
 * Derive the connection diagnosis. Pure + deterministic for a fixed `now`.
 *
 * Precedence (first match wins for `status`):
 *   precondition (NO_ACCOUNT_ACCESS / NOT_WORKFLOW_OWNER, decided upstream)
 *   → PROVIDER_UNKNOWN (manifest null)
 *   → DISCONNECTED (no active row)
 *   → PROVIDER_DISABLED (manifest.isEnabled === false)
 *   → RECONNECT_REQUIRED (expired AND not refreshable)
 *   → TOKEN_EXPIRED (expired AND refreshable)
 *   → MISSING_SCOPES (required − granted ≠ ∅)
 *   → CONNECTED
 *
 * `providerEnabled` / `refreshable` / `credentialClass` / `tokenExpired` /
 * scope fields are reported alongside `status` regardless of which branch wins,
 * so the consumer always sees the supporting facts.
 */
export function deriveConnectionDiagnosis(
  manifest: ConnectionDiagnosisManifest | null,
  row: ConnectionDiagnosisRow | null,
  activeConnectionCount: number,
  now: Date,
  precondition?: ConnectionPrecondition,
): ConnectionDiagnosis {
  const providerEnabled = manifest?.isEnabled ?? false;
  const refreshable = manifest?.refreshable ?? false;
  const credentialClass: CredentialSharing = manifest
    ? credentialSharingForProvider(manifest.id)
    : "personal";

  const hasActiveRow = row !== null && row.disconnectedAt === null;
  const tokenExpired = hasActiveRow
    ? isExpired(row!.accessTokenExpiresAt, now)
    : null;

  // Scope gap is only meaningful with both a manifest and an active row.
  const missingScopes =
    manifest && hasActiveRow ? scopeGap(manifest.requiredScopes, row!.scopes) : [];
  const scopesSatisfied = manifest && hasActiveRow ? missingScopes.length === 0 : false;

  const facts = {
    providerEnabled,
    refreshable,
    credentialClass,
    tokenExpired,
    scopesSatisfied,
    missingScopeCount: missingScopes.length,
    missingScopes,
    activeConnectionCount,
    hasActiveRow,
  } as const;

  // 0. Upstream authz decision — short-circuit, inspect nothing further.
  if (precondition) {
    return { status: precondition, ...facts };
  }
  // 1. Provider not registered.
  if (manifest === null) {
    return { status: "PROVIDER_UNKNOWN", ...facts };
  }
  // 2. No active connection (no row, or by-id row soft-disconnected).
  if (!hasActiveRow) {
    return { status: "DISCONNECTED", ...facts };
  }
  // 3. Provider globally disabled (new connects refused).
  if (!providerEnabled) {
    return { status: "PROVIDER_DISABLED", ...facts };
  }
  // 4/5. Expired token — recoverability depends on refreshability.
  if (tokenExpired === true) {
    return {
      status: refreshable ? "TOKEN_EXPIRED" : "RECONNECT_REQUIRED",
      ...facts,
    };
  }
  // 6. Required scope gap.
  if (!scopesSatisfied) {
    return { status: "MISSING_SCOPES", ...facts };
  }
  // 7. Healthy.
  return { status: "CONNECTED", ...facts };
}
