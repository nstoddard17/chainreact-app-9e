import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ChatMessageResource } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/teams/{teamId}/channels/{channelId}/messages/{messageId}`.
 *
 * Used by:  `new_channel_message` trigger receive path — the
 *           subscription is created with `includeResourceData: false`
 *           (no encryption cert plumbing), so the inbound notification
 *           only carries the message id. The receive route GETs the
 *           full message resource here to hydrate the trigger event
 *           payload.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (message deleted between the
 *     notification arrival and our fetch, or team/channel gone).
 *   - generic `Error` on other failures with Graph error message
 *     surfaced.
 */

export interface ChannelMessageGetInput {
  accessToken: string;
  teamId: string;
  channelId: string;
  messageId: string;
}

export async function channelMessageGet(
  input: ChannelMessageGetInput,
): Promise<ChatMessageResource> {
  const url =
    `${graphApiBase()}/v1.0/teams/${encodeURIComponent(input.teamId)}` +
    `/channels/${encodeURIComponent(input.channelId)}` +
    `/messages/${encodeURIComponent(input.messageId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph teams/channels/messages GET returned HTTP 401",
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
      `Microsoft Graph teams/channels/messages GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as ChatMessageResource;
}
