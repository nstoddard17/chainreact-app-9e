import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pageContentGet } from "../api/pageContentGet";
import { pagesGet } from "../api/pagesGet";
import { GetPageContentConfigSchema } from "./getPageContent.schema";

/**
 * Microsoft OneNote `get_page_content` action handler —
 * Slice 3.ONENOTE-2.
 *
 * Two-call (metadata + body):
 *   1. `GET /me/onenote/pages/{id}` — metadata for the output.
 *   2. `GET /me/onenote/pages/{id}/content` with `includeIDs` +
 *      `preGenerated` query params — full HTML body.
 *
 * Output (downstream variable refs):
 *   {id, title, content (HTML body — SENSITIVE), contentUrl, webUrl,
 *    createdDateTime, lastModifiedDateTime, level}
 *
 * Risk classification (low) lives in ONENOTE-4 meta. The `content`
 * output is marked SENSITIVE there per the structural suspicious-
 * name set.
 */
export const getPageContent: ActionHandler = async (input) => {
  const config = GetPageContentConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.accountId
      : null;

  const page = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-onenote",
    accountId,
    apiCall: (accessToken) =>
      pagesGet({ accessToken, pageId: config.pageId }),
  });

  const { html } = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-onenote",
    accountId,
    apiCall: (accessToken) =>
      pageContentGet({
        accessToken,
        pageId: config.pageId,
        includeIDs: config.includeIDs,
        preGenerated: config.preGenerated,
      }),
  });

  return {
    output: {
      id: config.pageId,
      title: page.title ?? null,
      content: html,
      contentUrl: page.contentUrl ?? null,
      webUrl: page.links?.oneNoteWebUrl?.href ?? null,
      createdDateTime: page.createdDateTime ?? null,
      lastModifiedDateTime: page.lastModifiedDateTime ?? null,
      level: page.level ?? null,
    },
  };
};
