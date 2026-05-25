import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersMessagesGet } from "../api/usersMessagesGet";
import { usersMessagesList } from "../api/usersMessagesList";
import { buildSearchQuery } from "../utils/buildSearchQuery";
import {
  SearchEmailsConfigSchema,
  type SearchEmailsConfig,
} from "./searchEmails.schema";
import type {
  GmailHeader,
  UsersMessagesGetResult,
} from "../api/usersMessagesGet";

/**
 * Gmail `search_emails` — discriminated-mode search.
 *
 * Modes:
 *   - `searchMode: "query"` → forwards `config.query` verbatim.
 *   - `searchMode: "filters"` → composes q syntax via
 *     `buildSearchQuery` from named fields.
 *
 * Flow:
 *   1. Parse + dispatch on searchMode → derive the q string.
 *   2. Call `users.messages.list` (single page) via refreshAndRetry.
 *   3. For each returned id, hydrate via `users.messages.get` with
 *      default metadata headers via refreshAndRetry.
 *      **Fail-fast**: any hydration failure propagates the error
 *      (no partial-success swallow — V1's per-message try/catch is
 *      explicitly NOT replicated).
 *   4. Project the hydrated messages into stable output metadata.
 *
 * Pagination policy: single-page only. Output includes
 * `nextPageToken` / `hasMore` so workflow authors can construct a
 * follow-up call by passing the token back as `pageToken`. The
 * handler does NOT auto-loop.
 */
export const searchEmails: ActionHandler = async (input) => {
  const config = SearchEmailsConfigSchema.parse(input.config);

  const query = resolveQuery(config);

  const accountId =
    input.triggerEvent.provider === "gmail"
      ? input.triggerEvent.accountId
      : null;

  // Step 1 — list message ids.
  const listResult = await refreshAndRetry({
    userId: input.userId,
    provider: "gmail",
    accountId,
    apiCall: async (accessToken) =>
      usersMessagesList({
        accessToken,
        q: query,
        maxResults: config.maxResults,
        pageToken: config.pageToken,
      }),
  });

  // Step 2 — sequential hydration. Fail-fast: any error propagates.
  const messages: SearchEmailMessageOutput[] = [];
  for (const ref of listResult.messages) {
    const hydrated = await refreshAndRetry({
      userId: input.userId,
      provider: "gmail",
      accountId,
      apiCall: async (accessToken) =>
        usersMessagesGet({ accessToken, messageId: ref.id }),
    });
    messages.push(projectMessage(hydrated));
  }

  return {
    output: {
      query,
      messages,
      count: messages.length,
      nextPageToken: listResult.nextPageToken,
      resultSizeEstimate: listResult.resultSizeEstimate,
      hasMore:
        listResult.nextPageToken !== undefined &&
        listResult.nextPageToken.length > 0,
    },
  };
};

function resolveQuery(config: SearchEmailsConfig): string {
  if (config.searchMode === "query") {
    return config.query;
  }
  return buildSearchQuery(config);
}

interface SearchEmailMessageOutput {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  labelIds: readonly string[];
  internalDate: string;
}

function projectMessage(
  msg: UsersMessagesGetResult,
): SearchEmailMessageOutput {
  const headers = msg.payload.headers;
  return {
    messageId: msg.id,
    threadId: msg.threadId,
    subject: readHeader(headers, "Subject"),
    from: readHeader(headers, "From"),
    to: readHeader(headers, "To"),
    date: readHeader(headers, "Date"),
    snippet: msg.snippet,
    labelIds: msg.labelIds,
    internalDate: msg.internalDate,
  };
}

function readHeader(headers: readonly GmailHeader[], name: string): string {
  for (const h of headers) {
    if (h.name.toLowerCase() === name.toLowerCase()) return h.value;
  }
  return "";
}
