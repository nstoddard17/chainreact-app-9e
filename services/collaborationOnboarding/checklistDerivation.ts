import type {
  CollaborationStepDTO,
  CollaborationStepKey,
  CollaborationTrack,
} from "@/contracts/collaborationOnboarding";
import type { AccountType, MembershipRole } from "@/contracts/accounts";
import type { PlanTier } from "@/core/billing/planPolicy";

/**
 * PURE collaboration-checklist derivation (5.ONBOARD-4). No I/O — the
 * orchestration layer (checklistState.ts) gathers facts from the authoritative
 * sources and this module composes them into step DTOs. Keeping it pure makes the
 * role/permission rules unit-testable across the full matrix.
 *
 * ── WHY EACH TRACK HAS THE STEPS IT HAS ────────────────────────────────────────
 *
 * Every step was checked against the REAL authorization rules before being placed
 * on a track. A checklist that asks a user to do something the server would refuse
 * is worse than no checklist, so no track contains a step its role cannot perform:
 *
 *   invite_teammate        owner ✔ admin ✔ member ✘
 *                          (app/api/accounts/[id]/invitations/route.ts gates
 *                           POST on ["owner","admin"])
 *   connect_shared_app     owner ✔ admin ✔ member ✘
 *                          (oauth connect route gates account-credential
 *                           providers on ["owner","admin"])
 *   create_shared_workflow owner ✔ admin ✔ member ✔
 *                          (workflow access is membership-only, never role-gated)
 *   review_team            owner ✔ admin ✔ member ✔
 *                          (members route allows all three roles)
 *   use_shared_workflow    member ✔ (same membership-only workflow rule)
 *
 * `teammate_joined` is OWNER-ONLY. It is a WAITING step — it completes when someone
 * else acts — and an admin was themselves invited into an account that already has
 * ≥2 members, so it would be born complete and teach nothing. Rather than show an
 * owner-only step as blocked (explicitly forbidden by the task), the admin track
 * substitutes `review_team`: a real, authorized, useful admin action.
 *
 * MEMBERS GET NO SETUP STEPS AT ALL. No invite, no waiting, no billing, no admin
 * assignment. Their four steps teach participation in an account someone else
 * already set up.
 */

/** Facts the owner/admin tracks derive from. All are ACCOUNT-level. */
export interface CollaborationAccountFacts {
  /** Active memberships in the account, owner inclusive. */
  readonly memberCount: number;
  /** Invitations still in `pending` status. */
  readonly pendingInvitationCount: number;
  /**
   * Whether the account has ≥1 HEALTHY integration on an account-credential
   * (shared) provider. Personal credentials are excluded upstream.
   */
  readonly hasSharedIntegration: boolean;
  /** Whether ≥1 non-deleted workflow exists in the account. */
  readonly hasWorkflow: boolean;
}

/** Facts the member track derives from. All are scoped to THIS user in THIS account. */
export interface CollaborationMemberFacts {
  /** Server-recorded: switched into this shared account. */
  readonly exploredWorkspace: boolean;
  /** Server-recorded: opened a workflow belonging to this shared account. */
  readonly openedSharedWorkflow: boolean;
  /** Server-recorded: viewed the shared Apps page or the team directory. */
  readonly viewedDirectory: boolean;
  /**
   * REAL usage, not a recorded visit: a workflow_runs row in this account with
   * status='succeeded' and triggered_by_user_id = this member.
   */
  readonly ranSharedWorkflow: boolean;
}

export interface DerivedCollaborationChecklist {
  readonly steps: readonly CollaborationStepDTO[];
  readonly completedStepCount: number;
  readonly totalStepCount: number;
}

/**
 * Is this account eligible for a collaboration checklist at all?
 *
 * TWO INDEPENDENT AXES, both required — this is the part that is easy to get wrong.
 * `accounts.type` is `personal | team | organization`; the PLAN lives separately in
 * `account_billing.plan`. There is no `business` or `enterprise` account TYPE:
 * "Business" and "Enterprise" are PLANS on an `organization`-type account
 * (core/billing/planPolicy.ts). So:
 *
 *   - type must be shared (`team` | `organization`) — a personal account has no
 *     collaborators and keeps ONLY the existing workflow checklist, and
 *   - plan must be an authoritative paid collaboration tier read from
 *     `account_billing.plan` — never inferred from the account type, because an
 *     `organization` account may be `business` OR `enterprise`, and a shared
 *     account whose subscription lapsed to `free`/`pro` is not a collaboration
 *     account this quarter.
 *
 * Using type alone would hand a collaboration checklist to a downgraded account;
 * using plan alone would hand one to a personal account on a mis-set plan. Both.
 */
