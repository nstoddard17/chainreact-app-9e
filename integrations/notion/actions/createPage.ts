import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  formatProperties,
  type TypedPropertyInput,
} from "@/integrations/_shared/notion/properties";
import { buildBlocks } from "@/integrations/_shared/notion/blocks";
import { pagesCreate, type NotionParent } from "../api/pages";
import { CreatePageConfigSchema } from "./createPage.schema";

/**
 * Notion `create_page` action handler.
 *
 * Creates a new page either as a child of a database (a "row") or as a
 * subpage of an existing page. The discriminated `parent` field
 * enforces this choice up-front (Q11 — no silent dispatch).
 *
 * Properties are typed via `formatProperties` — the 9 supported types
 * coerce cleanly; deferred types throw `UnsupportedPropertyTypeError`
 * before reaching Notion. Workflow authors using deferred types fail
 * loud at design time rather than silently miscoercing.
 *
 * Output shape (downstream variable refs):
 *   { pageId, url, parent, createdTime, lastEditedTime }
 *   - Mirrors Notion's response. Workflows that need the parsed
 *     properties can chain `get_page` for the same page id.
 */
export const createPage: ActionHandler = async (input) => {
  const config = CreatePageConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.providerAccountId
      : null;

  // Coerce typed property map into Notion wire-format. The Zod schema
  // already validated each entry's discriminator + value; the cast to
  // TypedPropertyInput matches the runtime shape.
  const wireProperties = formatProperties(
    config.properties as Readonly<Record<string, TypedPropertyInput>>,
  );

  // Coerce optional typed children into Notion wire-format.
  const wireChildren =
    config.children && config.children.length > 0
      ? buildBlocks(config.children)
      : undefined;

  // Map the discriminated parent input into Notion's wire shape.
  const wireParent: NotionParent =
    "databaseId" in config.parent
      ? { database_id: config.parent.databaseId }
      : { page_id: config.parent.pageId };

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "notion",
    providerAccountId,
    apiCall: (accessToken) =>
      pagesCreate({
        accessToken,
        parent: wireParent,
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
