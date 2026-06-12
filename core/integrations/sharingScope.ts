import {
  isAccountCredentialProvider,
  isPersonalCredentialProvider,
} from "./credentialSharing";

/**
 * Explicit per-connection sharing scope (Slice 4.CONN-SHARE / CS-1).
 *
 * Pure, I/O-free. The data foundation for "a connector may make their PERSONAL
 * connection team-usable" (plan:
 * docs/slices/phase-4/explicit-private-connection-sharing-plan.md).
 *
 * BEHAVIOR-INERT in CS-1: nothing reads these helpers at runtime yet — the
 * run/edit gate, execution resolver, Apps DTO/UI, Disconnect/Reconnect, and
 * workflow_node_credentials are all untouched. CS-2+ wire them behind the
 * ENABLE_CONNECTION_SHARING dev guard.
 *
 * Scope is meaningful ONLY for PERSONAL providers. Account/service providers
 * (slack/notion/stripe/…) are shared by classification and IGNORE the column.
 * Classification is the single source of truth (`./credentialSharing`); this
 * module never re-declares a provider map.
 */

export type IntegrationSharingScope = "private_to_connector" | "shared_with_account";

/**
 * The two values the DB CHECK constraint permits. NULL is also valid at the DB
 * layer — it is the unset / "derive default from classification" state, which
 * `effectiveIntegrationSharingScope` resolves to `private_to_connector` for
 * personal providers.
 */
export const INTEGRATION_SHARING_SCOPE_VALUES = [
  "private_to_connector",
  "shared_with_account",
] as const;

/**
 * The EFFECTIVE sharing scope for a (provider, stored-column-value) pair.
 *
 * - Account/service provider → ALWAYS `shared_with_account` (shared by
 *   classification; the column is ignored).
 * - Personal provider:
 *     - NULL / unset                  → `private_to_connector` (derived default)
 *     - exactly "shared_with_account" → `shared_with_account`
 *     - "private_to_connector"        → `private_to_connector`
 *     - ANY other / unknown value     → `private_to_connector` (FAIL SAFE —
 *       never widen access from unrecognized input; the DB CHECK should make an
 *       out-of-set value unreachable, but the helper refuses to open up
 *       regardless of what it is handed).
 */
export function effectiveIntegrationSharingScope(
  provider: string,
  rawColumnValue: string | null | undefined,
): IntegrationSharingScope {
  if (isAccountCredentialProvider(provider)) {
    return "shared_with_account";
  }
  return rawColumnValue === "shared_with_account"
    ? "shared_with_account"
    : "private_to_connector";
}

/**
 * Whether THIS feature can flip a provider's connection from private to shared.
 * ONLY personal providers — account/service providers are already account-shared
 * by classification, so there is nothing for explicit sharing to do. `false`
 * means "not shareable THROUGH this feature", not "unusable".
 */
export function isProviderShareable(provider: string): boolean {
  return isPersonalCredentialProvider(provider);
}

/** Minimal row shape the row-level shareability check needs (no token material). */
export interface ShareableRowInput {
  readonly provider: string;
  /** Soft-disconnect marker; null = active. */
  readonly disconnectedAt: string | null;
}

/**
 * Whether a specific integration ROW may be shared: a personal-provider row that
 * is still ACTIVE. A disconnected row carries no usable credential, so it is
 * never shareable.
 */
export function isRowShareable(row: ShareableRowInput): boolean {
  return isProviderShareable(row.provider) && row.disconnectedAt === null;
}
