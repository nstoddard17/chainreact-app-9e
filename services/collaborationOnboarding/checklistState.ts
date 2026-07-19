import type {
  CollaborationChecklistDTO,
  CollaborationTrack,
} from "@/contracts/collaborationOnboarding";
import { isAccountCredentialProvider } from "@/core/integrations/credentialSharing";
import * as accountsRepo from "@/repositories/accounts";
import * as membershipsRepo from "@/repositories/accountMemberships";
import * as invitationsRepo from "@/repositories/accountInvitations";
import * as integrationsRepo from "@/repositories/integrations";
import * as workflowsRepo from "@/repositories/workflows";
import * as runsRepo from "@/repositories/workflowRuns";
import * as eventsRepo from "@/repositories/onboarding/onboardingEvents";
import * as collabRepo from "@/repositories/onboarding/collaborationOnboardingStates";
import { getPlan } from "@/repositories/accountBilling";
import { isIntegrationHealthy } from "@/services/onboarding/checklistDerivation";
import { recordOnboardingEvent } from "@/services/onboarding/onboardingEvents";
import {
  deriveCollaborationSteps,
  isCollaborationEligible,
  trackForRole,
  type CollaborationAccountFacts,
  type CollaborationMemberFacts,
} from "./checklistDerivation";
import { isCollaborationOnboardingEnabled } from "./flags";

/**
 * Collaboration onboarding orchestration (5.ONBOARD-4).
 *
 * Resolves the viewer's TRACK from live server state, gathers the authoritative
 * facts for that track only, performs the two server-side latches (first_shown_at;
 * silent historical completion), and returns the safe DTO.
 *
 * ── AUTHORIZATION / SCOPING CONTRACT ──────────────────────────────────────────
 * Callers MUST have membership-resolved (userId, accountId) via
 * `requireUserWithAccount` before calling. This service then re-reads the ROLE
 * itself from `account_memberships` — it never accepts a role or track from the
 * caller, let alone from client input. That single rule is what makes the whole
 * feature safe:
 *   - a member cannot request the owner checklist,
 *   - a demoted user's next load silently moves to the correct track,
 *   - switching accounts re-derives role + plan for the NEW account, so progress
 *     and role never leak across accounts.
 *
 * ── NO-LEAK CONTRACT ──────────────────────────────────────────────────────────
 * The facts gathered here include counts and existence booleans; the DTO exposes
 * only per-step booleans derived from them. Deliberately never returned: invitation
 * email addresses, invitee or member identities, the member list, integration ids /
 * provider keys / account labels, credentials, or any billing value (the plan is
 * read for ELIGIBILITY and then discarded). A member learns "the account has a
 * shared app connected", never which one or who connected it.
 */

/** Returns null when the account is not eligible or the flag is off. */
export async function getCollaborationChecklist(input: {
  userId: string;
  accountId: string;
}): Promise<CollaborationChecklistDTO | null> {
  if (!isCollaborationOnboardingEnabled()) return null;
  const { userId, accountId } = input;

  // Role, account type, and plan are all read server-side for THIS request.
  const [role, account, plan] = await Promise.all([
    membershipsRepo.getRoleServiceRole(accountId, userId),
    accountsRepo.getByIdServiceRole(accountId),
    // Authoritative billing tier. NOT inferred from account.type — an
    // `organization` account may be `business` OR `enterprise`, and a lapsed
    // shared account may be `free`. Fails closed: a throw/absent row → null →
    // ineligible.
    getPlan(accountId).catch(() => null),
  ]);

  if (role === null || account === null) return null;
  if (!isCollaborationEligible({ accountType: account.type, plan })) return null;

  const track = trackForRole(role);
  return buildForTrack({ userId, accountId, track });
}

/**
 * Which learning events each track needs. Only these are read — the admin track
 * never queries member-only evidence, and the owner track queries none at all.
 */
function learningEventsForTrack(
  track: CollaborationTrack,
): readonly eventsRepo.CollaborationLearningEventType[] {
  switch (track) {
    case "team_owner":
      return [];
    case "team_admin":
      // review_team is satisfied by viewing the team directory.
      return ["collab_team_viewed"];
    case "team_member":
      return [
        "collab_workspace_explored",
        "collab_shared_workflow_opened",
        "collab_apps_viewed",
        "collab_team_viewed",
      ];
  }
}

