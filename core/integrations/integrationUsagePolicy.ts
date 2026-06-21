import { isAccountCredentialProvider } from "./credentialSharing";
import { effectiveIntegrationSharingScope } from "./sharingScope";

/**
 * Integration-USAGE authorization policy (Slice 4.PUBLIC-MCP-USAGE-1).
 *
 * Pure, I/O-free. Decides whether an ACTOR may USE a specific integration's
 * external identity for a given purpose — the permission seam the public MCP server
 * (and future workflow-write/run MCP tools) check BEFORE acting on a connection.
 *
 * The rule is the row-level analogue of the UI's run/edit eligibility
 * (`core/integrations/sharingEligibility.ts`) and reuses the SAME single source of
 * truth (`credentialSharing` classification + `effectiveIntegrationSharingScope`).
 * It deliberately grants NO MORE than the UI:
 *
 *   - Account / service integrations (slack/stripe/notion/…) — shared by
 *     classification; usable by any account member (membership is checked by the
 *     calling service, not here).
 *   - Member-connected identity integrations (Outlook/Gmail/personal calendars/…) —
 *     PRIVATE to the connector. Usable by the connector always; usable cross-user
 *     ONLY when explicit connection-sharing is enabled AND the connector opted this
 *     row into `shared_with_account`. With the flag OFF (today's default) this is
 *     byte-identical to the legacy creator-pinned `viewerMayRunEdit` — a co-member
 *     can NEVER use another member's mailbox/calendar identity.
 *
 * This module NEVER invents broad sharing: it reads the existing
 * `integration_sharing_scope` column through the canonical fail-safe helper, gated
 * by the existing `ENABLE_CONNECTION_SHARING` rollout flag (passed in by the caller
 * so this stays pure + testable).
 *
 * No-leak: inputs are slugs/ids/enums; the result carries an enum reason + a safe
 * static detail string — never a connector id, count, email, token, or scope.
 */

export type IntegrationUsagePurpose = "read" | "configure_workflow" | "run_workflow";

/** Safe, id-free deny message for a private member-connected identity. */
export const PRIVATE_CONNECTION_DENY_DETAIL =
  "This connection is private to the member who connected it.";

export type IntegrationUsageDecision =
  | { allowed: true }
  | { allowed: false; reason: "integration_not_allowed_for_actor"; detail: string };

export interface IntegrationUsageDecisionInput {
  provider: string;
  /** `integrations.connected_by_user_id` — provenance, used here only for the
   *  connector-self comparison; it never leaves the decision. */
  connectedByUserId: string | null;
  /** Raw `integrations.integration_sharing_scope` column value (or null). */
  sharingScope: string | null | undefined;
  /** The actor (e.g. the MCP token minter) asking to use the connection. */
  actorUserId: string;
  /**
   * The action the actor wants to take. Reserved for future per-purpose tightening
   * (write/run tools may require a higher role/scope). v1 applies the identity rule
   * uniformly across purposes — run-time per-node owner ambiguity is resolved by the
   * engine's existing `resolveNodeOwner`, not here.
   */
  purpose: IntegrationUsagePurpose;
  /** `ENABLE_CONNECTION_SHARING` — passed in to keep this module pure. */
  connectionSharingEnabled: boolean;
}

/**
 * Decide whether `actorUserId` may use this integration. Assumes the caller has
 * ALREADY verified the integration belongs to the actor's account and that the
 * actor is a current member — this function decides ONLY the identity-sharing
 * dimension.
 */
export function decideIntegrationUsage(
  input: IntegrationUsageDecisionInput,
): IntegrationUsageDecision {
  // The connector may always use their OWN connection (their external identity).
  if (input.connectedByUserId && input.connectedByUserId === input.actorUserId) {
    return { allowed: true };
  }

  // Account / service credentials are shared by classification — usable by any
  // member, independent of the sharing column or flag (the UI always shares them).
  if (isAccountCredentialProvider(input.provider)) {
    return { allowed: true };
  }

  // Personal-credential identity, non-connector: usable cross-user ONLY when
  // explicit sharing is enabled AND this row was opted into `shared_with_account`.
  // With the flag off, this is unreachable (matches the legacy creator-pinned gate).
  if (
    input.connectionSharingEnabled &&
    effectiveIntegrationSharingScope(input.provider, input.sharingScope) === "shared_with_account"
  ) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "integration_not_allowed_for_actor",
    detail: PRIVATE_CONNECTION_DENY_DETAIL,
  };
}
