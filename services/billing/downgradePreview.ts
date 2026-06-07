import type { PlanTier } from "@/core/billing/planPolicy";
import {
  evaluateDowngrade,
  type DowngradeEvaluation,
} from "@/core/billing/downgradeRules";
import { listMembers } from "@/services/accounts/membership";
import { listByAccount } from "@/repositories/workflowFolders";

/**
 * Downgrade preview (Slice 4.BILLING-PLAN-METADATA-6 / CS-5).
 *
 * Gathers an account's CURRENT usage (member count + live folder count) and runs the pure
 * downgrade rules against a target plan. Preview/validation ONLY — it never changes the
 * plan, deletes nothing, and performs no Stripe call. It is the safety gate a later
 * downgrade flow (portal-driven, CS-6+) consults before allowing a move to a smaller plan.
 *
 * Reuses the same account-scoped reads the Account Settings billing page already uses
 * (`listMembers` length, `listByAccount` live-folder count) — no new counting path.
 */
export async function previewDowngrade(
  accountId: string,
  targetPlan: PlanTier,
): Promise<DowngradeEvaluation> {
  const [members, folders] = await Promise.all([
    listMembers(accountId),
    listByAccount(accountId), // excludes soft-deleted rows → live folder count
  ]);
  return evaluateDowngrade(
    { memberCount: members.length, folderCount: folders.length },
    targetPlan,
  );
}
