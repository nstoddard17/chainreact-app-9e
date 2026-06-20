import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { NotFoundError, surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Bounded, READ-ONLY, COUNT-ONLY + METADATA-ONLY Microsoft Teams reader for the
 * analytics source (Slice ANALYTICS-SOURCES-TEAMS-1). Pairs with Discord on the
 * chat/collaboration surface, ported onto Microsoft Graph using the same conventions
 * as the Outlook / OneDrive readers (`graphApiBase`, `surfaceGraphError`,
 * `NotFoundError`, `Unauthorized401Error` → refreshAndRetry).
 *
 * PRIVACY: deliberately does NOT reuse the workflow `channelMessageGet` wrapper — that
 * fetches the full chatMessage (body/content, from, attachments, mentions, reactions,
 * webUrl). This reader requests `$select=createdDateTime,messageType` on the channel
 * messages collection so Graph returns ONLY those fields, and projects each message to
 * a transient epoch-ms timestamp. It NEVER reads or returns message content/body,
 * subject, from/user details, message ids, reactions, attachments, hostedContents,
 * mentions, webUrl, or any raw Graph payload. Channel listing requests only
 * `id,displayName` (display name is a structure label).
 *
 * SAFETY — bounded to prevent an unbounded team/channel scan:
 *   - Per-channel message paging is capped ({@link CHANNEL_MAX_PAGES} ×
 *     {@link MESSAGE_PAGE_SIZE}).
 *   - Team-wide scans additionally cap the TOTAL message-list calls
 *     ({@link TEAM_MAX_CALLS}) and pages per channel ({@link TEAM_CHANNEL_MAX_PAGES}).
 *   - Channel listing is capped at {@link CHANNELS_MAX_PAGES}.
 *   - `truncated: true` is reported when a budget is exhausted rather than scanning the
 *     whole team.
 *
 * No raw Graph query comes from widget config — the team / channel are validated Graph
 * ids and `$select` / `$top` are server-side constants. Graph returns channel messages
 * newest-first by `createdDateTime`, so the scan early-stops once it pages past the
 * range start.
 */

export const MESSAGE_PAGE_SIZE = 50; // Graph channel-messages $top max.
/** Single-channel metrics: up to 20 pages = 1000 messages before truncation. */
export const CHANNEL_MAX_PAGES = 20;
/** Team-wide scans: up to 3 pages per channel before that channel truncates. */
export const TEAM_CHANNEL_MAX_PAGES = 3;
/** Team-wide scans: total message-list calls across all channels before truncation. */
export const TEAM_MAX_CALLS = 50;
/** Channel-list paging cap (channel lists are small). */
export const CHANNELS_MAX_PAGES = 5;

const UNNAMED_CHANNEL_LABEL = "(unnamed)";

function parseMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Thrown on HTTP 429 so the adapter can map it to RATE_LIMITED. */
export class TeamsRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamsRateLimitError";
  }
}

