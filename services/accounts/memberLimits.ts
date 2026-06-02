import type { AccountType } from "@/contracts/accounts";

/**
 * Team member-limit policy (4.ACCOUNT-MODEL-20).
 *
 * Launch rule (NOT per-seat billing — billing is account/usage-based): a Team
 * includes up to 5 TOTAL members INCLUDING the owner; an Organization is required
 * for more (org upgrade is deferred). This is a central launch CONSTANT, not plan
 * metadata.
 *
 * TODO (payments track / org upgrade): move the cap into plan policy keyed off
 * `account_billing`/plan so paid tiers and Organizations carry their own limits.
 * This helper is the single seam to change.
 */
export const TEAM_MAX_MEMBERS = 5;

/**
 * The total-member cap for an account type, or `null` when uncapped.
 *   - team         → TEAM_MAX_MEMBERS (5, incl. owner)
 *   - personal     → 1 (single-member; never an invite target anyway)
 *   - organization → null (uncapped; orgs support 6+)
 */
export function memberLimitFor(type: AccountType): number | null {
  switch (type) {
    case "team":
      return TEAM_MAX_MEMBERS;
    case "personal":
      return 1;
    case "organization":
      return null;
  }
}
