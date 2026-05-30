import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { channelGet } from "../api/channelGet";
import { GetChannelDetailsConfigSchema } from "./getChannelDetails.schema";

/**
 * Teams `get_channel_details` action handler.
 *
 * Read-only — returns the channel resource.
 *
 * Output shape (downstream variable refs):
 *   { channelId, displayName, description, email, membershipType,
 *     createdDateTime, webUrl, teamId }
 */
export const getChannelDetails: ActionHandler = async (input) => {
  const config = GetChannelDetailsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-teams"
      ? input.triggerEvent.providerAccountId
      : null;

  const channel = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-teams",
    providerAccountId,
    apiCall: (accessToken) =>
      channelGet({
        accessToken,
        teamId: config.teamId,
        channelId: config.channelId,
      }),
  });

  return {
    output: {
      teamId: config.teamId,
      channelId: channel.id,
      displayName: channel.displayName ?? "",
      description: channel.description ?? null,
      email: channel.email ?? null,
      membershipType: channel.membershipType ?? null,
      createdDateTime: channel.createdDateTime ?? null,
      webUrl: channel.webUrl ?? null,
    },
  };
};
