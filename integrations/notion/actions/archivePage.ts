import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pagesUpdate } from "../api/pages";
import { ArchivePageConfigSchema } from "./archivePage.schema";

/**
 * Notion `archive_page` action handler (Notion 2.1 Commit 1).
 *
 * Sends `PATCH /v1/pages/{id}` with `archived: true`. The `archived`
 * boolean is hard-coded in this handler — workflow authors cannot
 * override it via config. For the inverse, use `restore_page`.
 *
 * Output shape mirrors `update_page`:
 *   { pageId, url, archived, lastEditedTime }
 *
 * No input spreading into output — output is built from the Notion API
 * response, not the input config (Q11 principle).
 */
export const archivePage: ActionHandler = async (input) => {
  const config = ArchivePageConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "notion",
    accountId,
    apiCall: (accessToken) =>
      pagesUpdate({
        accessToken,
        pageId: config.pageId,
        archived: true,
      }),
  });

  return {
    output: {
      pageId: result.id,
      url: result.url ?? null,
      archived: result.archived ?? true,
      lastEditedTime: result.last_edited_time ?? null,
    },
  };
};
