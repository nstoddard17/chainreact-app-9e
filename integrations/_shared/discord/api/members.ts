import { discordBotRequest } from "./_request";

/**
 * Discord REST API v10 `members` resource wrappers — Slice 3.DISCORD-2
 * (runtime port).
 *
 * Endpoints covered:
 *   - PUT /guilds/{guildId}/members/{userId}/roles/{roleId}    (memberAddRole)
 *
 * Bot-token auth is owned by `_request.ts`. The bot must have
 * `Manage Roles` permission AND its highest role must outrank the role
 * being assigned (Discord's role-hierarchy rule — bot can't assign a
 * role higher than its own highest). Both constraints fail at the API
 * layer with 403; the wrapper surfaces via `DiscordApiError`.
 *
 * Future endpoints in this resource (member fetch, kick, ban, list)
 * are deferred to a later slice per Slice 3.DISCORD-1 §7.2 (the
 * unsurfaced 18 V1 handlers are NOT ported in this arc).
 */

export interface MemberAddRoleInput {
  guildId: string;
  /** Discord member id (the user receiving the role). */
  userId: string;
  roleId: string;
  /**
   * Optional audit-log reason. Discord surfaces this in the guild's
   * audit log as the explanation for the role change.
   */
  auditLogReason?: string;
}

/**
 * PUT /guilds/{guildId}/members/{userId}/roles/{roleId}.
 *
 * Discord returns 204 on success (wrapper resolves with null). The
 * operation is idempotent: adding a role the member already has is a
 * 204 no-op, not a 4xx.
 */
export async function memberAddRole(input: MemberAddRoleInput): Promise<void> {
  await discordBotRequest<null>({
    method: "PUT",
    path: `/guilds/${encodeURIComponent(input.guildId)}/members/${encodeURIComponent(input.userId)}/roles/${encodeURIComponent(input.roleId)}`,
    // Discord docs explicitly note: "Returns a 204 empty response on
    // success". Body is optional but Discord accepts an empty body OR
    // an empty JSON object. We send no body so Content-Type stays
    // unset — fewer headers to surface in logs.
    resourceForNotFound: `member ${input.userId} or role ${input.roleId} in guild ${input.guildId}`,
    auditLogReason: input.auditLogReason,
  });
}
