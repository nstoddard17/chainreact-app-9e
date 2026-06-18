import { conversationsHistory } from "@/integrations/slack/api/conversationsHistory";

/**
 * Bounded, READ-ONLY Slack history reader for the analytics source (Slice
 * ANALYTICS-SOURCES-SLACK-1). Reuses the shared `conversationsHistory` wrapper
 * (same Bearer-token transport + `SlackApiError` mapping as the Slack action
 * handlers) so analytics never re-implements auth or pagination semantics.
 *
 * SAFETY — this is the chokepoint that prevents "unbounded workspace scanning":
 *   - ONE channel per call (the channel id is validated upstream; DMs rejected).
 *   - Time-bounded by Slack's `oldest` / `latest`.
 *   - HARD page cap ({@link MAX_HISTORY_PAGES} × {@link HISTORY_PAGE_SIZE}). When a
 *     channel has more messages in-window than the cap, we STOP and report
 *     `truncated: true` — the caller surfaces a "showing the most recent N"
 *     warning rather than paging the whole channel.
 *
 * Raw messages NEVER leave the server: callers reduce them to numeric counts /
 * distinct-user sets. No message text or author identity is returned to the
 * client or stored — only the normalized aggregate is cached.
 */

export const HISTORY_PAGE_SIZE = 200;
export const MAX_HISTORY_PAGES = 10;
/** Absolute ceiling on messages scanned per widget query (10 × 200). */
export const MAX_MESSAGES = HISTORY_PAGE_SIZE * MAX_HISTORY_PAGES;

export interface SlackMessage {
  ts: string;
  /** Author user id; absent for some system/bot rows. */
  user?: string;
  text?: string;
  subtype?: string;
}

export interface FetchedHistory {
  messages: readonly SlackMessage[];
  /** True when the channel had more in-window messages than the page cap. */
  truncated: boolean;
}

function toMessage(raw: Readonly<Record<string, unknown>>): SlackMessage | null {
  const ts = raw.ts;
  if (typeof ts !== "string" || ts.length === 0) return null;
  const msg: SlackMessage = { ts };
  if (typeof raw.user === "string") msg.user = raw.user;
  if (typeof raw.text === "string") msg.text = raw.text;
  if (typeof raw.subtype === "string") msg.subtype = raw.subtype;
  return msg;
}

/**
 * Fetch up to {@link MAX_MESSAGES} messages from one channel within
 * [oldestTs, latestTs]. Throws `SlackApiError` on a Slack failure (the adapter
 * classifies it into a typed, leak-free AnalyticsSourceError).
 */
export async function fetchChannelHistory(
  botToken: string,
  channel: string,
  oldestTs: string,
  latestTs: string,
): Promise<FetchedHistory> {
  const messages: SlackMessage[] = [];
  let cursor: string | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const res = await conversationsHistory({
      botToken,
      channel,
      limit: HISTORY_PAGE_SIZE,
      oldest: oldestTs,
      latest: latestTs,
      ...(cursor ? { cursor } : {}),
    });

    for (const raw of res.messages) {
      const msg = toMessage(raw);
      if (msg) messages.push(msg);
    }

    if (!res.hasMore || !res.nextCursor) {
      return { messages, truncated };
    }
    cursor = res.nextCursor;
    // We exhausted the page budget but Slack still has more → truncated.
    if (page === MAX_HISTORY_PAGES - 1) truncated = true;
  }

  return { messages, truncated };
}