async function buildForTrack(input: {
  userId: string;
  accountId: string;
  track: CollaborationTrack;
}): Promise<CollaborationChecklistDTO> {
  const { userId, accountId, track } = input;
  const needsAccountFacts = track === "team_owner" || track === "team_admin";
  const needsMemberRunFact = track === "team_member";
  const learningTypes = learningEventsForTrack(track);

  const [row, accountFacts, recordedTypes, ranSharedWorkflow] = await Promise.all([
    collabRepo.getServiceRole(userId, accountId, track),
    needsAccountFacts
      ? gatherAccountFacts(accountId)
      : Promise.resolve(EMPTY_ACCOUNT_FACTS),
    learningTypes.length > 0
      ? eventsRepo.findRecordedTypesServiceRole({
          userId,
          accountId,
          types: learningTypes,
        })
      : Promise.resolve(new Set<eventsRepo.CollaborationLearningEventType>()),
    needsMemberRunFact
      ? runsRepo.hasSucceededRunByUserInAccountServiceRole({ accountId, userId })
      : Promise.resolve(false),
  ]);

  const memberFacts: CollaborationMemberFacts = {
    exploredWorkspace: recordedTypes.has("collab_workspace_explored"),
    openedSharedWorkflow: recordedTypes.has("collab_shared_workflow_opened"),
    // Either surface satisfies "explore shared apps or team members".
    viewedDirectory:
      recordedTypes.has("collab_apps_viewed") ||
      recordedTypes.has("collab_team_viewed"),
    ranSharedWorkflow,
  };

  const derived = deriveCollaborationSteps({
    track,
    account: accountFacts,
    member: memberFacts,
  });

  // ── Completion latch ────────────────────────────────────────────────────────
  // Completion is DERIVED, never stored per step: every load re-computes the steps
  // and latches once they are all complete. The latch exists only to freeze the
  // completion timestamp and to decide whether a celebration is owed.
  //
  // SILENT when this user has never been shown this track's card (first_shown_at
  // null). That is exactly the "existing accounts" case: an owner who invited,
  // connected, and built long before this checklist shipped has their historical
  // setup recognized without a celebration for work they did not just do. A user
  // who HAS seen the card and then finishes the last step gets the celebration.
  let effectiveRow = row;
  const allComplete = derived.completedStepCount === derived.totalStepCount;
  if (allComplete && !row?.completedAt) {
    const silent = !row?.firstShownAt;
    const won = await collabRepo.latchCompletionServiceRole({
      userId,
      accountId,
      track,
      silent,
    });
    if (won) {
      void recordOnboardingEvent({
        userId,
        accountId,
        eventType: "collab_onboarding_completed",
        metadata: { silent, user_role: track },
      });
    }
    effectiveRow = await collabRepo.getServiceRole(userId, accountId, track);
  }

  const dismissed = effectiveRow?.dismissedAt != null;
  const completedAt = effectiveRow?.completedAt ?? null;

  // first_shown_at latch — mirrors the workflow checklist. Fail-open: an analytics
  // write must never break the card.
  if (!dismissed && !effectiveRow?.firstShownAt && !completedAt) {
    try {
      await collabRepo.latchFirstShownServiceRole(userId, accountId, track);
      void recordOnboardingEvent({
        userId,
        accountId,
        eventType: "collab_onboarding_shown",
        metadata: { user_role: track },
      });
    } catch {
      /* fail-open */
    }
  }

  return {
    track,
    completed: completedAt !== null,
    completedAt,
    presentation: {
      dismissed,
      minimized: effectiveRow?.minimized ?? false,
      celebrationPending:
        completedAt !== null && effectiveRow?.celebratedAt == null,
    },
    steps: derived.steps,
    completedStepCount: derived.completedStepCount,
    totalStepCount: derived.totalStepCount,
  };
}

const EMPTY_ACCOUNT_FACTS: CollaborationAccountFacts = {
  memberCount: 0,
  pendingInvitationCount: 0,
  hasSharedIntegration: false,
  hasWorkflow: false,
};

async function gatherAccountFacts(
  accountId: string,
): Promise<CollaborationAccountFacts> {
  const [memberCount, pendingInvitationCount, integrations, workflows] =
    await Promise.all([
      membershipsRepo.countMembersServiceRole(accountId),
      invitationsRepo.countPendingForAccountServiceRole(accountId),
      integrationsRepo.listActiveByAccount(accountId),
      // Existence probe only — `listByAccountServiceRole` already excludes
      // state='deleted', so a non-empty result IS "a non-deleted workflow exists".
      workflowsRepo.listByAccountServiceRole(accountId, { limit: 1 }),
    ]);

  // "Connect a SHARED app" — personal credentials must not count. Two conditions,
  // both required:
  //   1. the provider is account-class (core/integrations/credentialSharing.ts —
  //      slack/notion/stripe/shopify/hubspot/mailchimp/quickbooks/motive/adp).
  //      A member's Gmail is a personal credential and never satisfies this step.
  //   2. the connection is genuinely usable right now (same health rule the
  //      workflow checklist uses) — a revoked or dead credential must not tick a
  //      step green when the next run would fail on it.
  //
  // We deliberately do NOT consult `integration_sharing_scope`: explicit sharing is
  // behind ENABLE_CONNECTION_SHARING (default OFF), so that column is inert today
  // and reading it would make this step uncompletable.
  const hasSharedIntegration = integrations.some(
    (i) => isAccountCredentialProvider(i.provider) && isIntegrationHealthy(i),
  );

  return {
    memberCount,
    pendingInvitationCount,
    hasSharedIntegration,
    hasWorkflow: workflows.length > 0,
  };
}

/**
 * Resolve the caller's CURRENT track without building the whole checklist.
 * Used by the presentation route so a client can only ever mutate the track its
 * own live role selects — the request body has no track field at all.
 */
export async function resolveCurrentTrack(input: {
  userId: string;
  accountId: string;
}): Promise<CollaborationTrack | null> {
  if (!isCollaborationOnboardingEnabled()) return null;
  const [role, account, plan] = await Promise.all([
    membershipsRepo.getRoleServiceRole(input.accountId, input.userId),
    accountsRepo.getByIdServiceRole(input.accountId),
    getPlan(input.accountId).catch(() => null),
  ]);
  if (role === null || account === null) return null;
  if (!isCollaborationEligible({ accountType: account.type, plan })) return null;
  return trackForRole(role);
}
