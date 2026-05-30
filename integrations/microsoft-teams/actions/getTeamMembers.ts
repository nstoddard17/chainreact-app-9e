import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { teamMembersList } from "../api/teamMembersList";
import { GetTeamMembersConfigSchema } from "./getTeamMembers.schema";

/**
 * Teams `get_team_members` action handler.
 *
 * Read-only — returns the team's conversationMember roster. Uses
 * `TeamMember.Read.All` (NOT the admin-consent `.ReadWrite.All`).
 *
 * Output shape (downstream variable refs):
 *   { teamId, members: [{ memberId, displayName, email, userId,
 *                         roles, isOwner }],
 *     count, hasMore, nextLink }
 *
 * `isOwner` is a convenience boolean derived from `roles.includes('owner')`
 * — the most common consumer filter for downstream workflow logic.
 */
export const getTeamMembers: ActionHandler = async (input) => {
  const config = GetTeamMembersConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-teams"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-teams",
    providerAccountId,
    apiCall: (accessToken) =>
      teamMembersList({
        accessToken,
        teamId: config.teamId,
        top: config.top,
      }),
  });

  return {
    output: {
      teamId: config.teamId,
      members: result.members.map((m) => ({
        memberId: m.id,
        displayName: m.displayName ?? "",
        email: m.email ?? null,
        userId: m.userId ?? null,
        roles: m.roles ?? [],
        isOwner: (m.roles ?? []).includes("owner"),
      })),
      count: result.members.length,
      hasMore: result.nextLink !== null,
      nextLink: result.nextLink,
    },
  };
};
