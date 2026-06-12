import { getProvider } from "@/integrations/_registry";
import {
  countActiveByAccountProviderServiceRole,
  getActiveForExecution,
  getByIdForAccountServiceRole,
  type IntegrationRecord,
} from "@/repositories/integrations";
import { isMemberServiceRole } from "@/repositories/accountMemberships";
import { credentialSharingForProvider } from "@/core/integrations/credentialSharing";
import { decideOptionsCredential } from "@/services/options/credentialPolicy";
import type { WorkflowCreatorContext } from "@/services/options/types";
import {
  deriveConnectionDiagnosis,
  type ConnectionDiagnosisManifest,
  type ConnectionDiagnosisRow,
  type ConnectionPrecondition,
} from "@/services/integrations/connectionDiagnosis";

/**
 * Integration-connection diagnostic capability (Slice 4.MCP-STAGE-2B-2 CS-2
 * extraction + 2B-4 workflow composition).
 *
 * The reusable "brain" — the SOURCE OF TRUTH for "is this provider connected &
 * usable for this subject, under the V2 account + credential-provenance walls."
 * Consumed today by the gated MCP routes
 * (`/api/internal/diagnostics/integration-connection` — single provider, and
 * `/api/internal/diagnostics/workflow-connections` — whole workflow) and callable
 * in-process by the future React Agent with the same guarantees.
 *
 * Separation of concerns:
 *   - The MACHINE bearer gate (`applyDiagnosticsGate`) stays in the route — it is
 *     the MCP-adapter boundary, not a capability concern.
 *   - This service OWNS the per-account MEMBERSHIP authz (`isMemberServiceRole`)
 *     and the personal-provider PROVENANCE decision (`decideOptionsCredential`),
 *     so every consumer (route or agent) inherits the same wall. It also OWNS the
 *     stored-state reads (`integrations` repo) and the pure derivation
 *     (`deriveConnectionDiagnosis`).
 *
 * No-leak by construction: the raw `IntegrationRecord` is NEVER spread. `narrowRow`
 * maps it down to the three non-secret fields the derivation reads, so token
 * blobs, `connectedByUserId`, `providerAccountId`, `displayName`, and
 * `accountMetadata` never reach a DTO. The DTO is an allow-list mapped from the
 * derivation result.
 *
 * Read-only: no provider call, no token decryption, no refresh, no mutation.
 */

/** Sanitized single-provider connection DTO (unchanged from the 2B-2 route shape). */
export interface IntegrationConnectionDTO {
  readonly ok: boolean;
  readonly provider: string;
  readonly accountId: string | null; // echoes the caller-supplied / workflow-resolved account
  readonly status: string;
  readonly activeConnectionCount: number;
  readonly hasActiveRow: boolean;
  readonly providerEnabled: boolean;
  readonly refreshable: boolean;
  readonly credentialClass: "personal" | "account";
  readonly tokenExpired: boolean | null;
  readonly scopesSatisfied: boolean;
  readonly missingScopeCount: number;
  /** Only present in the MISSING_SCOPES arm (the gap names, never the full grant). */
  readonly missingScopes?: readonly string[];
}

/**
 * Resolved input to the single-provider brain. The caller (route or workflow
 * composition) has already resolved `accountId` and the optional
 * `workflowCreator` provenance — this function does NO workflowId resolution
 * itself, so it is reusable from both the RLS-resolving route and the
 * service-role-resolving workflow capability without re-fetching.
 */
export interface ProviderConnectionInput {
  readonly subjectUserId: string;
  readonly provider: string;
  /** The resolved account whose connection to inspect. */
  readonly accountId: string;
  /** Workflow-creator provenance when workflow-scoped; null for an account-only lookup. */
  readonly workflowCreator: WorkflowCreatorContext | null;
  /** Optional: pin a specific integration row (account-scoped). */
  readonly integrationId?: string | null;
}

/** Map a `ProviderManifest` → the minimal non-secret facts the derivation needs. */
function mapManifest(provider: string): ConnectionDiagnosisManifest | null {
  const m = getProvider(provider);
  return m
    ? {
        id: m.id,
        isEnabled: m.isEnabled,
        refreshable: m.refreshable,
        requiredScopes: m.scopes.required,
      }
    : null;
}

function narrowRow(r: IntegrationRecord): ConnectionDiagnosisRow {
  // Only the three non-secret fields the derivation needs — the encrypted token
  // columns, connectedByUserId, providerAccountId, displayName, and metadata are
  // deliberately dropped here, at the boundary.
  return {
    scopes: r.scopes,
    accessTokenExpiresAt: r.accessTokenExpiresAt,
    disconnectedAt: r.disconnectedAt,
  };
}

