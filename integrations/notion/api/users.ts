import { notionRequest } from "./_request";

/**
 * Notion Users API wrappers — Notion 2.1 Commit 2.
 *
 * Two endpoints:
 *   - `usersRetrieve` — GET /v1/users/{id}
 *   - `usersList` — GET /v1/users
 *
 * Used by:
 *   - `actions/getUser.ts` → `usersRetrieve`
 *   - `actions/listUsers.ts` → `usersList`
 *
 * Both wrappers route through `notionRequest` so 401 / 404 mapping +
 * Notion-Version pin live in one place. `NOTION_API_BASE` override is
 * honored automatically via `notionApiBase()` (used by the e2e mock
 * server).
 */

/**
 * Notion user response shape. Discriminated by `type`:
 *   - "person" users carry an optional `person.email` (only present
 *     when the integration's capability scopes allow it; Notion's
 *     OAuth grants determine visibility, not V2 manifest scopes).
 *   - "bot" users carry an optional `bot.owner` discriminator
 *     (`type: "user" | "workspace"`) plus optional `bot.workspace_name`.
 *
 * Subset of the full Notion user object — only fields V2 reads.
 */
export interface NotionUser {
  object: "user";
  id: string;
  type?: "person" | "bot";
  name?: string | null;
  avatar_url?: string | null;
  person?: {
    email?: string;
  };
  bot?: {
    owner?: {
      type?: "user" | "workspace";
      user?: { id?: string; object?: "user" } | null;
      workspace?: boolean;
    };
    workspace_name?: string | null;
  };
}

// ─── usersRetrieve ───────────────────────────────────────────────────────

export interface UsersRetrieveInput {
  accessToken: string;
  userId: string;
}

export async function usersRetrieve(
  input: UsersRetrieveInput,
): Promise<NotionUser> {
  return notionRequest<NotionUser>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/v1/users/${encodeURIComponent(input.userId)}`,
    resourceForNotFound: `user ${input.userId}`,
  });
}

// ─── usersList ───────────────────────────────────────────────────────────

export interface UsersListResponse {
  object: "list";
  results: NotionUser[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface UsersListInput {
  accessToken: string;
  /** Optional — 1..100 per Notion's hard ceiling. Schema enforces. */
  pageSize?: number;
  /** Optional pagination cursor from a prior response. */
  startCursor?: string;
}

export async function usersList(
  input: UsersListInput,
): Promise<UsersListResponse> {
  // GET /v1/users uses query-string pagination (snake_case keys mirror
  // Notion's body-based pagination on POST endpoints).
  const params = new URLSearchParams();
  if (input.pageSize !== undefined) {
    params.set("page_size", String(input.pageSize));
  }
  if (input.startCursor !== undefined) {
    params.set("start_cursor", input.startCursor);
  }
  const qs = params.toString();
  const path = qs.length > 0 ? `/v1/users?${qs}` : "/v1/users";

  return notionRequest<UsersListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path,
    resourceForNotFound: "users endpoint",
  });
}
