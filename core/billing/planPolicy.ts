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
  /**
   * Max CUSTOM (user-authored) workflow templates the account may hold
   * (4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-2 / CS-XT-1). `0` = cannot author custom
   * templates (Free — built-in templates remain usable); `null` = uncapped/config
   * (enterprise). Built-in template USE is governed by {@link canUseBuiltInTemplatesForPlan},
   * not by this number. Template creation is paid productivity; export is data portability —
   * the two are deliberately separate (see the plan doc). NOT yet enforced anywhere: CS-XT-1
   * ships the policy + helpers only; no table/route/UI consumes it until later slices.
   */
  templateLimit: number | null;
}

/**
 * Launch limits per tier. The capped-tier member/folder numbers EQUAL today's constants
 * (memberLimits: team 5 / org 25; folderLimits: personal 10 / team 100 / org 250). `pro`
 * matches `free` on members/folders but carries a HIGHER monthly task cap
 * (4.PLATFORM-BILLING-PRO-VALUE-3 / CS-PRO-2 — Pro's first real benefit: 1,000 vs Free 100).
 * The Pro task cap is applied to `account_billing.tasks_limit` by the billing webhook on a
 * verified personal Pro activation (this policy is the single source of the number; it is NOT
 * read by the AccountType-keyed member/folder helpers, which still resolve via the type
 * default). `enterprise` is uncapped/config (null).
 */
export const PLAN_LIMITS: Readonly<Record<PlanTier, PlanLimits>> = {
  free: { memberLimit: 1, folderLimit: 10, taskLimit: 100, templateLimit: 0 },
  pro: { memberLimit: 1, folderLimit: 10, taskLimit: 1000, templateLimit: 25 },
  team: { memberLimit: 5, folderLimit: 100, taskLimit: 100, templateLimit: 50 },
  business: { memberLimit: 25, folderLimit: 250, taskLimit: 100, templateLimit: 250 },
  enterprise: { memberLimit: null, folderLimit: null, taskLimit: null, templateLimit: null },
};

export function planLimitsFor(plan: PlanTier): PlanLimits {
  return PLAN_LIMITS[plan];
}

/**
 * Max custom (user-authored) templates for a plan, or `null` when uncapped/config (enterprise).
 * `0` for Free. The single source for the template-count gate the future create-template path
 * enforces (count `source='user'` rows vs this number) — same pattern as `memberLimitFor` /
 * `folderLimitFor`.
 */
export function templateLimitFor(plan: PlanTier): number | null {
  return PLAN_LIMITS[plan].templateLimit;
}

// ─── Feature capabilities (4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-2 / CS-XT-1) ──────────
//
// Pure per-tier feature decisions, layered ON TOP of (never replacing) the account-membership /
// role chokepoint (services/accounts/accountAuthz.ts). These answer "does this PLAN permit the
// feature at all"; the route additionally checks membership + role (e.g. bulk export on a
// shared account is owner/admin-only — that role gate is a ROUTE concern, not a plan one, so it
// is NOT modeled here). NOTHING enforces these yet — CS-XT-1 is policy + helpers only.

export interface PlanCapabilities {
  /** The plan these capabilities describe. NO Stripe / subscription identifiers — ever. */
  plan: PlanTier;
  /**
   * May the plan perform a BULK (whole-account / multi-workflow) export. Free = false (the
   * single-workflow export stays available to every tier as the data-portability floor and is
   * NOT gated here). Pro+ = true. Role gating (owner/admin on shared accounts) and the
   * destructive-downgrade bypass are applied at the route, not here.
   */
  canBulkExport: boolean;
  /** May the plan author CUSTOM templates. Derived from {@link templateLimitFor} (`0` → false;
   *  any positive number or `null`/uncapped → true) so the boolean can never drift from the cap. */
  canCreateTemplates: boolean;
  /** May the plan USE first-party built-in templates. TRUE for every tier (an onboarding/value
   *  driver — gating consumption of built-ins would hurt activation). */
  canUseBuiltInTemplates: boolean;
}

/** Whether `plan` may perform a bulk (whole-account) export. Free = false; Pro+ = true. */
export function canBulkExportForPlan(plan: PlanTier): boolean {
  return plan !== "free";
}

/** Whether `plan` may author custom templates. Derived from the cap (`0` → false; positive or
 *  uncapped → true) so it cannot diverge from {@link templateLimitFor}. */
export function canCreateTemplatesForPlan(plan: PlanTier): boolean {
  return templateLimitFor(plan) !== 0;
}

/** Whether `plan` may use first-party built-in templates. TRUE for all tiers. */
export function canUseBuiltInTemplatesForPlan(_plan: PlanTier): boolean {
  return true;
}

/** The full capability bundle for a plan — only plan + boolean capabilities, no Stripe data. */
export function planCapabilitiesFor(plan: PlanTier): PlanCapabilities {
  return {
    plan,
    canBulkExport: canBulkExportForPlan(plan),
    canCreateTemplates: canCreateTemplatesForPlan(plan),
    canUseBuiltInTemplates: canUseBuiltInTemplatesForPlan(plan),
  };
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
