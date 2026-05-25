import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  databasesCreate,
  type NotionDatabase,
} from "../api/databases";
import { CreateDatabaseConfigSchema } from "./createDatabase.schema";

/**
 * Notion `create_database` action handler (Notion 2.1 Commit 4).
 *
 * Sends `POST /v1/databases` with parent / title / properties body.
 * The wrapper synthesizes rich_text arrays from plain-text title +
 * description and converts V2's `{ type }` property descriptor into
 * Notion's `{ <type>: {} }` wire-format.
 *
 * Output shape (key set locked):
 *   {
 *     databaseId,
 *     object,
 *     url,
 *     title,                 // plain-text reconstructed from response
 *     description,           // plain-text reconstructed; "" when absent
 *     archived,
 *     isInline,
 *     parentType,            // "page_id" | "workspace" | null
 *     parentId,              // page id when parent.type=page_id
 *     createdTime,
 *     lastEditedTime,
 *     properties,            // raw property schema from response (Notion's wire-format)
 *   }
 *
 * `properties` echoes the server-side schema verbatim because that's
 * what downstream actions (queryDatabase, createDatabaseEntry) reference
 * by property name; reshaping here would obscure the schema shape that
 * users see in Notion's UI.
 */
export const createDatabase: ActionHandler = async (input) => {
  const config = CreateDatabaseConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "notion",
    accountId,
    apiCall: (accessToken) =>
      databasesCreate({
        accessToken,
        parentPageId: config.parentPageId,
        title: config.title,
        description: config.description,
        isInline: config.isInline,
        properties: config.properties,
      }),
  });

  return {
    output: mapNotionDatabase(result),
  };
};

/**
 * Map a Notion database response into V2's stable flat output shape.
 */
export function mapNotionDatabase(
  db: NotionDatabase,
): Readonly<Record<string, unknown>> {
  return {
    databaseId: db.id,
    object: db.object,
    url: db.url ?? null,
    title: extractRichTextPlain(db.title),
    description: extractRichTextPlain(db.description),
    archived: db.archived ?? false,
    isInline: db.is_inline ?? false,
    parentType: db.parent?.type ?? null,
    parentId:
      db.parent?.page_id ?? db.parent?.block_id ?? null,
    createdTime: db.created_time ?? null,
    lastEditedTime: db.last_edited_time ?? null,
    properties: db.properties ?? {},
  };
}

function extractRichTextPlain(
  segments:
    | ReadonlyArray<{
        plain_text?: string;
        text?: { content?: string };
      }>
    | undefined,
): string {
  if (!segments) return "";
  return segments
    .map((s) => s.plain_text ?? s.text?.content ?? "")
    .join("");
}
