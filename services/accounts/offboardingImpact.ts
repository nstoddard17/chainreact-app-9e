import * as workflowsRepo from "@/repositories/workflows";
import { listAcceptedOwnedByUserInAccountServiceRole } from "@/repositories/workflowNodeCredentials";
import { workflowUsesPrivateCredential } from "@/core/integrations/workflowCredentialScope";
import { isNodeCredentialReassignmentEnabled } from "@/services/teamCredentials/flags";

/**
 * Offboarding workflow-impact helper (Slice 4.TEAM-WORKFLOWS-7 / TW-5; extended
 * in 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-7 / CS-6).
 *
 * Counts the DISTINCT workflows in `accountId` whose personal-provider steps run
 * under `targetUserId`'s connection and may therefore stop running after the
 * member is removed / leaves. Two classes, unioned + deduplicated by workflow:
 *
 *   1. Workflows CREATED BY the member that contain ≥1 PERSONAL-credential
 *      provider node (the 22B creator-pin — TW-5 original behavior). Those steps
 *      resolve to the member as `created_by_user_id`; after 22C soft-disconnect
 *      they can no longer resolve.
 *   2. Workflows where the member is the ACCEPTED per-node credential owner
 *      (CS-2). Those steps run under the member's connection regardless of who
 *      created the workflow. CS-6 revokes these grants on offboarding, after
 *      which the node falls back to the creator (or fails clearly).
 *
 * Class 2 is FLAG-GATED on `ENABLE_NODE_CREDENTIAL_REASSIGNMENT`: when the flag
 * is OFF, accepted grants are inert in execution (CS-2 resolves to the creator),
 * so they do NOT represent a step that will stop running — counting them would
 * be a confusing warning about an unused feature. With the flag OFF the count is
 * byte-for-byte TW-5's created-by-only behavior.
 *
 * Account/service-provider steps keep working (shared), so they never count. The
 * count is advisory; it never blocks removal / leave.
 *
 * Scope:
 *   - `listByAccount` excludes soft-deleted workflows by default — deleted
 *     workflows never count. Owned-grant workflows are intersected with that set,
 *     so a grant on a soft-deleted workflow is also excluded.
 *   - Class 1: only `createdByUserId === targetUserId` workflows count.
 *   - Class 2: the owned-grant lookup is account-scoped + owner-scoped server-side.
 *   - Session-client + RLS on the workflow read: the caller (an authorized
 *     owner/admin — gated upstream — or the self-scoped leaver) sees only this
 *     account's workflows; no cross-account leak.
 */
export async function countImpactedWorkflowsForMember(
  accountId: string,
  targetUserId: string,
): Promise<number> {
  const workflows = await workflowsRepo.listByAccount(accountId);
  const accountWorkflowIds = new Set(workflows.map((wf) => wf.id));
  const impacted = new Set<string>();

  // Class 1 — workflows the member created with a personal-provider step.
  for (const wf of workflows) {
    if (wf.createdByUserId !== targetUserId) continue;
    if (workflowUsesPrivateCredential(wf.draftDefinition)) impacted.add(wf.id);
  }

  // Class 2 — workflows where the member is the ACCEPTED node-credential owner.
  // Only meaningful (and only execution-effective) when the feature is enabled.
  if (isNodeCredentialReassignmentEnabled()) {
    const ownedGrants = await listAcceptedOwnedByUserInAccountServiceRole(
      accountId,
      targetUserId,
    );
    for (const grant of ownedGrants) {
      // Intersect with the live (non-deleted) workflow set so a grant on a
      // soft-deleted workflow doesn't count — that workflow won't run anyway.
      if (accountWorkflowIds.has(grant.workflowId)) impacted.add(grant.workflowId);
    }
  }

  return impacted.size;
}
