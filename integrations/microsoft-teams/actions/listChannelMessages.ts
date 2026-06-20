import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { channelMessagesList } from "../api/channelMessagesList";
import { ListChannelMessagesConfigSchema } from "./listChannelMessages.schema";

/**
 * Teams `list_channel_messages` action handler (Slice 4.TEAMS-READ-2).
 *
 * Read-only. Lists one page of channel messages via the new
 * `channelMessagesList` wrapper behind `refreshAndRetry` (Q3); GET-shaped so
 * no idempotency concern. One page only — `hasMore` signals a further Graph
 * page; the raw `@odata.nextLink` URL is not surfaced.
 *
 * **Metadata-only, body-safe by construction.** Each message is projected to
 * an explicit header-level shape — the raw Graph `chatMessage` is NEVER
 * spread, so `body` (HTML/text content), `subject`, `summary`, `attachments`,
 * `reactions`, `mentions`, and the sender's `displayName` (PII) never leave
 * the handler even though Graph returns them. Only the sender's opaque AAD
 * object id (`fromUserId`) and structural fields are surfaced.
 */
export const listChannelMessages: ActionHandler = async (input) => {
  const config = ListChannelMessagesConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-teams"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-teams",
    providerAccountId,
    apiCall: (accessToken) =>
      channelMessagesList({
        accessToken,
        teamId: config.teamId,
        channelId: config.channelId,
        top: config.top,
      }),
  });

  const messages = result.messages.map((m) => ({
    id: m.id,
    createdDateTime: m.createdDateTime ?? null,
    lastModifiedDateTime: m.lastModifiedDateTime ?? null,
    importance: m.importance ?? null,
    messageType: m.messageType ?? null,
    // Sender's opaque AAD object id only — NOT displayName (PII).
    fromUserId: m.from?.user?.id ?? null,
    webUrl: m.webUrl ?? null,
  }));

  return {
    output: {
      teamId: config.teamId,
      channelId: config.channelId,
      messages,
      count: messages.length,
      hasMore: result.nextLink !== null,
    },
  };
};
