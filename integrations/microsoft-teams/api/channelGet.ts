import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { TeamsChannelResource } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/teams/{teamId}/channels/{channelId}`.
 *
 * Used by:  `microsoft_teams_action_get_channel_details` action.
 *
 * Read-only — returns the channel resource. Scope required:
 * `Channel.ReadBasic.All`.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (team or channel missing).
 *   - generic `Error` on other failures.
 */

export interface ChannelGetInput {
  accessToken: string;
  teamId: string;
  channelId: string;
}

export async function channelGet(
  input: ChannelGetInput,
): Promise<TeamsChannelResource> {
  const url =
    `${graphApiBase()}/v1.0/teams/${encodeURIComponent(input.teamId)}` +
    `/channels/${encodeURIComponent(input.channelId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph teams/channels GET returned HTTP 401",
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
      `Microsoft Graph teams/channels GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as TeamsChannelResource;
}
