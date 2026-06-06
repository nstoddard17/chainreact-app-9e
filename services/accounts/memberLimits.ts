import type { AccountType } from "@/contracts/accounts";
import { planLimitsFor, defaultPlanForAccountType } from "@/core/billing/planPolicy";

/**
 * Account member-limit policy (4.ACCOUNT-MODEL-20; Business cap aligned in
 * 4.ACCOUNT-MODEL-BUSINESS-LIMIT-1; sourced from central plan policy in
 * 4.BILLING-PLAN-METADATA-2 / CS-1).
 *
 * Launch rule (NOT per-seat billing — billing is account/usage-based): caps are
 * TOTAL members INCLUDING the owner. The NUMBERS now live in the single plan-policy
 * seam ([core/billing/planPolicy.ts](../../core/billing/planPolicy.ts)); this helper
 * stays AccountType-keyed (callers unchanged) by resolving the type's default plan —
 * byte-for-byte the previous values (Team → 5, Business → 25), so CS-1 changes no
 * behavior. A later wiring slice can pass the account's ACTUAL plan once Pro/paid
 * tiers carry different caps.
 */
export const TEAM_MAX_MEMBERS = planLimitsFor("team").memberLimit as number; // 5
export const BUSINESS_MAX_MEMBERS = planLimitsFor("business").memberLimit as number; // 25

/**
 * The total-member cap for an account type, or `null` when uncapped (reserved for a
 * future Enterprise tier with no internal account type yet).
 *   - personal     → 1 (single-member)
 *   - team         → 5 (incl. owner)
 *   - organization → 25 (incl. owner) — user-facing "Business"
 */
export function memberLimitFor(type: AccountType): number | null {
  return planLimitsFor(defaultPlanForAccountType(type)).memberLimit;
}
