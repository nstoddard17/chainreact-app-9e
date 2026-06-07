import type { AccountType } from "@/contracts/accounts";

/**
 * Central plan-tier policy (Slice 4.BILLING-PLAN-METADATA-2 / CS-1).
 *
 * Pure data + helpers — no DB, no I/O (core/ may import only contracts/). This is the
 * single seam the member/folder/task limit helpers read from (the in-code TODOs in
 * services/accounts/memberLimits.ts + services/workflowFolders/folderLimits.ts pointed
 * here). It introduces NO behavior change in CS-1: the per-tier numbers equal today's
 * AccountType-keyed constants, so delegating through this policy is byte-for-byte
 * equivalent.
 *
 * Two orthogonal axes (see docs/slices/phase-4/account-settings/
 * plan-metadata-stripe-billing-plan.md): `account.type` is the structural shape
 * (personal/team/organization); `PlanTier` is the billing tier. Stripe is NOT modeled
 * here (CS-2+); this slice is plan metadata + limit policy only.
 */

export const PLAN_TIERS = ["free", "pro", "team", "business", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PLAN_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export interface PlanLimits {
  /** Total members incl. owner; null = uncapped/config (enterprise). */
  memberLimit: number | null;
  /** Max live folders; null = uncapped/config (enterprise). */
  folderLimit: number | null;
  /** Monthly task cap; null = uncapped/config (enterprise). Authoritative copy is
   *  still `account_billing.tasks_limit` (CS-1 does NOT rewire task-limit writes). */
  taskLimit: number | null;
}

/**
 * Launch limits per tier. The capped-tier numbers EQUAL today's constants
 * (memberLimits: team 5 / org 25; folderLimits: personal 10 / team 100 / org 250;
 * tasks_limit default 100), so CS-1 changes no behavior. `pro` mirrors `free` for now
 * (Pro-specific limits are a later, deliberate decision). `enterprise` is
 * uncapped/config (null) and is never reached by the AccountType-keyed helpers today.
 */
export const PLAN_LIMITS: Readonly<Record<PlanTier, PlanLimits>> = {
  free: { memberLimit: 1, folderLimit: 10, taskLimit: 100 },
  pro: { memberLimit: 1, folderLimit: 10, taskLimit: 100 },
  team: { memberLimit: 5, folderLimit: 100, taskLimit: 100 },
  business: { memberLimit: 25, folderLimit: 250, taskLimit: 100 },
  enterprise: { memberLimit: null, folderLimit: null, taskLimit: null },
};

export function planLimitsFor(plan: PlanTier): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function isPlanTier(value: string): value is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value);
}

export function isPlanStatus(value: string): value is PlanStatus {
  return (PLAN_STATUSES as readonly string[]).includes(value);
}

/** Plans valid for each structural account type (enforced in policy + DB CHECK). */
const ALLOWED_PLANS_BY_TYPE: Readonly<Record<AccountType, readonly PlanTier[]>> = {
  personal: ["free", "pro"],
  team: ["team"],
  organization: ["business", "enterprise"],
};

export function isPlanAllowedForType(type: AccountType, plan: PlanTier): boolean {
  return ALLOWED_PLANS_BY_TYPE[type].includes(plan);
}

/**
 * In-place tier+shape UPGRADES that cross account type (Slice 4.BILLING-BUSINESS-UPGRADE-2 /
 * BU-2). Maps an upgrade `(fromType → toPlan)` to the account type that plan requires:
 * a Team account buying the Business plan upgrades to `organization`. This is the ONLY
 * cross-type upgrade today; everything else is governed by `isPlanAllowedForType`. The
 * actual `accounts.type` flip happens later, atomically, in the webhook (BU-3) via the
 * BU-1 RPC — this map only declares which checkouts are permitted as upgrades.
 */
const UPGRADE_TARGET_TYPE: Readonly<
  Partial<Record<AccountType, Partial<Record<PlanTier, AccountType>>>>
> = {
  team: { business: "organization" },
};

/** True when `(type, plan)` is a recognized in-place cross-type upgrade (e.g. team→business). */
export function isUpgradeAllowedForType(type: AccountType, plan: PlanTier): boolean {
  return UPGRADE_TARGET_TYPE[type]?.[plan] !== undefined;
}

/**
 * The account type a recognized upgrade moves to (e.g. team + business → `organization`),
 * or null when `(type, plan)` is not an upgrade. Used to stamp `targetAccountType` into the
 * checkout metadata the webhook trusts.
 */
export function upgradeTargetAccountType(
  type: AccountType,
  plan: PlanTier,
): AccountType | null {
  return UPGRADE_TARGET_TYPE[type]?.[plan] ?? null;
}

/**
 * The default plan for a freshly-created account of `type` — the free/base tier of
 * that shape: personal → free, team → team, organization → business. Used for the
 * existing-row backfill, new-account seeding, and (in CS-1) to key the limit helpers
 * so they stay AccountType-keyed without a DB lookup while still sourcing numbers
 * from this policy.
 */
export function defaultPlanForAccountType(type: AccountType): PlanTier {
  switch (type) {
    case "personal":
      return "free";
    case "team":
      return "team";
    case "organization":
      return "business";
  }
}

/** User-facing label. `business` is "Business" — NEVER "Organization". */
export function planTierLabel(plan: PlanTier): string {
  switch (plan) {
    case "free":
      return "Free";
    case "pro":
      return "Pro";
    case "team":
      return "Team";
    case "business":
      return "Business";
    case "enterprise":
      return "Enterprise";
  }
}
