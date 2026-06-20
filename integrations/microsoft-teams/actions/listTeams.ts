import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { teamsList } from "../api/teamsList";
import { ListTeamsConfigSchema } from "./listTeams.schema";

/**
 * Teams `list_teams` action handler (Slice 4.TEAMS-READ-2).
 *
 * Read-only. Reuses the shared `teamsList` wrapper (also backs the
 * `microsoft-teams:teams` options resolver) behind `refreshAndRetry` (Q3);
 * GET-shaped so no idempotency concern. One page only — `hasMore` signals a
 * further Graph page exists; the raw `@odata.nextLink` URL is not surfaced.
 *
 * Output is bounded + explicitly projected to `{ id, displayName,
 * description }` per team — the raw Graph envelope is never spread.
 */
export const listTeams: ActionHandler = async (input) => {
  ListTeamsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-teams"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-teams",
    providerAccountId,
    apiCall: (accessToken) => teamsList({ accessToken }),
  });

  const teams = result.teams.map((t) => ({
    id: t.id,
    displayName: t.displayName ?? null,
    description: t.description ?? null,
  }));

  return {
    output: {
      teams,
      count: teams.length,
      hasMore: result.nextLink !== null,
    },
  };
};
