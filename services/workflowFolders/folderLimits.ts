import type { AccountType } from "@/contracts/accounts";
import { planLimitsFor, defaultPlanForAccountType } from "@/core/billing/planPolicy";

/**
 * Workflow-folder policy (Slice 4.WORKFLOW-FOLDERS-3 / WF-2; numbers sourced from
 * central plan policy in 4.BILLING-PLAN-METADATA-2 / CS-1).
 *
 * Folders are available on every tier; the difference is a LIMIT, not a separate code
 * path. Max nesting depth is 3 for all tiers (root → child → grandchild). The per-tier
 * caps now live in the single plan-policy seam
 * ([core/billing/planPolicy.ts](../../core/billing/planPolicy.ts)); this helper stays
 * AccountType-keyed (callers unchanged) by resolving the type's default plan —
 * byte-for-byte the previous values (personal 10 / team 100 / organization 250), so
 * CS-1 changes no behavior.
 */

/** Maximum folder nesting depth (root = 1). A grandchild is the deepest allowed. */
export const MAX_FOLDER_DEPTH = 3;

export const FOLDER_LIMITS: Readonly<Record<AccountType, number>> = {
  personal: planLimitsFor(defaultPlanForAccountType("personal")).folderLimit as number, // 10
  team: planLimitsFor(defaultPlanForAccountType("team")).folderLimit as number, // 100
  organization: planLimitsFor(defaultPlanForAccountType("organization")).folderLimit as number, // 250
};

/** The maximum number of LIVE folders an account of `type` may hold. */
export function folderLimitFor(type: AccountType): number {
  return FOLDER_LIMITS[type];
}
