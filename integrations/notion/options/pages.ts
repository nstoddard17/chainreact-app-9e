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
 * `notion:pages` options resolver.
 *
 * Backs the `blockId` picker on `notion:list_comments` (Notion accepts a
 * page id as a block id — list_comments is typically called on a page).
 * Account-scoped, no deps.
 *
 * Read-only: `POST /v1/search` with an empty query + `object=page` filter
 * (the same endpoint the `search` action uses) — returns the pages the
 * integration can access. One bounded page (100). Reuses `notionSearch` so
 * there is no second transport.
 *
 * Mapping (Notion page hit → OptionItem):
 *   - `value`: `id`.
 *   - `label`: the page's title (extracted from the title-type property),
 *     else the page url, else the id.
 * Title text is fine in a builder picker; the smoke report never surfaces it.
 */
export const notionPagesResolver: OptionsResolver = {
  source: "notion:pages",
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
            filter: { value: "page", property: "object" },
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
        "Couldn't load Notion pages. Try again.",
      );
    }

    const items: Array<{ value: string; label: string }> = [];
    for (const hit of response.results) {
      if (hit.object !== "page" || typeof hit.id !== "string" || hit.id.length === 0) continue;
      items.push({ value: hit.id, label: pageLabel(hit) });
    }

    return { items, hasMore: response.has_more };
  },
};

/** Best-effort human label for a page search hit: title → url → id. */
function pageLabel(hit: SearchHit): string {
  const props = hit.properties;
  if (props && typeof props === "object") {
    for (const value of Object.values(props)) {
      const prop = value as { type?: string; title?: ReadonlyArray<{ plain_text?: string }> };
      if (prop?.type === "title" && Array.isArray(prop.title)) {
        const text = prop.title.map((t) => t.plain_text ?? "").join("").trim();
        if (text.length > 0) return text;
      }
    }
  }
  if (typeof hit.url === "string" && hit.url.length > 0) return hit.url;
  return hit.id;
}
