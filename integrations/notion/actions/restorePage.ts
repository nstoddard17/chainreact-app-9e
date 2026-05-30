import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pagesUpdate } from "../api/pages";
import { RestorePageConfigSchema } from "./restorePage.schema";

/**
 * Notion `restore_page` action handler (Notion 2.1 Commit 1).
 *
 * Sends `PATCH /v1/pages/{id}` with `archived: false`. Inverse of
 * `archive_page`. The `archived` boolean is hard-coded — workflow
 * authors cannot override it via config.
 *
 * Output shape mirrors `update_page`:
 *   { pageId, url, archived, lastEditedTime }
 */
export const restorePage: ActionHandler = async (input) => {
  const config = RestorePageConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "notion",
    providerAccountId,
    apiCall: (accessToken) =>
      pagesUpdate({
        accessToken,
        pageId: config.pageId,
        archived: false,
      }),
  });

  return {
    output: {
      pageId: result.id,
      url: result.url ?? null,
      archived: result.archived ?? false,
      lastEditedTime: result.last_edited_time ?? null,
    },
  };
};
