import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { teamsList } from "@/integrations/microsoft-teams/api/teamsList";
import {
  filterByLabelOrDescription,
  mapTeamsOptionsError,
  requireTeamsIntegration,
  safeDescription,
} from "./_shared";

/**
 * `microsoft-teams:teams` options resolver — Slice 4.TEAMS-META-2.
 *
 * Account-scoped team picker (no deps). The cascade ROOT every Teams
 * action's `teamId` hangs off (and the parent of the `channels` resolver),
 * plus the `new_channel_message` trigger's `teamId`.
 *
 * **Why a resolver is required:** a Teams `teamId` is an opaque Graph id
 * (`19:...@thread.tacv2`), not a human-typeable value.
 *
 * **Auth:** refreshable → `refreshAndRetry({provider:"microsoft-teams",
 * accountId})`. Uses the new `teamsList` helper (`GET /me/joinedTeams`).
 *
 * Mapping (team → OptionItem):
 *   - `value`: team `id` (the opaque id handlers/trigger consume as teamId).
 *   - `label`: `displayName` when non-empty, else `id`.
 *   - `description`: the team `description` when present (trimmed + capped) —
 *     safe, non-secret metadata. No channel/message content is read here.
 *
 * Ordering: **sorted by label (alphabetical)** — `/me/joinedTeams` order
 * has no strong meaning for a flat picker; alpha sort aids findability
 * (matches the `microsoft-onedrive:folders` / `airtable:bases` root-picker
 * precedent).
 *
 * `hasMore`: `result.nextLink !== null` (Graph paging; a user's team list
 * is small).
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED`; anything else →
 * `PROVIDER_ERROR`. Token / raw Graph body never reach the browser.
 */
export const microsoftTeamsTeamsResolver: OptionsResolver = {
  source: "microsoft-teams:teams",
  provider: "microsoft-teams",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireTeamsIntegration(ctx);

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-teams",
        providerAccountId: integration.accountId,
        apiCall: (accessToken) => teamsList({ accessToken }),
      });
    } catch (err) {
      mapTeamsOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const team of result.teams) {
      if (typeof team.id !== "string" || team.id.length === 0) continue;
      const label =
        typeof team.displayName === "string" && team.displayName.length > 0
          ? team.displayName
          : team.id;
      const description = safeDescription(team.description);
      items.push(
        description !== undefined
          ? { value: team.id, label, description }
          : { value: team.id, label },
      );
    }

    const filtered = filterByLabelOrDescription(items, ctx.q).sort((a, b) =>
      a.label.localeCompare(b.label),
    );

    return { items: filtered, hasMore: result.nextLink !== null };
  },
};
