import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  formatProperties,
  type TypedPropertyInput,
} from "@/integrations/_shared/notion/properties";
import { pagesUpdate } from "../api/pages";
import { UpdatePageConfigSchema } from "./updatePage.schema";

/**
 * Notion `update_page` action handler.
 *
 * Q11 — undefined fields are omitted from the PATCH body. The action
 * mutates only what the user explicitly set:
 *   - properties undefined → no property changes
 *   - archived undefined → archived state unchanged
 *   - icon / cover undefined → unchanged; null → cleared
 *
 * Output shape (downstream variable refs):
 *   { pageId, url, archived, lastEditedTime }
 */
export const updatePage: ActionHandler = async (input) => {
  const config = UpdatePageConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.providerAccountId
      : null;

  const wireProperties =
    config.properties !== undefined
      ? formatProperties(
          config.properties as Readonly<Record<string, TypedPropertyInput>>,
        )
      : undefined;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "notion",
    providerAccountId,
    apiCall: (accessToken) =>
      pagesUpdate({
        accessToken,
        pageId: config.pageId,
        properties: wireProperties,
        archived: config.archived,
        icon: config.icon,
        cover: config.cover,
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
