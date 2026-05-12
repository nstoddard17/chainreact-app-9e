import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { trelloApiBase } from "@/integrations/_shared/trello/api/_base";
import {
  TrelloNotFoundError,
  surfaceTrelloError,
} from "@/integrations/_shared/trello/api/errors";

/**
 * Shared HTTP request helper for Trello REST API wrappers.
 *
 * Slice 17 Commit 4. Mirrors `integrations/notion/api/_request.ts` and
 * `_shared/github/api/_request.ts` shape — thin per-resource wrappers
 * (cards.ts, lists.ts, boards.ts) construct path + body + query and
 * delegate to this helper for HTTP semantics + auth + error mapping.
 *
 * **Wire-format — Trello specifics:**
 *
 *   - Trello does NOT accept Bearer tokens. Auth goes in the URL as
 *     `?key={appKey}&token={userToken}` query params on every request.
 *     The `appKey` is the global `TRELLO_CLIENT_ID` env value
 *     (Trello's app-level API key); `accessToken` is the per-user
 *     token issued via the token-ingest flow (Slice 17 Commits 2+3).
 *
 *   - `Content-Type: application/json` for POST/PUT bodies. Trello
 *     accepts both JSON and form-urlencoded; JSON is cleaner for nested
 *     fields and matches every other V2 provider's body shape.
 *
 *   - GET/DELETE: no body. Caller's `query` object is merged with the
 *     auth params.
 *
 * **Error mapping:**
 *
 *   - 401 → `Unauthorized401Error`. `refreshAndRetry` catches this and
 *     surfaces `IntegrationActionRequiredError(reason:
 *     "refresh_not_supported")` because Trello is non-refreshable per
 *     Slice 17 Commit 3 — the user's prompt is "reconnect your Trello
 *     account."
 *
 *   - 404 → `TrelloNotFoundError(resource)` so handlers can give a
 *     stable "not found" UX (consistent with Notion's NotFoundError).
 *
 *   - Other non-OK → generic `Error("Trello <method> <path> failed:
 *     <message>")`. The body is run through `surfaceTrelloError`
 *     which handles both plain-text and JSON error bodies.
 *
 * **Token leakage discipline:**
 *
 *   - The full URL (including `key=` and `token=`) is NEVER embedded
 *     in any thrown error message. Errors only reference the method +
 *     path (without query). This keeps tokens out of logs even when
 *     errors bubble up to the global error handler.
 *
 *   - Per-resource wrappers MUST construct their `query` object via
 *     `URLSearchParams` so the helper can merge auth params cleanly.
 */

function getTrelloAppKey(): string {
  const key = process.env.TRELLO_CLIENT_ID;
  if (!key) throw new Error("TRELLO_CLIENT_ID env var is not set.");
  return key;
}

export interface TrelloRequestInput {
  /** Decrypted Trello user token from the integration row. */
  accessToken: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /**
   * Path relative to the Trello REST API base. MUST start with `/1/`
   * (Trello's path-versioned API). Examples: `/1/cards`,
   * `/1/cards/{id}`, `/1/lists`, `/1/boards`.
   */
  path: string;
  /**
   * Optional non-auth query parameters. The helper appends `key` and
   * `token` to this on the way out. Pass `undefined` when there are
   * no additional query params.
   */
  query?: URLSearchParams;
  /**
   * Optional JSON body. Stringified verbatim. Pass `undefined` for
   * GET / DELETE / endpoints that take no body. Per-resource wrappers
   * drop `null`/`undefined` field values before passing.
   */
  body?: Readonly<Record<string, unknown>>;
  /**
   * Resource label for `TrelloNotFoundError`. Pass a stable,
   * user-meaningful string like `"card <id>"`, `"list <id>"`, or
   * `"board <id>"`. Used in the thrown error's message ONLY; never
   * placed in any request URL or body.
   */
  resourceForNotFound: string;
}

export async function trelloRequest<T>(
  input: TrelloRequestInput,
): Promise<T> {
  const appKey = getTrelloAppKey();
  const merged = new URLSearchParams(input.query ?? undefined);
  merged.set("key", appKey);
  merged.set("token", input.accessToken);
  const url = `${trelloApiBase()}${input.path}?${merged.toString()}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });

  // Token-leakage discipline: error messages reference ONLY the method
  // and path — never the URL (which carries `?key=` and `?token=`).
  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Trello ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new TrelloNotFoundError(
      input.resourceForNotFound,
      surfaceTrelloError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Trello ${input.method} ${input.path} failed: ${surfaceTrelloError(text, res.status)}`,
    );
  }

  // Successful 2xx. Some Trello endpoints (e.g. POST /idLabels) return
  // a JSON array; the per-resource wrapper types the response.
  const text = await res.text();
  if (text.length === 0) {
    return undefined as unknown as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Trello ${input.method} ${input.path} returned non-JSON 2xx body`,
    );
  }
}
