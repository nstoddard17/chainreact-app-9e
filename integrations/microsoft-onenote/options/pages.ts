import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { pagesList } from "@/integrations/microsoft-onenote/api/pagesList";

/**
 * `microsoft-onenote:pages` options resolver — Slice 3.ONENOTE-3.
 *
 * Backs the `pageId` field on the page-targeted OneNote actions
 * (`update_page`, `get_page_content`, `delete_page`) and on the
 * future `copy_page` action's `sourcePageId` field. The dep name is
 * pinned to `sectionId` verbatim — every consumer field name uses
 * camelCase (`sectionId` / `pageId`) matching the ONENOTE-2 Zod
 * schemas.
 *
 * Architecture mirrors `microsoft-onenote:sections`:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["sectionId"]` — route validates + short-circuits
 *     with `MISSING_DEPENDENCY` before dispatch.
 *   - Wrapper goes through `refreshAndRetry({provider:
 *     "microsoft-onenote", accountId: ctx.integration.providerAccountId})`.
 *
 * Sort: Graph-side `$orderby=lastModifiedDateTime desc`. Workflow
 * authors picking a page almost always want the one they (or another
 * automation) were recently editing — recency beats alphabetical for
 * this surface. Matches the V1 `list_pages` action's default sort and
 * the ONENOTE-2 schema's `orderBy` default.
 *
 * Pagination: `top: 100`, `hasMore: result.nextLink !== null`. Graph
 * caps `$top` at 100 for OneNote pages (ONENOTE-2 schema documents
 * the cap on `list_pages.top`). Sections with >100 pages exist but
 * are uncommon; the picker surfaces a refinement hint when they do.
 *
 * Mapping (OneNote page → OptionItem):
 *   - `value`: `id` (Graph page id; used by every page-targeted
 *     action).
 *   - `label`: `title` when non-empty, else the id as fallback. Graph
 *     usually returns a title; pages created without one fall back
 *     to the id so the picker doesn't render blank rows.
 *   - `description`: `lastModifiedDateTime` formatted as
 *     `"Modified YYYY-MM-DD"` (matches the notebooks resolver and the
 *     `google-docs:documents` shape — date only, minute precision
 *     would feel stale).
 *
 * Client-side `q` filter — case-insensitive substring match on the
 * label.
 *
 * Section-not-found / 404 handling: if the parent `sectionId` was
 * deleted between picker mounts, the OneNote wrapper throws
 * `NotFoundError`. We map to empty `items` rather than throw —
 * mirrors `microsoft-onenote:sections`. The workflow author's natural
 * next move is to re-pick the parent section, and the cascade clears
 * `pageId` automatically when they do.
 *
 * Error sanitization mirrors `microsoft-onenote:notebooks`. Provider
 * error bodies never reach the browser.
 */

const PAGE_SIZE = 100;

function formatDescription(lastModifiedDateTime: unknown): string | undefined {
  if (
    typeof lastModifiedDateTime !== "string" ||
    lastModifiedDateTime.length === 0
  ) {
    return undefined;
  }
  const datePart = lastModifiedDateTime.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return undefined;
  return `Modified ${datePart}`;
}

export const microsoftOneNotePagesResolver: OptionsResolver = {
  source: "microsoft-onenote:pages",
  provider: "microsoft-onenote",
  requiresIntegration: true,
  requiredDeps: ["sectionId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active OneNote integration. Connect OneNote first.",
      );
    }

    const sectionId = ctx.deps.sectionId;
    if (typeof sectionId !== "string" || sectionId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a section first.",
      );
    }

    const accountId = ctx.integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        userId: ctx.userId,
        provider: "microsoft-onenote",
        accountId,
        apiCall: (accessToken) =>
          pagesList({
            accessToken,
            sectionId,
            orderBy: "lastModifiedDateTime desc",
            top: PAGE_SIZE,
          }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect OneNote and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect OneNote and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load OneNote pages. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const page of result.pages) {
      if (typeof page.id !== "string" || page.id.length === 0) continue;
      const label =
        typeof page.title === "string" && page.title.length > 0
          ? page.title
          : page.id;
      const description = formatDescription(page.lastModifiedDateTime);
      items.push(
        description !== undefined
          ? { value: page.id, label, description }
          : { value: page.id, label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return {
      items: filtered,
      hasMore: result.nextLink !== null,
    };
  },
};
