import { z } from "zod";

/**
 * 5.ONBOARD-4 — role-specific collaboration onboarding checklists.
 *
 * A SEPARATE checklist from the first-workflow one (contracts/onboarding.ts). It
 * exists only on SHARED accounts (Team / Business / Enterprise) and its content
 * depends on the viewer's role in the ACTIVE account.
 *
 * SAFE PROJECTION. The DTO carries step keys, statuses, counts, and a track id —
 * nothing else. It deliberately never carries: invitation email addresses, member
 * names/emails/identities, member counts as a roster, integration ids or provider
 * account labels, credentials, or billing values. A member reading their own
 * checklist learns only whether an account-level fact is true, never who or what
 * satisfied it. See services/collaborationOnboarding/checklistState.ts.
 */

/**
 * Checklist identity — NOT the user's current role.
 *
 * Business and Enterprise reuse the `team_*` tracks on purpose: their collaboration
 * STEPS are identical, because no plan-specific collaboration feature exists to
 * differ on (verified against core/billing/planPolicy.ts — the plans differ only in
 * member CAPS, and a cap is not a setup action a checklist can teach). Inventing
 * `business_owner` / `enterprise_owner` tracks whose steps are byte-identical would
 * fragment completion history for zero user-visible benefit. When a genuinely
 * plan-specific collaboration feature ships, add its track here; existing `team_*`
 * rows stay valid history.
 */
export const COLLABORATION_TRACKS = [
  "team_owner",
  "team_admin",
  "team_member",
] as const;

export type CollaborationTrack = (typeof COLLABORATION_TRACKS)[number];

/**
 * Every step key across every track. Each track uses a disjoint-ish subset; the
 * union exists so the DTO, the events ledger, and the copy map share one vocabulary.
 *
 * OWNER   → invite_teammate, teammate_joined, connect_shared_app, create_shared_workflow
 * ADMIN   → invite_teammate, connect_shared_app, create_shared_workflow, review_team
 * MEMBER  → explore_workspace, open_shared_workflow, use_shared_workflow, explore_directory
 *
 * `teammate_joined` is OWNER-ONLY on purpose: it is a waiting step, and an admin who
 * joined an already-populated account has nothing to wait for. Admins get
 * `review_team` instead — a real action they are authorized to perform — rather than
 * an owner step rendered as blocked.
 */
export const COLLABORATION_STEP_KEYS = [
  // owner + admin
  "invite_teammate",
  "teammate_joined",
  "connect_shared_app",
  "create_shared_workflow",
  "review_team",
  // member
  "explore_workspace",
  "open_shared_workflow",
  "use_shared_workflow",
  "explore_directory",
] as const;

export type CollaborationStepKey = (typeof COLLABORATION_STEP_KEYS)[number];

export type CollaborationStepStatus = "complete" | "current" | "pending";

export interface CollaborationStepDTO {
  readonly key: CollaborationStepKey;
  readonly status: CollaborationStepStatus;
}

export interface CollaborationPresentationDTO {
  readonly dismissed: boolean;
  readonly minimized: boolean;
  /** True until the completion celebration has been shown once. */
  readonly celebrationPending: boolean;
}

export interface CollaborationChecklistDTO {
  /**
   * Which checklist this is. The UI keys its copy, its persistence, and its
   * `data-testid`s off this, so a role change swaps the whole card rather than
   * mutating the previous track's progress.
   */
  readonly track: CollaborationTrack;
  readonly completed: boolean;
  readonly completedAt: string | null;
  readonly presentation: CollaborationPresentationDTO;
  readonly steps: readonly CollaborationStepDTO[];
  readonly completedStepCount: number;
  readonly totalStepCount: number;
}

/**
 * Presentation mutations — the ONLY client-writable surface, and only for the
 * caller's OWN current track (the server re-derives the track from live account
 * state and ignores any client-supplied track; see the presentation route).
 * `.strict()` so a body attempting to smuggle `track`, `completedAt`, or step state
 * is a 400, never a silent write.
 */
export const CollaborationPresentationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss") }).strict(),
  z.object({ action: z.literal("reopen") }).strict(),
  z.object({ action: z.literal("minimize") }).strict(),
  z.object({ action: z.literal("expand") }).strict(),
  z.object({ action: z.literal("celebrated") }).strict(),
]);

export type CollaborationPresentationAction = z.infer<
  typeof CollaborationPresentationActionSchema
>;
