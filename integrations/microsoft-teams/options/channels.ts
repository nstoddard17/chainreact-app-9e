import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { channelsList } from "@/integrations/microsoft-teams/api/channelsList";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import {
  filterByLabelOrDescription,
  mapTeamsOptionsError,
  requireTeamsIntegration,
  requireDep,
  safeDescription,
} from "./_shared";

/**
 * `microsoft-teams:channels` options resolver — Slice 4.TEAMS-META-2.
 *
 * Backs `channelId` on `send_channel_message` / `reply_to_channel_message` /
 * `get_channel_details` + the `new_channel_message` trigger. Single-parent
 * cascade off `teamId`.
 *
 * **Dep name `teamId` is pinned verbatim** to the Teams runtime Zod schemas
 * (camelCase). `teamId` is already a real field on every consumer, so NO
 * UI-scope field is needed — the metadata wires `dependsOn: "teamId"`
 * directly.
 *
 * **Auth:** refreshable → `refreshAndRetry`. Uses the new `channelsList`
 * helper (`GET /teams/{teamId}/channels`).
 *
 * Mapping (channel → OptionItem):
 *   - `value`: channel `id` (opaque).
 *   - `label`: `displayName` when non-empty, else `id`.
 *   - `description`: the channel `description` when present (trimmed +
 *     capped), else the `membershipType` (e.g. "private" / "standard") — a
 *     safe hint. **No channel `email` or message content** is read or
 *     surfaced (the helper doesn't even fetch `email`).
 *
 * Ordering: **preserves Graph order** — Graph returns "General" first then
 * channels in a meaningful order; preserving it keeps the default channel
 * at the top.
 *
 * `hasMore`: `result.nextLink !== null`.
 *
 * Cascade fallback: if `teamId` points at a team deleted / access-lost
 * between picker mounts, `channelsList` throws `NotFoundError` → return
 * empty `items` (NOT an error). Re-picking the team clears `channelId`.
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED`; other →
 * `PROVIDER_ERROR`. No token / raw body / channel-email / message-content
 * leakage.
 */
export const microsoftTeamsChannelsResolver: OptionsResolver = {
  source: "microsoft-teams:channels",
  provider: "microsoft-teams",
  requiresIntegration: true,
  requiredDeps: ["teamId"],
  async resolve(ctx) {
    const integration = requireTeamsIntegration(ctx);
    const teamId = requireDep(ctx, "teamId", "team");

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-teams",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => channelsList({ accessToken, teamId }),
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      mapTeamsOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const channel of result.channels) {
      if (typeof channel.id !== "string" || channel.id.length === 0) continue;
      const label =
        typeof channel.displayName === "string" && channel.displayName.length > 0
          ? channel.displayName
          : channel.id;
      const description =
        safeDescription(channel.description) ??
        (typeof channel.membershipType === "string" &&
        channel.membershipType.length > 0
          ? channel.membershipType
          : undefined);
      items.push(
        description !== undefined
          ? { value: channel.id, label, description }
          : { value: channel.id, label },
      );
    }

    return {
      items: filterByLabelOrDescription(items, ctx.q),
      hasMore: result.nextLink !== null,
    };
  },
};
