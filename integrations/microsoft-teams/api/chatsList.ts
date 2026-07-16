import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Microsoft Graph `GET /v1.0/me/chats` — RESOLVERS-1.
 *
 * Lists the signed-in user's 1:1 / group / meeting chats, with members
 * expanded so the `microsoft-teams:chats` resolver can label unnamed
 * chats by participant display names (a group chat's `topic` is null
 * until someone names it; 1:1 chats never carry a topic).
 * Docs: https://learn.microsoft.com/en-us/graph/api/chat-list
 * Permissions: Chat.ReadBasic / Chat.Read / Chat.ReadWrite — the
 * manifest's existing `Chat.ReadWrite` (send_chat_message) covers this
 * read; no scope change.
 *
 * Mirrors the `teamsList` transport (direct Graph `fetch` + 401/404
 * mapping); resolvers wrap it in `refreshAndRetry`. `$top=50` is Graph's
 * documented MAX page size for this endpoint (default 20); default sort
 * is most-recent-message first, which the resolver preserves. Graph
 * paginates via `@odata.nextLink`; this helper returns one page + the
 * nextLink (the resolver surfaces `hasMore`). `$select=id,topic,chatType`
 * keeps the non-expanded payload minimal. The token NEVER appears in a
 * thrown error (only method + resource).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404.
 *   - generic `Error` on other failures (Graph message surfaced, no token).
 */

export interface ChatMemberSummary {
  displayName?: string | null;
}

export interface ChatSummary {
  id: string;
  /** Group-chat name — null/absent for 1:1 chats and unnamed groups. */
  topic?: string | null;
  /** `oneOnOne | group | meeting | unknownFutureValue`. */
  chatType?: string;
  members?: ChatMemberSummary[];
}

export interface ChatsListResult {
  chats: ChatSummary[];
  nextLink: string | null;
}

export interface ChatsListInput {
  accessToken: string;
}

/** Graph's documented max `$top` for `/me/chats` (default is 20). */
const PAGE_SIZE = 50;

export async function chatsList(
  input: ChatsListInput,
): Promise<ChatsListResult> {
  const url = new URL(`${graphApiBase()}/v1.0/me/chats`);
  url.searchParams.set("$select", "id,topic,chatType");
  url.searchParams.set("$expand", "members");
  url.searchParams.set("$top", String(PAGE_SIZE));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/chats GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError("chats", surfaceGraphError(text, 404));
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/chats GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as {
    value?: ChatSummary[];
    "@odata.nextLink"?: string;
  };
  return {
    chats: body.value ?? [],
    nextLink: body["@odata.nextLink"] ?? null,
  };
}
