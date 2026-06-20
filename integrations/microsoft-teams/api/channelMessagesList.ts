import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ChatMessageResource } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/teams/{teamId}/channels/{channelId}/messages` — Slice
 * 4.TEAMS-READ-2.
 *
 * Lists a channel's top-level messages (one page). Backs the
 * `list_channel_messages` action. New read helper: the existing
 * `channelMessageGet` fetches ONE message by id (trigger hydration); nothing
 * lists a channel's messages. Mirrors the `channelsList` / `teamMembersList`
 * transport (direct Graph `fetch` + 401/404 mapping); the handler wraps it in
 * `refreshAndRetry`.
 *
 * **Scope:** read-only against the already-granted `ChannelMessage.Read.All`
 * (the `new_channel_message` trigger already uses it for hydration) — NO new
 * scope / reconnect.
 *
 * **Body NOT bounded here on purpose.** Graph's channel-messages list is a
 * "protected API" with unreliable `$select` support, so this wrapper does
 * NOT try to strip `body` at the wire — instead the `list_channel_messages`
 * HANDLER projects an explicit metadata-only shape and never spreads the raw
 * resource, so message body / subject / sender display name never leave the
 * handler regardless of what Graph returns. `$top` caps the page.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (team/channel missing or access lost).
 *   - generic `Error` on other failures (Graph message surfaced, no token).
 */

export interface ChannelMessagesListResult {
  messages: ChatMessageResource[];
  nextLink: string | null;
}

export interface ChannelMessagesListInput {
  accessToken: string;
  teamId: string;
  channelId: string;
  /** Graph `$top` page cap (1..50 per Graph's channel-messages ceiling). */
  top?: number;
}

export async function channelMessagesList(
  input: ChannelMessagesListInput,
): Promise<ChannelMessagesListResult> {
  const url = new URL(
    `${graphApiBase()}/v1.0/teams/${encodeURIComponent(
      input.teamId,
    )}/channels/${encodeURIComponent(input.channelId)}/messages`,
  );
  if (input.top !== undefined) url.searchParams.set("$top", String(input.top));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph teams/channels/messages list GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `team ${input.teamId} channel ${input.channelId} messages`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph teams/channels/messages list GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as {
    value?: ChatMessageResource[];
    "@odata.nextLink"?: string;
  };
  return {
    messages: body.value ?? [],
    nextLink: body["@odata.nextLink"] ?? null,
  };
}
