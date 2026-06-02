import type { AccountSummary } from "@/lib/api/accounts";

/**
 * Route-safe DTOs the Team page passes from the server component into the
 * client `TeamDashboard` (Slice 4.TEAM-PAGE-1). Plain serializable shapes only.
 *
 * The roster intentionally carries NO email/name for other members — the
 * `/api/accounts/[id]/members` contract returns only `userId` by design, so the
 * UI identifies the signed-in user ("You") and shows everyone else by role +
 * joined date. We never fabricate identity we don't have.
 */
export interface TeamMemberView {
  userId: string;
  role: AccountSummary["role"];
  joinedAt: string;
  /** True for the signed-in user's own row. */
  isYou: boolean;
}

export interface TeamInvitationView {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}
