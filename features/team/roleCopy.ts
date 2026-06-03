import type { MembershipRole } from "@/contracts/accounts";

/**
 * Plain-language role descriptions (Slice 4.TEAM-PAGE-3).
 *
 * Single source of truth for what each role can do, shared by the invite
 * dropdown helper, the role-permissions explainer, and the settings shell.
 *
 * IMPORTANT product truth: roles gate MEMBER MANAGEMENT only — they do NOT
 * restrict workflow / app / run access. Every member has full workspace access.
 * The copy here must never imply per-resource permissions we don't enforce.
 */

export interface RoleCopy {
  role: MembershipRole;
  label: string;
  /** One-line summary used in the invite dropdown helper. */
  summary: string;
  /** Short bullet points for the role-permissions explainer. */
  can: readonly string[];
  cannot: readonly string[];
}

export const ROLE_COPY: Record<MembershipRole, RoleCopy> = {
  owner: {
    role: "owner",
    label: "Owner",
    summary:
      "Full control of the team — invites people, manages members, and owns the account.",
    can: [
      "Invite and remove members",
      "Change anyone's role (except the owner)",
      "Revoke pending invites",
    ],
    cannot: ["Be removed or demoted here (ownership transfer comes later)"],
  },
  admin: {
    role: "admin",
    label: "Admin",
    summary: "Can invite people and manage members. Can't manage owners or other admins.",
    can: ["Invite new members", "Remove members and change their role"],
    cannot: ["Manage the owner or other admins", "Change billing or delete the team"],
  },
  member: {
    role: "member",
    label: "Member",
    summary:
      "Full access to the team's workflows, apps, and runs. Can't invite or manage people.",
    can: ["Build & run workflows", "Use the team's connected apps", "See run history"],
    cannot: ["Invite people or manage members"],
  },
};

/**
 * The one-sentence clarification of what roles actually gate — surfaced near the
 * member table and invite control so nobody assumes roles limit workspace access.
 */
export const ROLE_SCOPE_NOTE =
  "Roles only control who can manage people. Every member — including Members — has full access to the team's workflows, apps, and runs.";
