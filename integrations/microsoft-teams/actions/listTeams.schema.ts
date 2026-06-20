import { z } from "zod";

/**
 * Resolved-config schema for the Teams `list_teams` action
 * (Slice 4.TEAMS-READ-2).
 *
 * `GET /me/joinedTeams` takes no caller parameters in this surface — the
 * `teamsList` wrapper applies a fixed `$select=id,displayName,description`.
 * The config is therefore an empty object. `.strict()` rejects stray fields.
 *
 * Read-only, metadata-only: returns team id/displayName/description — never
 * channel or message content.
 */
export const ListTeamsConfigSchema = z.object({}).strict();

export type ListTeamsConfig = z.infer<typeof ListTeamsConfigSchema>;
