import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ChatMessageResource } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `POST /v1.0/teams/{teamId}/channels/{channelId}/messages/{messageId}/replies`.
 *
 * Used by:  `microsoft_teams_action_reply_to_channel_message` action.
 *
 * Body shape identical to `channelMessageSend`. Graph echoes the reply
 * chatMessage on 201 with `replyToId` set to the parent's id.
 *
 * V2 normalizes V1 inconsistency: V1's replyToMessage handler omits
 * `contentType` (relying on Graph's plain-text default) while V1's
 * sendMessage / sendChatMessage hardcode `'html'`. V2 requires the
 * caller to specify and defaults to `'html'` at the action layer for
 * uniformity.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (team, channel, or parent message
 *     missing).
 *   - generic `Error` on other failures.
 */

export interface ChannelMessageReplyInput {
  accessToken: string;
  teamId: string;
  channelId: string;
  messageId: string;
  contentType: "text" | "html";
  content: string;
}

export async function channelMessageReply(
  input: ChannelMessageReplyInput,
): Promise<ChatMessageResource> {
  const url =
    `${graphApiBase()}/v1.0/teams/${encodeURIComponent(input.teamId)}` +
    `/channels/${encodeURIComponent(input.channelId)}` +
    `/messages/${encodeURIComponent(input.messageId)}/replies`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      body: { contentType: input.contentType, content: input.content },
    }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph teams/channels/messages/replies POST returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `team ${input.teamId} channel ${input.channelId} message ${input.messageId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph teams/channels/messages/replies POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as ChatMessageResource;
}
