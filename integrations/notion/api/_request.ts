import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  NOTION_API_VERSION,
  notionApiBase,
} from "@/integrations/_shared/notion/api/_base";
import {
  NotFoundError,
  surfaceNotionError,
} from "@/integrations/_shared/notion/api/errors";

/**
 * Shared HTTP request helper for Notion API wrappers.
 *
 * Every Notion `/v1/*` request needs:
 *   - `Authorization: Bearer ${accessToken}`
 *   - `Notion-Version: 2022-06-28` (Slice 9 pin)
 *   - `Content-Type: application/json` for POST/PATCH bodies
 *
 * Centralizing here ensures every wrapper sends the same headers and
 * maps 401 / 404 / other errors uniformly. Per-resource wrappers
 * (pages.ts, databases.ts, blocks.ts, search.ts) thin-wrap this with
 * URL + body construction.
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by refreshAndRetry; Slice 9
 *     surfaces this as `IntegrationActionRequiredError(reason:
 *     "refresh_not_supported")` since Notion is non-refreshable).
 *   - 404 → `NotFoundError(resource)` so handlers can give a stable
 *     "not found" UX.
 *   - Other non-OK → generic `Error(`Notion <method> <path> failed:
 *     ${parsedMessage}`)`.
 */

export interface NotionRequestInput {
  accessToken: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path relative to api.notion.com, e.g. `/v1/pages` or `/v1/pages/<id>`. */
  path: string;
  /** Optional JSON body. Omit / undefined for GET / DELETE. */
  body?: unknown;
  /**
   * Resource label for `NotFoundError`. Pass a stable, user-meaningful
   * string like `"page <id>"` or `"database <id>"`.
   */
  resourceForNotFound: string;
}

export async function notionRequest<T>(
  input: NotionRequestInput,
): Promise<T> {
  const url = `${notionApiBase()}${input.path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    "Notion-Version": NOTION_API_VERSION,
  };
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Notion ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceNotionError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Notion ${input.method} ${input.path} failed: ${surfaceNotionError(text, res.status)}`,
    );
  }

  // Successful 2xx — parse JSON body. (Notion's API never returns
  // empty bodies for the endpoints Slice 9 uses.)
  return (await res.json()) as T;
}
