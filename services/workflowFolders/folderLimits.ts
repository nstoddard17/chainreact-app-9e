import type { AccountType } from "@/contracts/accounts";

/**
 * Workflow-folder policy constants (Slice 4.WORKFLOW-FOLDERS-3 / WF-2).
 *
 * Locked decisions (commit b6d517bc7): folders are available on every tier; the
 * difference is a LIMIT, not a separate code path. Max nesting depth is 3 for all
 * tiers (root → child → grandchild). These are central launch CONSTANTS, mirroring
 * services/accounts/memberLimits.ts — the single seam to change.
 *
 * Tier → DB account type mapping today (only personal/team/organization exist):
 *   - Free / Personal → `personal` → 10
 *   - Team            → `team`     → 100
 *   - Business        → `organization` → 250   (the shared business workspace)
 *   - Enterprise      → 1000-or-config — no distinct account type yet; arrives
 *     with plan metadata. When it lands, key the cap off account_billing/plan
 *     here (same seam) rather than adding a code path elsewhere.
 */

/** Maximum folder nesting depth (root = 1). A grandchild is the deepest allowed. */
export const MAX_FOLDER_DEPTH = 3;

export const FOLDER_LIMITS: Readonly<Record<AccountType, number>> = {
  personal: 10,
  team: 100,
  organization: 250,
};

/** The maximum number of LIVE folders an account of `type` may hold. */
export function folderLimitFor(type: AccountType): number {
  return FOLDER_LIMITS[type];
}
