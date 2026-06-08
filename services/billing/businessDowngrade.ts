import type { PlanStatus } from "@/core/billing/planPolicy";
import { isBusinessDowngradeEnabled } from "@/services/billing/billingFeatureFlags";
import { getByIdServiceRole } from "@/repositories/accounts";
import * as membershipsRepo from "@/repositories/accountMemberships";
import { removeMember } from "@/services/accounts/membership";
import * as workflowsRepo from "@/repositories/workflows";
import * as foldersRepo from "@/repositories/workflowFolders";
import { deleteFolder } from "@/services/workflowFolders/trashService";
import { applyBusinessDowngradeServiceRole } from "@/repositories/accountBilling";

/**
 * Business → Team downgrade orchestration (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-2 / CS-BD-1).
 *
 * The explicit, owner-confirmed *destructive* simplification of a Business (internal
 * `organization`) account into a simpler Team account ON THE SAME `account_id`. It is NEVER
 * webhook-driven (the webhook has no signal of intent to destroy data) — a future CS-BD-4 route
 * invokes this only after an owner's explicit confirmation. Gated by `ENABLE_BUSINESS_DOWNGRADE`
 * (default OFF).
 *
 * Steps, in this ORDER (member/folder caps derive from `accounts.type`, so the type flip must be
 * LAST — flipping first would briefly make a `team` account hold Business-sized members/folders):
 *   1. Remove every NON-OWNER member via the existing offboarding seam (`removeMember`), which
 *      revokes their per-node credential grants (CS-6 → fall back to creator) and soft-disconnects
 *      their personal-provider integrations (22C); account/service integrations + API keys survive.
 *      The owner is never removed (removeMember's owner guard).
 *   2. Flatten folders: move every live workflow to root/uncategorized (`updateFolder(id, null)`),
 *      then send the (now workflow-free) top-level folders to Trash via the existing trash service
 *      (`with_contents` covers each subtree; 7-day restore). NO workflow is deleted or moved to a
 *      personal account.
 *   3. Atomic flip: `apply_business_downgrade` RPC sets type→team, plan→team, tasks_limit→Team
 *      policy in one transaction (Stripe attachment untouched).
 *
 * Every step is IDEMPOTENT, so a partially-applied downgrade is RESUMABLE (re-run skips done work):
 * an already-removed member → `member_not_found` (treated as done); a workflow already at root →
 * no-op; an already-trashed folder is excluded from the live list; an already-team account → the
 * RPC's `already_team` no-op.
 *
 * EXECUTION CONTEXT: the folder/workflow reads + writes (`workflowsRepo` / `foldersRepo` /
 * `trashService`) use the session (RLS) client, so this must run inside the confirming OWNER's
 * authenticated request (the owner is a member → RLS permits the account-scoped reads/writes). The
 * membership offboarding internals and the flip RPC are service-role. This slice exposes only the
 * service primitive — no route/UI is wired yet (CS-BD-3/4).
 */

export type BusinessDowngradeReason =
  | "disabled"
  | "account_not_found"
  | "account_frozen"
  | "not_owner"
  | "not_business"
  | "offboarding_failed"
  | "folder_flatten_failed"
  | "flip_failed";

export type BusinessDowngradeResult =
  | { ok: true; alreadyTeam: boolean; removedMembers: number; flattenedFolders: number }
  | { ok: false; reason: BusinessDowngradeReason };

export interface DowngradeBusinessToTeamInput {
  accountId: string;
  /** The user confirming the downgrade — must be the account OWNER. */
  actorUserId: string;
  /** Plan status to stamp on the resulting Team billing row. Defaults to 'active'. */
  planStatus?: PlanStatus;
}

export async function downgradeBusinessToTeam(
  input: DowngradeBusinessToTeamInput,
): Promise<BusinessDowngradeResult> {
  if (!isBusinessDowngradeEnabled()) return { ok: false, reason: "disabled" };

  const account = await getByIdServiceRole(input.accountId);
  if (!account) return { ok: false, reason: "account_not_found" };
  if (account.deletionStatus === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }

  // Destructive action — owner only (the future route also gates, but re-validate here).
  const actorRole = await membershipsRepo.getRoleServiceRole(input.accountId, input.actorUserId);
  if (actorRole !== "owner") return { ok: false, reason: "not_owner" };

  // Idempotent: a prior run already flipped the account to Team.
  if (account.type === "team") {
    return { ok: true, alreadyTeam: true, removedMembers: 0, flattenedFolders: 0 };
  }
  if (account.type !== "organization") {
    // personal (or any non-business shape) cannot be downgraded to Team.
    return { ok: false, reason: "not_business" };
  }

  // ── 1) Remove all non-owner members through the existing safe offboarding ──────────────────
  const members = await membershipsRepo.listByAccount(input.accountId);
  let removedMembers = 0;
  for (const m of members) {
    if (m.role === "owner") continue; // owner is always retained
    const res = await removeMember({
      accountId: input.accountId,
      targetUserId: m.userId,
      actingRole: "owner", // owner-initiated downgrade can offboard admins + members
    });
    if (res.ok) {
      removedMembers++;
      continue;
    }
    if (res.reason === "member_not_found") continue; // already gone → resumable, keep going
    // owner_target can't happen (we skip owners); anything else is unexpected → stop safely.
    return { ok: false, reason: "offboarding_failed" };
  }

  // ── 2) Flatten folders: workflows → root, then trash the (empty) folders ───────────────────
  const workflows = await workflowsRepo.listByAccount(input.accountId); // live (non-deleted)
  for (const wf of workflows) {
    if (wf.folderId != null) {
      await workflowsRepo.updateFolder(wf.id, null); // move to uncategorized/root (kept, not deleted)
    }
  }
  const folders = await foldersRepo.listByAccount(input.accountId); // live folders only
  let flattenedFolders = 0;
  for (const folder of folders) {
    if (folder.parentFolderId != null) continue; // top-level only — with_contents trashes the subtree
    const res = await deleteFolder({
      folderId: folder.id,
      userId: input.actorUserId,
      mode: "with_contents", // workflows already moved to root → this trashes folders, no workflows
    });
    if (res.ok) {
      flattenedFolders++;
      continue;
    }
    if (res.code === "FOLDER_NOT_FOUND") continue; // already trashed → resumable, keep going
    return { ok: false, reason: "folder_flatten_failed" };
  }

  // ── 3) Atomic type/plan/tasks_limit flip — LAST ────────────────────────────────────────────
  const flip = await applyBusinessDowngradeServiceRole({
    accountId: input.accountId,
    planStatus: input.planStatus ?? "active",
  });
  if (!flip.ok) return { ok: false, reason: "flip_failed" };

  return { ok: true, alreadyTeam: false, removedMembers, flattenedFolders };
}
