import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  formatProperties,
  type TypedPropertyInput,
} from "@/integrations/_shared/notion/properties";
import { buildBlocks } from "@/integrations/_shared/notion/blocks";
import { pagesCreate } from "../api/pages";
import { CreateDatabaseEntryConfigSchema } from "./createDatabaseEntry.schema";

/**
 * Notion `create_database_entry` action handler.
 *
 * Effectively `create_page` with the database-parent constraint baked
 * in — but a separate handler keeps the schema narrow (no page-parent
 * fields) and matches V1's separate node type.
 *
 * Output shape (downstream variable refs):
 *   { pageId, url, parent, createdTime, lastEditedTime }
 *   - Mirrors create_page output shape so downstream workflows can
 *     reference {{nodeId.pageId}} regardless of which create variant
 *     ran.
 */
export const createDatabaseEntry: ActionHandler = async (input) => {
  const config = CreateDatabaseEntryConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.accountId
      : null;

  const wireProperties = formatProperties(
    config.properties as Readonly<Record<string, TypedPropertyInput>>,
  );

  const wireChildren =
    config.children && config.children.length > 0
      ? buildBlocks(config.children)
      : undefined;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "notion",
    accountId,
    apiCall: (accessToken) =>
      pagesCreate({
        accessToken,
        parent: { database_id: config.databaseId },
        properties: wireProperties,
        children: wireChildren,
        icon: config.icon,
        cover: config.cover,
      }),
  });

  return {
    output: {
      pageId: result.id,
      url: result.url ?? null,
      parent: result.parent ?? null,
      createdTime: result.created_time ?? null,
      lastEditedTime: result.last_edited_time ?? null,
    },
  };
};
