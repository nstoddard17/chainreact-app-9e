import { getProvider } from "@/integrations/_registry";
import {
  countActiveByAccountProviderServiceRole,
  getActiveForExecution,
  getByIdForAccountServiceRole,
  type IntegrationRecord,
} from "@/repositories/integrations";
import { isMemberServiceRole } from "@/repositories/accountMemberships";
import { getByIdServiceRole } from "@/repositories/workflows";
import { credentialSharingForProvider } from "@/core/integrations/credentialSharing";
import { isNonOauthProvider } from "@/core/integrations/nonOauthProviders";
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

// ───────────────────────── workflow-wide composition (2B-4) ─────────────────────────

/**
 * One provider's credential readiness within a workflow. `status` IS the safe
 * reason code; the human-readable note is rendered MCP-side from the code (no
 * prose crosses the wire). `nodeIds` are the graph node ids that use this
 * provider — ids only, never `config` values.
 */
export interface WorkflowProviderConnectionEntry {
  readonly provider: string;
  /** Public manifest display name, or null when the provider is unregistered. */
  readonly name: string | null;
  readonly credentialClass: "personal" | "account";
  readonly nodeIds: readonly string[];
  readonly nodeCount: number;
  readonly status: string;
  readonly ready: boolean;
  readonly providerEnabled: boolean;
  readonly refreshable: boolean;
  readonly tokenExpired: boolean | null;
  readonly scopesSatisfied: boolean;
  readonly missingScopeCount: number;
  /** Only present in the MISSING_SCOPES arm (public required-scope gap names). */
  readonly missingScopes?: readonly string[];
}

export interface WorkflowConnectionsDTO {
  readonly workflowId: string;
  readonly access: "OK" | "NOT_FOUND" | "NO_ACCOUNT_ACCESS";
  // ── Present ONLY when access === "OK" (an authorized member). ──
  /** True when every provider the graph uses is CONNECTED (trivially true for none). */
  readonly allRequiredConnected?: boolean;
  readonly providers?: readonly WorkflowProviderConnectionEntry[];
}

/** Distinct provider ids in the draft graph → the node ids that use each (first-seen order). */
function groupNodeIdsByProvider(
  nodes: ReadonlyArray<{ id: string; provider: string }>,
): Map<string, string[]> {
  const byProvider = new Map<string, string[]>();
  for (const node of nodes) {
    const provider = node.provider;
    if (!provider) continue;
    const existing = byProvider.get(provider);
    if (existing) existing.push(node.id);
    else byProvider.set(provider, [node.id]);
  }
  return byProvider;
}

/**
 * Diagnose every provider a workflow's graph uses, for a subject — "does this
 * workflow have the required provider connections available, for the correct
 * account/provenance context." Owns the sessionless service-role workflow read,
 * membership authz, and per-provider composition over `diagnoseProviderConnection`
 * (which carries the credential-provenance wall). Reads the SERVICE-ROLE workflow
 * (not the RLS path), so it works under the machine bearer without a cookie.
 *
 * No-leak: node `config` (opaque, secret-bearing) is NEVER read — only node ids,
 * `provider`/`type`, and the sanitized per-provider connection facts reach the DTO.
 */
export async function diagnoseWorkflowConnections(input: {
  subjectUserId: string;
  workflowId: string;
  /**
   * AI-DIAG-FIX-1 — the client's CURRENT builder draft (unsaved edits), validated
   * upstream. When present, the per-provider connection inventory is grouped from
   * its nodes instead of the saved `draftDefinition`, so "Check workflow" reflects
   * the canvas. Authz still resolves from the SAVED workflow record below (the
   * override only changes which providers are inspected, for the SAME account the
   * caller already belongs to — no new exposure). Never persisted.
   */
  draftOverride?: import("@/contracts/workflowDefinition").WorkflowDefinition;
}): Promise<WorkflowConnectionsDTO> {
  const { subjectUserId, workflowId } = input;

  // 1. Raw read (service-role; sessionless). NON-authorizing by itself.
  const workflow = await getByIdServiceRole(workflowId);

  // 2. No row → NOT_FOUND, reveal nothing (don't even hit membership).
  if (workflow === null) {
    return { workflowId, access: "NOT_FOUND" };
  }

  // 3. Account-membership authz. A non-member learns only that they have no
  // access — never the graph, the providers, or any connection state.
  const authorized = await isMemberServiceRole(workflow.accountId, subjectUserId);
  if (!authorized) {
    return { workflowId, access: "NO_ACCOUNT_ACCESS" };
  }

  // 4. Creator provenance comes straight from the service-role record (the same
  // identity execution + the builder pin personal providers to).
  const workflowCreator: WorkflowCreatorContext = {
    workflowId: workflow.id,
    createdByUserId: workflow.createdByUserId,
    accountId: workflow.accountId,
  };

  // Non-OAuth/system providers (`native` — manual/scheduled triggers, http_request,
  // delay, router, etc.) ship without a manifest, OAuth dance, or `integrations`
  // row, so they NEVER require a connection. Exclude them from the inventory
  // entirely — mirrors the activation precondition gate + planner availability
  // (shared source: `@/core/integrations/nonOauthProviders`). Without this skip the
  // derivation classifies the missing manifest as PROVIDER_UNKNOWN, surfacing a
  // false "this provider isn't recognized" / "replace the native node" finding for a
  // valid Manual Run trigger. An unknown EXTERNAL provider is still diagnosed (and
  // still yields PROVIDER_UNKNOWN), because this set is narrow by design.
  // AI-DIAG-FIX-1: group providers from the client's current draft when supplied
  // (unsaved edits), else the saved definition. Node `config` is still NEVER read
  // (only provider/type/ids); the override changes which providers are inspected.
  const diagnosedNodes = (input.draftOverride ?? workflow.draftDefinition).nodes;
  const grouped = [...groupNodeIdsByProvider(diagnosedNodes).entries()]
    .filter(([provider]) => !isNonOauthProvider(provider));

  // 5. Diagnose each distinct provider (independent reads → parallel, order kept).
  const diagnoses = await Promise.all(
    grouped.map(([provider]) =>
      diagnoseProviderConnection({
        subjectUserId,
        provider,
        accountId: workflow.accountId,
        workflowCreator,
      }),
    ),
  );

  const providers: WorkflowProviderConnectionEntry[] = grouped.map(([provider, nodeIds], i) => {
    const d = diagnoses[i]!;
    return {
      provider,
      name: getProvider(provider)?.displayName ?? null,
      credentialClass: d.credentialClass,
      nodeIds,
      nodeCount: nodeIds.length,
      status: d.status,
      ready: d.ok,
      providerEnabled: d.providerEnabled,
      refreshable: d.refreshable,
      tokenExpired: d.tokenExpired,
      scopesSatisfied: d.scopesSatisfied,
      missingScopeCount: d.missingScopeCount,
      ...(d.status === "MISSING_SCOPES" && d.missingScopes
        ? { missingScopes: d.missingScopes }
        : {}),
    };
  });

  return {
    workflowId,
    access: "OK",
    allRequiredConnected: providers.every((p) => p.ready),
    providers,
  };
}
