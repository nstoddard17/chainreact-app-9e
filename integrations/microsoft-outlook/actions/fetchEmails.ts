import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  listMessages,
  type ListMessagesGraphMessage,
} from "../api/listMessages";
import { FetchEmailsConfigSchema } from "./fetchEmails.schema";

/**
 * Microsoft Outlook fetch_emails action.
 *
 * Outlook Mail 2.2 Commit 3 — D-OM1 V1-shape ship. Read-only action;
 * no Q4 idempotency wrapping (no side effect).
 *
 * Flow:
 *   1. Zod schema parse + default `maxResults = 10`.
 *   2. Wrap GET in `refreshAndRetry` (Q3).
 *   3. When `query` was set, the wrapper used `$search` and dropped
 *      server-side date `$filter` (Graph mutual-exclusion). Apply
 *      client-side date filtering here.
 *   4. Slice to `maxResults`.
 *   5. Project Graph envelopes to the bounded output shape — no raw
 *      envelope leakage; explicit `| null` on Graph-optional fields.
 *
 * Scope: requires `Mail.Read` (already in manifest from Slice 6 —
 * Mail.ReadWrite from 2.1's P-O1 is a superset; either grant works).
 *
 * Output shape:
 *   {
 *     messages: Array<{
 *       id, subject, from: { name?, address }, to: [...], cc: [...],
 *       receivedDateTime, bodyPreview, hasAttachments, importance,
 *       isRead
 *     }>,
 *     count: number,
 *   }
 *
 * `from` / `receivedDateTime` / etc. are explicitly `| null` because
 * Graph may omit them under unusual mailbox states (auto-generated
 * messages, certain inferred classifications). Defensive nullability
 * keeps downstream `{{node.messages[0].from.address}}` refs safe.
 *
 * Account resolution mirrors 2.1 / 2.2's other actions — when the
 * trigger event came from this provider, use its accountId; otherwise
 * null and the refreshAndRetry layer picks the user's single active
 * integration row.
 */
export const fetchEmails: ActionHandler = async (input) => {
  const config = FetchEmailsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.providerAccountId
      : null;

  const hasQuery =
    typeof config.query === "string" && config.query.trim().length > 0;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-outlook",
    providerAccountId,
    apiCall: (accessToken) =>
      listMessages({
        accessToken,
        folderId: config.folderId,
        query: hasQuery ? config.query : undefined,
        startDate: config.startDate,
        endDate: config.endDate,
        maxResults: config.maxResults,
      }),
  });

  let messages = result.value;

  // Client-side date filtering when query was set (Graph $search +
  // $filter mutual-exclusion fallback). The wrapper already skipped
  // the server-side $filter in this path.
  if (hasQuery && (config.startDate || config.endDate)) {
    const startMs = config.startDate
      ? safeParseTime(config.startDate)
      : null;
    const endMs = config.endDate ? safeParseTime(config.endDate) : null;
    messages = messages.filter((msg) => {
      const ts = msg.receivedDateTime
        ? safeParseTime(msg.receivedDateTime)
        : null;
      if (ts === null) return true; // Don't drop messages with unknown timestamps.
      if (startMs !== null && ts < startMs) return false;
      if (endMs !== null && ts > endMs) return false;
      return true;
    });
  }

  // Slice to maxResults — when query path fetched 3x for headroom, trim.
  messages = messages.slice(0, config.maxResults);

  return {
    output: {
      messages: messages.map(projectMessage),
      count: messages.length,
    },
  };
};

function projectMessage(msg: ListMessagesGraphMessage) {
  return {
    id: msg.id,
    subject: msg.subject ?? null,
    from: msg.from?.emailAddress?.address
      ? {
          name: msg.from.emailAddress.name ?? undefined,
          address: msg.from.emailAddress.address,
        }
      : null,
    to: (msg.toRecipients ?? [])
      .filter((r) => !!r.emailAddress?.address)
      .map((r) => ({
        name: r.emailAddress!.name ?? undefined,
        address: r.emailAddress!.address as string,
      })),
    cc: (msg.ccRecipients ?? [])
      .filter((r) => !!r.emailAddress?.address)
      .map((r) => ({
        name: r.emailAddress!.name ?? undefined,
        address: r.emailAddress!.address as string,
      })),
    receivedDateTime: msg.receivedDateTime ?? null,
    bodyPreview: msg.bodyPreview ?? null,
    hasAttachments: msg.hasAttachments ?? null,
    importance: msg.importance ?? null,
    isRead: msg.isRead ?? null,
  };
}

function safeParseTime(input: string): number | null {
  const t = Date.parse(input);
  return Number.isNaN(t) ? null : t;
}
