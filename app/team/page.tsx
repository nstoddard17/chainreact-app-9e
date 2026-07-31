import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as notificationsRepo from "@/repositories/notifications";
import { listUserAccountSummaries } from "@/services/accounts/accountList";
import { listMembers } from "@/services/accounts/membership";
import { listInvitations } from "@/services/accounts/invitations";
import { memberLimitFor, TEAM_MAX_MEMBERS } from "@/services/accounts/memberLimits";
import { AppShell } from "@/components/app-shell/AppShell";
import { AppPageContainer } from "@/components/app-shell/AppPageContainer";
import { applyCredentialRequestNotice } from "@/app/notifications/credentialRequestNotice";
import { recordCollaborationLearningEvent } from "@/services/collaborationOnboarding/learningEvents";
import { TeamDashboard } from "@/features/team/TeamDashboard";
import type {
  TeamInvitationView,
  TeamMemberView,
} from "@/features/team/teamTypes";
import {
  NOTIFICATION_BELL_PREVIEW_LIMIT,
  toNotificationPreview,
} from "@/app/notifications/notificationPreview";

/**
 * Team / account-management route (Slice 4.TEAM-PAGE-1).
 *
 * Thin server component: auth gate → list the caller's accounts (Personal +
 * Teams) → resolve the effective active account → if it's a team/org the caller
 * belongs to, fetch its roster (and pending invites when the caller is
 * owner/admin) → render the client `TeamDashboard`.
 *
 * Backend-truth scope (the design's Teams page, trimmed to what V2 actually
 * supports today):
 *   - Account list + create-team + switch-active  → /api/accounts, /api/account/active
 *   - Member roster + role change + remove        → /api/accounts/[id]/members[/userId]
 *   - Invites (copy-link, NO email) + revoke       → /api/accounts/[id]/invitations[/id]
 *   - 5-member Team cap messaging + org-coming-soon at the cap.
 *
 * Deliberately NOT here (no backend / out of scope): billing & usage meters,
 * security (2FA/SSO/sessions), notification prefs, workspace rename/logo/region,
 * ownership transfer, leave, and member emails/names (the roster API returns
 * only `userId` by design — we never invent identity).
 *
 * Auth + scoping mirror the sibling `/apps` + `/runs` routes: `auth.getUser()`
 * gate, then service reads. The roster/invite services are only invoked for an
 * active team the caller is authorized for, so a personal account never triggers
 * them.
 */
export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const [{ accounts, activeAccountId }, unreadNotifications, recentRecords] =
    await Promise.all([
      listUserAccountSummaries(user.id),
      notificationsRepo.countUnreadForUser(user.id),
      notificationsRepo.listForUser(user.id, {
        limit: NOTIFICATION_BELL_PREVIEW_LIMIT,
      }),
    ]);

  const active = accounts.find((a) => a.id === activeAccountId) ?? null;
  const activeIsTeam =
    active !== null &&
    (active.type === "team" || active.type === "organization") &&
    active.deletionStatus === "active";
  const canManage =
    activeIsTeam && (active!.role === "owner" || active!.role === "admin");

  let members: TeamMemberView[] = [];
  let invitations: TeamInvitationView[] = [];

  if (activeIsTeam && active) {
    // Any member may read the roster; only owner/admin may read invites.
    const memberRecords = await listMembers(active.id);
    members = memberRecords.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      // `invitedByUserId` is intentionally dropped — not display identity.
      email: m.email,
      displayName: m.displayName,
      isYou: m.userId === user.id,
    }));

    // 5.ONBOARD-4 — learning evidence for the member track's "explore shared apps
    // or team members" step and the admin track's "review team" step. Recorded
    // only after `listMembers` above actually served this caller the roster for a
    // shared account they belong to, so it proves a real authorized visit rather
    // than a client assertion. Fail-open inside.
    await recordCollaborationLearningEvent({
      userId: user.id,
      accountId: active.id,
      eventType: "collab_team_viewed",
    });

    if (canManage) {
      const inviteRecords = await listInvitations(active.id);
      invitations = inviteRecords.map((iv) => ({
        id: iv.id,
        email: iv.email,
        role: iv.role,
        status: iv.status,
        expiresAt: iv.expiresAt,
        createdAt: iv.createdAt,
      }));
    }
  }

  const memberCap = active ? memberLimitFor(active.type) : null;
  const recentNotifications = recentRecords.map(toNotificationPreview);
  // CS-8: surface pending credential-reassignment requests in the bell.
  const bell = await applyCredentialRequestNotice(
    user.id,
    unreadNotifications,
    recentNotifications,
  );

  return (
    <AppShell
      userEmail={user.email ?? ""}
      unreadNotifications={bell.unreadNotifications}
      recentNotifications={bell.recentNotifications}
    >
      {/*
        RESPONSIVE-TEAM-4 — the shared page container replaces this route's
        hand-rolled `flex w-full flex-col p-6 sm:p-8` (no bound, no `min-width: 0`,
        a padding step at 640px instead of a fluid gutter).

        `content` (1152px), matching the sibling Account Settings surface: this is
        the same shape — a 224px settings rail beside one column — and unbounded it
        stretched a member row to 1270px on a 1600px monitor, which is the
        "unreadable full-width slab" the brief rules out. Existing named variant,
        no new one.
      */}
      <AppPageContainer width="content" className="py-6 sm:py-8">
        <TeamDashboard
          accounts={accounts}
          activeAccountId={activeAccountId}
          currentUserEmail={user.email ?? ""}
          members={members}
          invitations={invitations}
          canManage={canManage}
          memberCap={memberCap}
          teamMaxMembers={TEAM_MAX_MEMBERS}
        />
      </AppPageContainer>
    </AppShell>
  );
}
