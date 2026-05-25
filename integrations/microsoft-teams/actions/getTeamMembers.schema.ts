import { z } from "zod";

/**
 * Resolved-config schema for the Teams get_team_members action.
 *
 * Read-only. Returns one page of conversationMember resources plus a
 * `nextLink` for forward-compat. Slice 16 does NOT auto-paginate —
 * workflow authors who need page 2+ chain a follow-up call (matches
 * the OneDrive list_items + Outlook Calendar list_events precedent).
 *
 * `top` is Graph's $top page-size (1..999).
 */
export const GetTeamMembersConfigSchema = z
  .object({
    teamId: z.string().min(1),
    top: z.number().int().min(1).max(999).optional(),
  })
  .strict();

export type GetTeamMembersConfig = z.infer<
  typeof GetTeamMembersConfigSchema
>;
