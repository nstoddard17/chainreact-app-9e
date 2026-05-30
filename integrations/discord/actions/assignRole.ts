import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { memberAddRole } from "../../_shared/discord/api/members";
import { AssignRoleConfigSchema } from "./assignRole.schema";

/**
 * Discord `assign_role` action handler.
 *
 * PUTs `/guilds/{guildId}/members/{userId}/roles/{roleId}` as the
 * global bot. Discord returns 204 on success (including the
 * idempotent "role already present" case).
 *
 * **Bot prerequisites** (enforced by Discord; 403 on failure):
 *   - Bot must have `Manage Roles` permission in the guild.
 *   - Bot's highest role must outrank the target role (Discord's role
 *     hierarchy rule — bot cannot assign a role higher than its own
 *     highest position).
 *
 * Output shape:
 *   { success: true, guildId, userId, roleId, timestamp }
 *
 * `success` is always true on resolve — the wrapper throws on any
 * Discord-side failure, so a returned result implies the API call
 * succeeded. Downstream nodes can branch on the presence of the
 * result rather than inspecting `success`, but it's included for
 * symmetry with V1's output shape.
 */
export const assignRole: ActionHandler = async (input) => {
  const config = AssignRoleConfigSchema.parse(input.config);

  const integration = await getActiveForExecution(input.accountId, "discord", null);
  if (!integration) {
    throw new Error("No active Discord integration found for this user.");
  }

  await memberAddRole({
    guildId: config.guildId,
    userId: config.userId,
    roleId: config.roleId,
  });

  return {
    output: {
      success: true,
      guildId: config.guildId,
      userId: config.userId,
      roleId: config.roleId,
      timestamp: new Date().toISOString(),
    },
  };
};
