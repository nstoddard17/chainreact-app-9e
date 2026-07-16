import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { search as notionSearch, type SearchHit } from "@/integrations/notion/api/search";

/**
 * `notion:databases` options resolver — RESOLVERS-1.
 *
 * Backs the `databaseId` picker on `notion:query_database` and
 * `notion:create_database_entry`. Account-scoped, no deps.
 *
 * Read-only: `POST /v1/search` with `object=database` filter — the exact
 * same wrapper `notion:pages` uses (`filter.value` flipped from "page"
 * to "database"), so there is no second transport. `ctx.q` doubles as
 * Notion's server-side search query. One bounded page (100).
 * Docs: https://developers.notion.com/reference/post-search
 *
 * Mapping (Notion database hit → OptionItem):
 *   - `value`: `id` (the exact string the handler schemas store).
 *   - `label`: the database's title (rich-text array on database hits),
 *     else the database url, else the id.
 * Title text is fine in a builder picker; nothing beyond title/id/url is
 * ever read into the option.
 */
export const notionDatabasesResolver: OptionsResolver = {
  source: "notion:databases",
  provider: "notion",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Notion integration. Connect Notion first.",
      );
    }
    const integration = ctx.integration;

    let response;
    try {
      response = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "notion",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          notionSearch({
            accessToken,
            query: ctx.q,
            filter: { value: "database", property: "object" },
            pageSize: 100,
          }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Notion and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Notion databases. Try again.",
      );
    }

    const items: Array<{ value: string; label: string }> = [];
    for (const hit of response.results) {
      if (hit.object !== "database" || typeof hit.id !== "string" || hit.id.length === 0) continue;
      items.push({ value: hit.id, label: databaseLabel(hit) });
    }

    return { items, hasMore: response.has_more };
  },
};

/** Best-effort human label for a database search hit: title → url → id. */
function databaseLabel(hit: SearchHit): string {
  if (Array.isArray(hit.title)) {
    const text = hit.title
      .map((t) => t.plain_text ?? t.text?.content ?? "")
      .join("")
      .trim();
    if (text.length > 0) return text;
  }
  if (typeof hit.url === "string" && hit.url.length > 0) return hit.url;
  return hit.id;
}
