import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ChatMessageResource } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `POST /v1.0/teams/{teamId}/channels/{channelId}/messages`.
 *
 * Used by:  `microsoft_teams_action_send_channel_message` action.
 *
 * Body shape: `{ body: { contentType: 'text'|'html', content } }`.
 * Graph echoes the full chatMessage resource on 201 — id, createdDateTime,
 * from.user, webUrl, and the body block. V2 surfaces a narrow downstream
 * output via `normalizeChatMessage` (action layer); this wrapper is pure
 * fetch + parse.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (team or channel missing, or the user
 *     lacks ChannelMessage.Send on this channel).
 *   - generic `Error` on other failures, surfacing Graph's error message.
 */

export interface ChannelMessageSendInput {
  accessToken: string;
  teamId: string;
  channelId: string;
  contentType: "text" | "html";
  content: string;
}

export async function channelMessageSend(
  input: ChannelMessageSendInput,
): Promise<ChatMessageResource> {
  const url =
    `${graphApiBase()}/v1.0/teams/${encodeURIComponent(input.teamId)}` +
    `/channels/${encodeURIComponent(input.channelId)}/messages`;

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
      "Microsoft Graph teams/channels/messages POST returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `team ${input.teamId} channel ${input.channelId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph teams/channels/messages POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as ChatMessageResource;
}
