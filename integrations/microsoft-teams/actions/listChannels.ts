import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { channelsList } from "../api/channelsList";
import { ListChannelsConfigSchema } from "./listChannels.schema";

/**
 * Teams `list_channels` action handler (Slice 4.TEAMS-READ-2).
 *
 * Read-only. Reuses the shared `channelsList` wrapper (also backs the
 * `microsoft-teams:channels` options resolver) behind `refreshAndRetry` (Q3);
 * GET-shaped so no idempotency concern. One page only — `hasMore` signals a
 * further Graph page; the raw `@odata.nextLink` URL is not surfaced.
 *
 * Output is bounded + explicitly projected to `{ id, displayName,
 * description, membershipType }` per channel — the raw Graph envelope (which
 * the wrapper's `$select` already trims, notably dropping the sensitive
 * channel `email`) is never spread.
 */
export const listChannels: ActionHandler = async (input) => {
  const config = ListChannelsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-teams"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-teams",
    providerAccountId,
    apiCall: (accessToken) =>
      channelsList({ accessToken, teamId: config.teamId }),
  });

  const channels = result.channels.map((c) => ({
    id: c.id,
    displayName: c.displayName ?? null,
    description: c.description ?? null,
    membershipType: c.membershipType ?? null,
  }));

  return {
    output: {
      teamId: config.teamId,
      channels,
      count: channels.length,
      hasMore: result.nextLink !== null,
    },
  };
};