function buildDto(
  provider: string,
  accountId: string | null,
  d: ReturnType<typeof deriveConnectionDiagnosis>,
): IntegrationConnectionDTO {
  return {
    ok: d.status === "CONNECTED",
    provider,
    accountId,
    status: d.status,
    activeConnectionCount: d.activeConnectionCount,
    hasActiveRow: d.hasActiveRow,
    providerEnabled: d.providerEnabled,
    refreshable: d.refreshable,
    credentialClass: d.credentialClass,
    tokenExpired: d.tokenExpired,
    scopesSatisfied: d.scopesSatisfied,
    missingScopeCount: d.missingScopeCount,
    ...(d.status === "MISSING_SCOPES" && { missingScopes: d.missingScopes }),
  };
}

/**
 * The NO_ACCOUNT_ACCESS DTO for the case where the route could not resolve the
 * workflow's account at all (so no membership/provider state is inspectable).
 * Exported so the route's workflow-unresolved branch stays a one-liner instead of
 * re-implementing `buildDto` + `deriveConnectionDiagnosis` inline.
 */
export function noAccountAccessDto(
  provider: string,
  echoAccountId: string | null,
): IntegrationConnectionDTO {
  const d = deriveConnectionDiagnosis(null, null, 0, new Date(), "NO_ACCOUNT_ACCESS");
  return buildDto(provider, echoAccountId, d);
}

/**
 * Diagnose a single provider's connection for a subject. Owns membership authz,
 * personal-provider provenance, the stored-state read, the pure derivation, and
 * sanitized DTO assembly. Returns a DTO the caller serializes verbatim.
 *
 * Authorization (sessionless, service-role):
 *   - not a member          → NO_ACCOUNT_ACCESS, NO integration row fetched.
 *   - personal + non-owner  → NOT_WORKFLOW_OWNER, NO credential row fetched.
 *   - personal + no workflow→ pinned to the SUBJECT's own connection.
 *   - account provider      → account-shared, no pin.
 */
export async function diagnoseProviderConnection(
  input: ProviderConnectionInput,
): Promise<IntegrationConnectionDTO> {
  const { subjectUserId, provider, accountId, workflowCreator } = input;
  const integrationId = input.integrationId ?? null;
  const now = new Date();

  const manifest = mapManifest(provider);
  const sharing = credentialSharingForProvider(provider);

  // ── Authorization (sessionless, service-role). ──
  let precondition: ConnectionPrecondition | undefined;
  let pinUserId: string | null = null;

  const isMember = await isMemberServiceRole(accountId, subjectUserId);
  if (!isMember) {
    precondition = "NO_ACCOUNT_ACCESS";
  } else if (sharing === "personal") {
    // Personal-provider provenance: same decision the builder + execution apply.
    if (workflowCreator) {
      const decision = decideOptionsCredential(provider, subjectUserId, workflowCreator, null);
      if (decision.kind === "not-owner") {
        precondition = "NOT_WORKFLOW_OWNER";
      } else if (decision.kind === "personal-creator") {
        pinUserId = decision.connectedByUserId;
      } else {
        // account/legacy shouldn't occur for a personal provider WITH a creator;
        // fall back to the subject's own connection rather than widening.
        pinUserId = subjectUserId;
      }
    } else {
      // No workflow context → only the subject's OWN connection is inspected
      // (never a co-member's personal credential / presence).
      pinUserId = subjectUserId;
    }
  }

  // ── Read stored state (service-role) — ONLY when authorized + provider known. ──
  let row: ConnectionDiagnosisRow | null = null;
  let activeConnectionCount = 0;
  if (!precondition && manifest) {
    try {
      if (integrationId) {
        const r = await getByIdForAccountServiceRole(accountId, integrationId);
        // Personal-provider by-id provenance guard: a row connected by another
        // member is indistinguishable from "not found" (no cross-member presence).
        if (r && sharing === "personal" && pinUserId && r.connectedByUserId !== pinUserId) {
          row = null;
        } else {
          row = r ? narrowRow(r) : null;
        }
        activeConnectionCount = row ? 1 : 0;
      } else {
        const r = await getActiveForExecution(
          accountId,
          provider,
          null,
          pinUserId ? { connectedByUserId: pinUserId } : undefined,
        );
        row = r ? narrowRow(r) : null;
        if (sharing === "account") {
          // Account-shared: the account-wide active count is meaningful + safe.
          activeConnectionCount = await countActiveByAccountProviderServiceRole(
            accountId,
            provider,
          );
        } else {
          // Personal: scope the count to the resolved connection so the response
          // never reveals how many OTHER members connected this provider.
          activeConnectionCount = row ? 1 : 0;
        }
      }
    } catch {
      // Repository/service-role failure — sanitized; treat as no resolvable row.
      row = null;
      activeConnectionCount = 0;
    }
  }

  const diagnosis = deriveConnectionDiagnosis(
    manifest,
    row,
    activeConnectionCount,
    now,
    precondition,
  );
  return buildDto(provider, accountId, diagnosis);
}
