import type { AccountSummary } from "@/lib/api/accounts";

/**
 * Route-safe DTOs the Team page passes from the server component into the
 * client `TeamDashboard` (Slice 4.TEAM-PAGE-1). Plain serializable shapes only.
 *
 * Identity (email/displayName) is co-member-only safe display data sourced from
 * the `get_account_member_identities` RPC (4.TEAM-PAGE-2). Both are nullable;
 * the UI falls back name → email → short user id, and always marks the
 * signed-in user with "You". We never fabricate identity we don't have.
 */
export interface TeamMemberView {
  userId: string;
  role: AccountSummary["role"];
  joinedAt: string;
  /** Display identity — co-member-only; null when unavailable. */
  email: string | null;
  displayName: string | null;
  /** True for the signed-in user's own row. */
  isYou: boolean;
}

/**
 * The settings sub-nav sections that are truthful today (Slice 4.TEAM-PAGE-4).
 * Billing / Security / Notifications appear in the nav as disabled
 * "coming soon" entries — they are NOT navigable, so they are not in this union.
 */
export type TeamSection = "overview" | "members" | "roles";

export interface TeamInvitationView {
  id: string;
  email: string;
  role: string;
  status: string;
  /** Null since TEAM-INVITATION-LIFECYCLE-2 — pending invites don't expire. */
  expiresAt: string | null;
  createdAt: string;
}
