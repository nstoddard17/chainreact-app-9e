import * as workflowsRepo from "@/repositories/workflows";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";

/**
 * Non-OAuth pseudo-providers — they have no integration / credential, so they
 * can never be "impacted" by an offboarding soft-disconnect. Mirrors
 * `services/triggers/preconditions.ts`. (They classify `personal` only as the
 * credential-resolution fail-safe default; that is irrelevant here.)
 */
const NON_OAUTH_PROVIDERS: ReadonlySet<string> = new Set(["native"]);

/**
 * Offboarding workflow-impact helper (Slice 4.TEAM-WORKFLOWS-7 / TW-5).
 *
 * Counts the workflows in `accountId` that were CREATED BY `targetUserId` and
 * contain at least one node using a PERSONAL-credential provider (per the single
 * credential-sharing source of truth, `core/integrations/credentialSharing`).
 *
 * These are exactly the workflows whose steps may stop running after the member
 * is removed and their personal Team credentials are soft-disconnected (22C) —
 * account/service-provider steps keep working (shared), so account-only
 * workflows do NOT count. The count is advisory; it never blocks removal.
 *
 * Scope:
 *   - `listByAccount` excludes soft-deleted workflows by default — deleted
 *     workflows never count.
 *   - Only `createdByUserId === targetUserId` workflows count (others belong to
 *     members who stay).
 *   - Session-client + RLS: the caller (an authorized owner/admin — gated
 *     upstream) sees only this account's workflows; no cross-account leak.
 */
export async function countImpactedWorkflowsForMember(
  accountId: string,
  targetUserId: string,
): Promise<number> {
  const workflows = await workflowsRepo.listByAccount(accountId);
  let count = 0;
  for (const wf of workflows) {
    if (wf.createdByUserId !== targetUserId) continue;
    const usesPersonalProvider = wf.draftDefinition.nodes.some(
      (node) =>
        !!node.provider &&
        !NON_OAUTH_PROVIDERS.has(node.provider) &&
        isPersonalCredentialProvider(node.provider),
    );
    if (usesPersonalProvider) count += 1;
  }
  return count;
}
