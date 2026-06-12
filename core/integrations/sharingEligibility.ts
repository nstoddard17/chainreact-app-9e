import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import {
  isPrivateCredentialProvider,
  workflowUsesPrivateCredential,
  viewerMayRunEdit,
} from "./workflowCredentialScope";

/**
 * Ambiguity-aware run/edit eligibility computation (Slice 4.CONN-SHARE / CS-3a).
 *
 * Pure, I/O-free. Decides whether a workflow's PRIVATE-credential requirements
 * are satisfied by CURRENTLY shared connections — WITHOUT ever resolving which
 * specific connector would execute (that node-level binding is CS-4).
 *
 * The CS-4 audit established that provider-level "Gmail is shared" is NOT enough:
 * when 2+ members share the same personal provider, a non-creator run would
 * silently resolve to an arbitrary connector. So this computation FAILS CLOSED on
 * ambiguity — `single_shared_connector` is the only sharing state that makes a
 * private provider team-runnable; `unshared` and `ambiguous_shared_connectors`
 * both block a non-creator.
 *
 * BEHAVIOR-INERT: nothing wires this into the live run/edit gate
 * (`app/api/workflows/_shared.ts`) in CS-3a. While `ENABLE_CONNECTION_SHARING` is
 * OFF the workflow-level result is byte-identical to WF-RUNPERM's `viewerMayRunEdit`
 * (it delegates to it). CS-3b will wire it behind the flag.
 *
 * No-leak: the result carries provider slugs + status ENUMS only — never a
 * connector id, count, provider_account_id, email, token, scope, or metadata.
 */

export type ProviderSharingStatus =
  | "not_private"
  | "unshared"
  | "single_shared_connector"
  | "ambiguous_shared_connectors";

/**
 * Per-provider sharing status from a distinct-shared-connector COUNT.
 *   - non-private (account/service or native) → `not_private`
 *   - private + 0 shared connectors           → `unshared`
 *   - private + exactly 1 shared connector     → `single_shared_connector`
 *   - private + 2+ shared connectors           → `ambiguous_shared_connectors`
 *
 * Unknown providers classify `personal` (fail-safe via `isPrivateCredentialProvider`),
 * so an unrecognized provider with no shared row is `unshared` ⇒ blocks a
 * non-creator. Native pseudo-providers are `not_private`.
 */
export function computeProviderSharingStatus(
  provider: string,
  sharedConnectorCount: number,
): ProviderSharingStatus {
  if (!isPrivateCredentialProvider(provider)) return "not_private";
  if (sharedConnectorCount <= 0) return "unshared";
  if (sharedConnectorCount === 1) return "single_shared_connector";
  return "ambiguous_shared_connectors";
}

/** Distinct PRIVATE-credential providers used by a workflow's nodes. */
export function distinctPrivateProviders(definition: WorkflowDefinition): string[] {
  if (!definition || !Array.isArray(definition.nodes)) return [];
  const set = new Set<string>();
  for (const node of definition.nodes) {
    const provider = node?.provider;
    if (provider && isPrivateCredentialProvider(provider)) set.add(provider);
  }
  return [...set];
}

export type RunEditEligibilityReason =
  | "flag_off_legacy"
  | "creator"
  | "no_private_credentials"
  | "all_providers_single_shared"
  | "blocked_unshared"
  | "blocked_ambiguous"
  | "blocked_malformed";

/** Safe per-private-provider status view (slug + enum only — no ids/counts). */
export interface ProviderSharingStatusView {
  readonly provider: string;
  readonly status: ProviderSharingStatus;
}

export interface RunEditEligibilityResult {
  readonly allowed: boolean;
  readonly reason: RunEditEligibilityReason;
  readonly providerStatuses: readonly ProviderSharingStatusView[];
}

export interface RunEditEligibilityInput {
  readonly definition: WorkflowDefinition;
  readonly createdByUserId: string | null;
  readonly callerUserId: string;
  /**
   * Distinct shared-connector user COUNT per provider. Only private providers
   * matter; a missing entry reads as 0 (unshared). The caller derives this from
   * `listSharedConnectorUserIdsServiceRole(...).size` — ids never reach here.
   */
  readonly sharedConnectorCountByProvider: ReadonlyMap<string, number>;
  readonly flagEnabled: boolean;
}

/**
 * Workflow-level run/edit eligibility. See the module doc for the model.
 *
 * Precedence when blocking a non-creator: `ambiguous` is reported before
 * `unshared` (both block; ambiguity is the more specific "needs CS-4 binding"
 * signal). Fails closed on a malformed definition.
 */
