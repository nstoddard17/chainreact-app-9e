import type { AccountType } from "@/contracts/accounts";

/**
 * Account member-limit policy (4.ACCOUNT-MODEL-20; Business cap aligned in
 * 4.ACCOUNT-MODEL-BUSINESS-LIMIT-1).
 *
 * Launch rule (NOT per-seat billing — billing is account/usage-based): caps are
 * TOTAL members INCLUDING the owner.
 *   - Team     → 5
 *   - Business (internal `organization`) → 25, one shared business workspace
 *   - Enterprise (future; no internal type yet) → uncapped / configurable
 * These are central launch CONSTANTS, not plan metadata.
 *
 * TODO (payments track / Enterprise): move the caps into plan policy keyed off
 * `account_billing`/plan so paid tiers carry their own limits and Enterprise can
 * be uncapped/config-driven. This helper is the single seam to change.
 */
export const TEAM_MAX_MEMBERS = 5;
export const BUSINESS_MAX_MEMBERS = 25;

/**
 * The total-member cap for an account type, or `null` when uncapped.
 *   - team         → TEAM_MAX_MEMBERS (5, incl. owner)
 *   - personal     → 1 (single-member; never an invite target anyway)
 *   - organization → BUSINESS_MAX_MEMBERS (25, incl. owner) — user-facing "Business"
 *
 * `null` is reserved for a future uncapped tier (Enterprise) that has no internal
 * account type yet; no current type returns it.
 */
export function memberLimitFor(type: AccountType): number | null {
  switch (type) {
    case "team":
      return TEAM_MAX_MEMBERS;
    case "personal":
      return 1;
    case "organization":
      return BUSINESS_MAX_MEMBERS;
  }
}
