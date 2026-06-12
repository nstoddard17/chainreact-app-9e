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