export function isCollaborationEligible(input: {
  accountType: AccountType;
  plan: PlanTier | null;
}): boolean {
  const sharedType =
    input.accountType === "team" || input.accountType === "organization";
  if (!sharedType) return false;
  return (
    input.plan === "team" || input.plan === "business" || input.plan === "enterprise"
  );
}

/**
 * Map the viewer's REAL membership role to a checklist track.
 *
 * The role is read server-side from `account_memberships` for the ACTIVE account on
 * every request — never from client input, never cached across accounts. That is
 * what makes "a member never briefly sees the owner checklist" true: there is no
 * client-side default track to flash before the real one arrives.
 */
export function trackForRole(role: MembershipRole): CollaborationTrack {
  switch (role) {
    case "owner":
      return "team_owner";
    case "admin":
      return "team_admin";
    case "member":
      return "team_member";
  }
}

/** The ordered step keys for a track. Order is the display order. */
export function stepKeysForTrack(
  track: CollaborationTrack,
): readonly CollaborationStepKey[] {
  switch (track) {
    case "team_owner":
      return [
        "invite_teammate",
        "teammate_joined",
        "connect_shared_app",
        "create_shared_workflow",
      ];
    case "team_admin":
      return [
        "invite_teammate",
        "connect_shared_app",
        "create_shared_workflow",
        "review_team",
      ];
    case "team_member":
      return [
        "explore_workspace",
        "open_shared_workflow",
        "use_shared_workflow",
        "explore_directory",
      ];
  }
}

/**
 * Per-step completion. Every value is derived from a live authoritative fact —
 * there is never a stored "step done" boolean.
 *
 * `invite_teammate` completes on `memberCount > 1 || pendingInvitationCount > 0`.
 * The OR matters: an invitation flips from `pending` to `accepted` the moment the
 * invitee joins, so a pending-only check would tick the step green and then REGRESS
 * it to incomplete exactly when the owner succeeded. Either a live pending invite
 * or a second member is proof an invitation was genuinely sent.
 */
function isStepComplete(
  key: CollaborationStepKey,
  account: CollaborationAccountFacts,
  member: CollaborationMemberFacts,
): boolean {
  switch (key) {
    case "invite_teammate":
      return account.memberCount > 1 || account.pendingInvitationCount > 0;
    case "teammate_joined":
      // A pending invitation deliberately does NOT satisfy this — the whole point
      // of the step is that someone actually accepted and joined.
      return account.memberCount >= 2;
    case "connect_shared_app":
      return account.hasSharedIntegration;
    case "create_shared_workflow":
      return account.hasWorkflow;
    case "review_team":
      return member.viewedDirectory;
    case "explore_workspace":
      return member.exploredWorkspace;
    case "open_shared_workflow":
      return member.openedSharedWorkflow;
    case "use_shared_workflow":
      return member.ranSharedWorkflow;
    case "explore_directory":
      return member.viewedDirectory;
  }
}

/**
 * Derive the steps for one track.
 *
 * The "current" step is simply the first incomplete one in track order — every
 * collaboration step is independently actionable by the track's role (that is the
 * point of the permission audit above), so there is no need for the workflow
 * checklist's skip-ahead logic.
 */
export function deriveCollaborationSteps(input: {
  track: CollaborationTrack;
  account: CollaborationAccountFacts;
  member: CollaborationMemberFacts;
}): DerivedCollaborationChecklist {
  const keys = stepKeysForTrack(input.track);
  const doneByKey = new Map<CollaborationStepKey, boolean>(
    keys.map((k) => [k, isStepComplete(k, input.account, input.member)]),
  );
  const currentKey = keys.find((k) => !doneByKey.get(k)) ?? null;

  const steps: CollaborationStepDTO[] = keys.map((key) => ({
    key,
    status: doneByKey.get(key)
      ? "complete"
      : key === currentKey
        ? "current"
        : "pending",
  }));

  return {
    steps,
    completedStepCount: steps.filter((s) => s.status === "complete").length,
    totalStepCount: steps.length,
  };
}
