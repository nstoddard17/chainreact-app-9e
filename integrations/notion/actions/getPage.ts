import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { parseProperties } from "@/integrations/_shared/notion/properties";
import type { NotionPropertyResponse } from "@/integrations/_shared/notion/properties";
import { pagesRetrieve } from "../api/pages";
import { GetPageConfigSchema } from "./getPage.schema";

/**
 * Notion `get_page` action handler.
 *
 * Returns the page object plus parsed properties for Slice 9 Batch 1's
 * 9 supported property types. Properties whose type is unsupported in
 * Batch 1 (relation, people, files, rollup, formula, multi_select,
 * status) are NOT thrown — they surface in `skippedProperties` so the
 * workflow can degrade gracefully (a Notion page with one supported
 * property and one `relation` property is still usable).
 *
 * Output shape (downstream variable refs):
 *   { pageId, url, archived, parent, createdTime, lastEditedTime,
 *     properties, skippedProperties, icon, cover }
 *   - `properties` is `Record<propertyName, ParsedPropertyValue>` —
 *     workflows can drill into `{{nodeId.properties.Name.value}}`.
 *   - `skippedProperties` is `Array<{ name, type }>` so workflows can
 *     branch on whether anything was skipped.
 */
export const getPage: ActionHandler = async (input) => {
  const config = GetPageConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "notion",
    providerAccountId,
    apiCall: (accessToken) =>
      pagesRetrieve({ accessToken, pageId: config.pageId }),
  });

  const { parsed, skipped } = parseProperties(
    (result.properties ?? {}) as Record<string, NotionPropertyResponse>,
  );

  return {
    output: {
      pageId: result.id,
      url: result.url ?? null,
      archived: result.archived ?? false,
      parent: result.parent ?? null,
      createdTime: result.created_time ?? null,
      lastEditedTime: result.last_edited_time ?? null,
      properties: parsed,
      skippedProperties: skipped,
      icon: result.icon ?? null,
      cover: result.cover ?? null,
    },
  };
};
