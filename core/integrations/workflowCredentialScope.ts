import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { isPersonalCredentialProvider } from "./credentialSharing";

/**
 * Workflow credential-scope predicates (Slice 4.WF-RUNPERM).
 *
 * Pure, I/O-free. Decides whether a workflow is "private-credential" — i.e. it
 * has at least one node that uses a PERSONAL / member-connected provider
 * credential (Gmail, Outlook, Calendar, Drive, …). Running such a workflow
 * resolves the WORKFLOW CREATOR's personal OAuth identity (22B creator-pin), so
 * only the creator may run/edit it; other members must duplicate it and pick
 * their own connection.
 *
 * `viewerMayRunEdit` is the single decision used by the run / edit / activate
 * chokepoints. It is intentionally role-agnostic: owner/admin do NOT get
 * run/edit on a private-credential workflow (running under a member's external
 * identity is impersonation — management actions live on separate routes).
 */

/**
 * Pseudo-providers that carry NO OAuth credential — native triggers/actions
 * (manual + scheduled triggers, delay, http_request, if/then, router,
 * format-transform all use `provider: "native"`). They must NEVER count as
 * private, or every workflow (each has a trigger) would be mis-flagged.
 *
 * Canonical set — `services/accounts/offboardingImpact.ts` imports this rather
 * than re-declaring it, so the exclusion stays in one place.
 */
export const NON_OAUTH_PROVIDERS: ReadonlySet<string> = new Set(["native"]);

/** True when a node's provider is a real, personal-credential OAuth provider. */
export function isPrivateCredentialProvider(provider: string | undefined | null): boolean {
  return (
    !!provider &&
    !NON_OAUTH_PROVIDERS.has(provider) &&
    isPersonalCredentialProvider(provider)
  );
}

/**
 * True when the workflow has ≥1 node bound to a personal/member-connected
 * credential. Account/service providers (slack, stripe, …) and native nodes do
 * NOT make a workflow private. Unknown providers classify `personal` (fail-safe),
 * so an unclassified real provider DOES make it private — but `native` never does.
 */
export function workflowUsesPrivateCredential(definition: WorkflowDefinition): boolean {
  return definition.nodes.some((node) => isPrivateCredentialProvider(node.provider));
}

/**
 * The single run/edit authorization decision (Slice 4.WF-RUNPERM).
 *
 *   - Workflow uses NO private credential (shared/account-only or native-only)
 *     ⇒ any account member may run/edit (caller already membership-gated upstream).
 *   - Workflow uses ≥1 private credential ⇒ ONLY the creator may run/edit. A null
 *     creator (deleted member) ⇒ nobody may run/edit (owner/admin manage-only via
 *     other routes).
 *
 * Role-agnostic by design: owner/admin do not pass this for a private-credential
 * workflow.
 */
export function viewerMayRunEdit(
  workflow: { createdByUserId: string | null; definition: WorkflowDefinition },
  callerUserId: string,
): boolean {
  if (!workflowUsesPrivateCredential(workflow.definition)) return true;
  return workflow.createdByUserId !== null && workflow.createdByUserId === callerUserId;
}