async function graphGet(url: string, accessToken: string, resource: string): Promise<Response> {
  const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) {
    throw new Unauthorized401Error(`Microsoft Graph ${resource} GET returned HTTP 401`);
  }
  if (res.status === 429) {
    throw new TeamsRateLimitError(`Microsoft Graph ${resource} GET rate-limited (HTTP 429)`);
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(resource, surfaceGraphError(text, 404));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Microsoft Graph ${resource} GET failed: ${surfaceGraphError(text, res.status)}`);
  }
  return res;
}

export interface TeamChannel {
  /** Opaque Graph channel id — read transiently to scan messages; never returned/cached. */
  id: string;
  /** Channel display name (a structure label). */
  name: string;
}

export interface ChannelsResult {
  channels: TeamChannel[];
  truncated: boolean;
}

/**
 * List a team's channels (id + display name only), paginated via `@odata.nextLink` up
 * to {@link CHANNELS_MAX_PAGES}. No channel email, description, or message content.
 */
export async function listTeamChannels(
  accessToken: string,
  teamId: string,
  maxPages = CHANNELS_MAX_PAGES,
): Promise<ChannelsResult> {
  const first = new URL(`${graphApiBase()}/v1.0/teams/${encodeURIComponent(teamId)}/channels`);
  first.searchParams.set("$select", "id,displayName");
  let url: string | null = first.toString();
  const channels: TeamChannel[] = [];
  let truncated = false;

  for (let page = 0; url; page++) {
    if (page >= maxPages) {
      truncated = true;
      break;
    }
    const res = await graphGet(url, accessToken, `team ${teamId} channels`);
    const body = (await res.json()) as {
      value?: Array<{ id?: unknown; displayName?: unknown }>;
      "@odata.nextLink"?: string;
    };
    for (const raw of body.value ?? []) {
      if (typeof raw.id !== "string" || raw.id.length === 0) continue;
      const name =
        typeof raw.displayName === "string" && raw.displayName.length > 0
          ? raw.displayName
          : UNNAMED_CHANNEL_LABEL;
      channels.push({ id: raw.id, name });
    }
    url = body["@odata.nextLink"] ?? null;
  }

  return { channels, truncated };
}

export interface ChannelScanResult {
  /** Epoch-ms createdDateTime of in-range messages. Counts only — never content. */
  timestamps: number[];
  /** True when the per-channel page budget was exhausted before reaching the range start. */
  truncated: boolean;
  /** message-list calls consumed (so team-wide scans can share a global budget). */
  callsUsed: number;
}

/**
 * Page a channel's messages newest-first (Graph orders the messages collection by
 * `createdDateTime` desc), collecting the epoch-ms timestamps of `message`-type
 * messages within [sinceMs, untilMs). Messages newer than `untilMs` are paged past but
 * not counted; once a message older than `sinceMs` is seen, paging stops. Bounded by
 * `maxPages`. Only `createdDateTime` + `messageType` are read — never content, from,
 * id, or any payload.
 */
export async function scanChannelTimestamps(
  accessToken: string,
  teamId: string,
  channelId: string,
  sinceMs: number,
  untilMs: number,
  maxPages: number,
): Promise<ChannelScanResult> {
  const first = new URL(
    `${graphApiBase()}/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
  );
  first.searchParams.set("$select", "createdDateTime,messageType");
  first.searchParams.set("$top", String(MESSAGE_PAGE_SIZE));

  let url: string | null = first.toString();
  const timestamps: number[] = [];
  let truncated = false;
  let callsUsed = 0;

  for (let page = 0; url; page++) {
    if (page >= maxPages) {
      truncated = true;
      break;
    }
    const res = await graphGet(url, accessToken, `team ${teamId} channel ${channelId} messages`);
    callsUsed++;
    const body = (await res.json()) as {
      value?: Array<{ createdDateTime?: unknown; messageType?: unknown }>;
      "@odata.nextLink"?: string;
    };

    let reachedOlder = false;
    for (const raw of body.value ?? []) {
      if (raw.messageType !== "message") continue; // skip system/event messages
      const ts = parseMs(raw.createdDateTime);
      if (ts === null) continue;
      if (ts >= untilMs) continue; // too new — keep paging older
      if (ts < sinceMs) {
        reachedOlder = true;
        continue;
      }
      timestamps.push(ts);
    }
    if (reachedOlder) return { timestamps, truncated: false, callsUsed }; // descending order → done
    url = body["@odata.nextLink"] ?? null;
  }

  return { timestamps, truncated, callsUsed };
}

export interface TeamChannelCount {
  /** Channel name (a structure label). */
  name: string;
  /** Messages in range in this channel (count only). */
  count: number;
}

export interface TeamScanResult {
  channels: TeamChannelCount[];
  /** True when the global call budget / a per-channel budget / the channel list was capped. */
  truncated: boolean;
}

/**
 * Scan every channel in a team, counting in-range messages per channel. Bounded by a
 * global {@link TEAM_MAX_CALLS} budget across channels and {@link TEAM_CHANNEL_MAX_PAGES}
 * per channel. Emits only channel NAME (structure label) + COUNT — never message
 * content, ids, or authors.
 */
export async function scanTeamChannelCounts(
  accessToken: string,
  teamId: string,
  sinceMs: number,
  untilMs: number,
): Promise<TeamScanResult> {
  const list = await listTeamChannels(accessToken, teamId);
  const result: TeamChannelCount[] = [];
  let truncated = list.truncated;
  let callsLeft = TEAM_MAX_CALLS;

  for (const ch of list.channels) {
    if (callsLeft <= 0) {
      truncated = true;
      break;
    }
    const maxPages = Math.min(TEAM_CHANNEL_MAX_PAGES, callsLeft);
    const scan = await scanChannelTimestamps(accessToken, teamId, ch.id, sinceMs, untilMs, maxPages);
    callsLeft -= scan.callsUsed;
    if (scan.truncated) truncated = true;
    result.push({ name: ch.name, count: scan.timestamps.length });
  }

  return { channels: result, truncated };
}
