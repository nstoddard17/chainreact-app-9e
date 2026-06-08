/**
 * Workflow portability / templates rollout flags
 * (4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-2 / CS-XT-1).
 *
 * Two SEPARATE dark-launch switches, both DEFAULT OFF, read at call time (not module load) so
 * tests + rollout can toggle without re-importing — mirrors services/billing/billingFeatureFlags.ts
 * and services/apiKeys/flags.ts. CS-XT-1 ships the flags + the policy/capability seam only; NO
 * route reads these yet, so toggling them changes nothing until the enforcement slices land.
 */

/**
 * Env var gating TIER ENFORCEMENT on workflow export (CS-XT-2+).
 *
 * DEFAULT OFF. When false, the export routes keep exactly today's behavior — single export to any
 * account member, bulk export to any member (owner/admin/member) with no plan-tier check. When the
 * later slice turns this ON, bulk export becomes tier-gated (Free blocked; Pro personal-bulk;
 * Team/Business owner/admin-only) and the destructive-downgrade export bypasses the gate. The
 * single-workflow export floor is never gated regardless of this flag.
 */
export const EXPORT_TIER_GATING_FLAG = "ENABLE_EXPORT_TIER_GATING";

/** True only when ENABLE_EXPORT_TIER_GATING === "true". Default false. */
export function isExportTierGatingEnabled(): boolean {
  return process.env[EXPORT_TIER_GATING_FLAG] === "true";
}

/**
 * Env var gating the WORKFLOW TEMPLATES feature (CS-XT-4+).
 *
 * DEFAULT OFF. Templates are entirely net-new (no table/route/UI exists). When false, no template
 * surface exists; when the later slice turns this ON, custom template creation is tier-gated
 * (Free 0 / Pro 25 / Team 50 / Business 250 / Enterprise config) and role-gated (owner/admin on
 * shared accounts), while built-in template USE stays available to every tier. Independent of the
 * export-tier flag.
 */
export const WORKFLOW_TEMPLATES_FLAG = "ENABLE_WORKFLOW_TEMPLATES";

/** True only when ENABLE_WORKFLOW_TEMPLATES === "true". Default false. */
export function isWorkflowTemplatesEnabled(): boolean {
  return process.env[WORKFLOW_TEMPLATES_FLAG] === "true";
}
