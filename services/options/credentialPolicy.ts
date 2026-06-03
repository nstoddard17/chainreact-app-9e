import { credentialSharingForProvider } from "@/core/integrations/credentialSharing";
import type { WorkflowCreatorContext } from "./types";

/**
 * Builder-options / AI-options credential-sharing policy
 * (Slice 4.ACCOUNT-MODEL-22D-2).
 *
 * Decides — for a single options request — WHICH credential the options
 * resolver may use, so the builder stops diverging from execution (22B). Pure +
 * synchronous: it makes the decision; the caller performs the actual
 * `getActiveForExecution` lookup and (for the pinned case) wraps the resolver
 * dispatch in the 22B credential-resolution context.
 *
 * The four outcomes:
 *   - `legacy`           — no workflow context: resolve the EDITOR's own
 *                          personal account (the safe pre-22D-2 behavior). Leaks
 *                          nothing (it's the editor's account) and preserves
 *                          current behavior for personal-account workflows and
 *                          non-workflow callers.
 *   - `account`          — account/service provider on a team workflow: resolve
 *                          the WORKFLOW's account, account-shared, no pin —
 *                          matching execution's account-shared path.
 *   - `personal-creator` — personal provider + the requester IS the workflow
 *                          creator: resolve the workflow's account PINNED to the
 *                          creator (`connectedByUserId`), the same credential
 *                          22B executes with.
 *   - `not-owner`        — personal provider + the requester is NOT the creator:
 *                          the caller returns `NOT_WORKFLOW_OWNER` and performs
 *                          NO lookup and NO resolver call, so a co-member's
 *                          personal credential / resource labels are never
 *                          fetched.
 *
 * Unknown providers classify `personal` (the credential-sharing default), so an
 * unclassified provider on a team workflow is creator-gated, never silently
 * account-shared.
 */
export type OptionsCredentialDecision =
  | { readonly kind: "legacy" }
  | { readonly kind: "account"; readonly accountId: string }
  | {
      readonly kind: "personal-creator";
      readonly accountId: string;
      readonly connectedByUserId: string;
    }
  | { readonly kind: "not-owner"; readonly provider: string };

export function decideOptionsCredential(
  provider: string,
  requesterUserId: string,
  workflowCreator: WorkflowCreatorContext | null,
): OptionsCredentialDecision {
  // No workflow context → the credential-sharing flip does not apply; keep the
  // safe legacy behavior (editor's own personal account).
  if (!workflowCreator) return { kind: "legacy" };

  const sharing = credentialSharingForProvider(provider);

  // Account/service providers are shared org resources — resolve the workflow's
  // account, no provenance pin (matches execution's account-shared path).
  if (sharing === "account") {
    return { kind: "account", accountId: workflowCreator.accountId };
  }

  // Personal providers are creator-pinned + creator-only.
  if (requesterUserId !== workflowCreator.createdByUserId) {
    // A non-creator editor never resolves the creator's personal credential.
    return { kind: "not-owner", provider };
  }
  return {
    kind: "personal-creator",
    accountId: workflowCreator.accountId,
    connectedByUserId: workflowCreator.createdByUserId,
  };
}
