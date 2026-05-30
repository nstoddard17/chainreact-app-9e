import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pagesList } from "../api/pagesList";
import { ListPagesConfigSchema } from "./listPages.schema";

/**
 * Microsoft OneNote `list_pages` action handler — Slice 3.ONENOTE-2.
 *
 * Wraps Graph `GET /me/onenote/sections/{sectionId}/pages` with
 * `top` + `orderBy`. Returns a single page of results plus
 * `nextLink` for forward-compat (does NOT auto-paginate — workflow
 * authors chain follow-up nodes for page 2+).
 *
 * Each page is normalized to a stable shape for the downstream
 * variable picker — only the fields V2 reliably consumes.
 *
 * Output (downstream variable refs):
 *   {pages: [{id, title, contentUrl, webUrl, createdDateTime,
 *             lastModifiedDateTime, level, order}],
 *    count, hasMore, nextLink}
 */
export const listPages: ActionHandler = async (input) => {
  const config = ListPagesConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-onenote",
    providerAccountId,
    apiCall: (accessToken) =>
      pagesList({
        accessToken,
        sectionId: config.sectionId,
        top: config.top,
        orderBy: config.orderBy,
      }),
  });

  return {
    output: {
      pages: result.pages.map((p) => ({
        id: p.id,
        title: p.title ?? null,
        contentUrl: p.contentUrl ?? null,
        webUrl: p.links?.oneNoteWebUrl?.href ?? null,
        createdDateTime: p.createdDateTime ?? null,
        lastModifiedDateTime: p.lastModifiedDateTime ?? null,
        level: p.level ?? null,
        order: p.order ?? null,
      })),
      count: result.pages.length,
      hasMore: result.nextLink !== null,
      nextLink: result.nextLink,
    },
  };
};