export function computeRunEditEligibility(
  input: RunEditEligibilityInput,
): RunEditEligibilityResult {
  const { definition, createdByUserId, callerUserId, sharedConnectorCountByProvider, flagEnabled } =
    input;

  // Fail closed on a malformed definition — never green-light an unparseable
  // workflow. (The engine validates upstream; this is defense in depth.)
  if (!definition || !Array.isArray(definition.nodes)) {
    return { allowed: false, reason: "blocked_malformed", providerStatuses: [] };
  }

  // Flag OFF → preserve WF-RUNPERM EXACTLY by delegating to the canonical predicate.
  if (!flagEnabled) {
    return {
      allowed: viewerMayRunEdit({ createdByUserId, definition }, callerUserId),
      reason: "flag_off_legacy",
      providerStatuses: [],
    };
  }

  // No private credentials → any member (membership-gated upstream).
  if (!workflowUsesPrivateCredential(definition)) {
    return { allowed: true, reason: "no_private_credentials", providerStatuses: [] };
  }

  // Creator always allowed (today's behavior).
  if (createdByUserId !== null && createdByUserId === callerUserId) {
    return { allowed: true, reason: "creator", providerStatuses: [] };
  }

  // Non-creator with private providers: eligible ONLY if EVERY distinct private
  // provider has exactly one shared connector.
  const providerStatuses: ProviderSharingStatusView[] = distinctPrivateProviders(definition).map(
    (provider) => ({
      provider,
      status: computeProviderSharingStatus(provider, sharedConnectorCountByProvider.get(provider) ?? 0),
    }),
  );

  if (providerStatuses.some((p) => p.status === "ambiguous_shared_connectors")) {
    return { allowed: false, reason: "blocked_ambiguous", providerStatuses };
  }
  if (providerStatuses.some((p) => p.status === "unshared")) {
    return { allowed: false, reason: "blocked_unshared", providerStatuses };
  }
  // Every private provider is single_shared_connector (the list is non-empty here
  // because workflowUsesPrivateCredential was true).
  return { allowed: true, reason: "all_providers_single_shared", providerStatuses };
}

// ── CS-4b — per-node effective-owner precedence (gate + executor share this) ──

export type NodeOwnerVia = "grant" | "binding" | "single_sharer" | "creator";

export interface NodeOwnerResolution {
  /**
   * The user whose personal connection this node runs under. ALWAYS defined — the
   * creator is the safe deterministic fallback (their OWN connection, never a
   * co-member). The gate uses `teamRunnable` to decide non-creator access; the
   * executor uses `owner` to set the credential-resolution context.
   */
  readonly owner: string;
  readonly via: NodeOwnerVia;
  /**
   * True when the node resolves to a SPECIFIC shared connector (grant / valid
   * binding / single sharer) — i.e. a non-creator may run it. False for the
   * creator fallback (unshared or ambiguous-no-binding), which keeps a workflow
   * creator-only.
   */
  readonly teamRunnable: boolean;
}

/**
 * Resolve the effective credential owner for ONE personal-provider node, by the
 * locked precedence (plan §15.5):
 *   1. accepted `workflow_node_credentials` grant — wins.
 *   2. VALID node connector binding — the bound connector is still in the live
 *      shared set (an unshared / disconnected / departed connector drops out, so
 *      an invalid binding is IGNORED — never silently used).
 *   3. single shared connector — exactly one shared connector for the provider.
 *   4. creator pin — deterministic, safe fallback (unshared OR ambiguous 2+ with
 *      no valid binding/grant). FAILS CLOSED for non-creators; NEVER picks an
 *      arbitrary/earliest co-member row.
 *
 * Pure — callers gather the inputs. Only call for PERSONAL providers (account /
 * native nodes are not credential-owned).
 */
export function resolveNodeOwner(input: {
  creatorUserId: string;
  acceptedGrantOwner: string | null;
  bindingConnector: string | null;
  sharedConnectors: ReadonlySet<string>;
}): NodeOwnerResolution {
  const { creatorUserId, acceptedGrantOwner, bindingConnector, sharedConnectors } = input;

  if (acceptedGrantOwner) {
    return { owner: acceptedGrantOwner, via: "grant", teamRunnable: true };
  }
  if (bindingConnector && sharedConnectors.has(bindingConnector)) {
    return { owner: bindingConnector, via: "binding", teamRunnable: true };
  }
  if (sharedConnectors.size === 1) {
    return { owner: [...sharedConnectors][0]!, via: "single_sharer", teamRunnable: true };
  }
  // size 0 (unshared) OR size >= 2 with no valid binding/grant (ambiguous) →
  // creator pin. Safe + deterministic; non-creator is blocked by the gate.
  return { owner: creatorUserId, via: "creator", teamRunnable: false };
}
