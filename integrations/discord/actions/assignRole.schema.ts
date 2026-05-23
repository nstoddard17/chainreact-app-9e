import { z } from "zod";

/**
 * Resolved-config schema for the Discord `assign_role` action.
 *
 * V1 field names preserved verbatim per Slice 3.DISCORD-1 §7.1:
 * `guildId`, `userId`, `roleId`. NO normalization.
 *
 * Note: `userId` here is the **target** Discord member's user id — the
 * user who will receive the role. Distinct from `input.userId` on the
 * ActionHandlerInput contract, which is the ChainReact workflow
 * owner's user id. V1 chose this field name; V2 preserves it (per
 * Slice 3.DISCORD-1 §7.1 note: "V1 chose `userId` (not `memberId`);
 * the meta must follow").
 *
 * Discord enforces:
 *   - Bot must have Manage Roles permission in the guild.
 *   - Bot's highest role must outrank the target role (role hierarchy).
 *   - A role-add for a role the member already has is a 204 no-op
 *     (idempotent).
 */
export const AssignRoleConfigSchema = z
  .object({
    guildId: z.string().min(1, "Discord guildId is required."),
    userId: z
      .string()
      .min(1, "Discord member userId (the role recipient) is required."),
    roleId: z.string().min(1, "Discord roleId is required."),
  })
  .strict();

export type AssignRoleConfig = z.infer<typeof AssignRoleConfigSchema>;
