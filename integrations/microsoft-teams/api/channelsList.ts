import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { TeamsChannelResource } from "./types";

/**
 * Wrapper for Microsoft Graph `GET /v1.0/teams/{teamId}/channels` — Slice
 * 4.TEAMS-META-2.
 *
 * Lists the channels of a single team. Backs the `microsoft-teams:channels`
 * options resolver, which serves `channelId` on `send_channel_message` /
 * `reply_to_channel_message` / `get_channel_details` + the
 * `new_channel_message` trigger — single-parent cascade off `teamId`.
 *
 * New read helper: `channelGet` fetches ONE channel; nothing lists a team's
 * channels. Mirrors the `teamMembersList` transport; resolvers wrap it in
 * `refreshAndRetry`. Read-only against the existing `Channel.ReadBasic.All`
 * scope — no scope change / reconnect.
 *
 * **`$select=id,displayName,description,membershipType` deliberately omits
 * the channel `email` field** — a channel's email address is sensitive (the
 * action output marks it sensitive), and the picker has no need for it, so
 * it is never fetched here. No message content is requested.
 *
 * A 404 means the parent team was deleted / access lost → `NotFoundError`;
 * the resolver maps that to empty items (cascade fallback). Graph paginates
 * via `@odata.nextLink` (channel lists are small); returns one page + the
 * nextLink.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (team missing or user lacks access).
 *   - generic `Error` on other failures (Graph message surfaced, no token).
 */

export interface ChannelsListResult {
  channels: TeamsChannelResource[];
  nextLink: string | null;
}

export interface ChannelsListInput {
  accessToken: string;
  teamId: string;
}

export async function channelsList(
  input: ChannelsListInput,
): Promise<ChannelsListResult> {
  const url = new URL(
    `${graphApiBase()}/v1.0/teams/${encodeURIComponent(input.teamId)}/channels`,
  );
  url.searchParams.set("$select", "id,displayName,description,membershipType");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph teams/channels list GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `team ${input.teamId} channels`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph teams/channels list GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as {
    value?: TeamsChannelResource[];
    "@odata.nextLink"?: string;
  };
  return {
    channels: body.value ?? [],
    nextLink: body["@odata.nextLink"] ?? null,
  };
}
