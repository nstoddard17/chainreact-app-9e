import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { parseProperties } from "@/integrations/_shared/notion/properties";
import type { NotionPropertyResponse } from "@/integrations/_shared/notion/properties";
import { databasesQuery } from "../api/databases";
import { QueryDatabaseConfigSchema } from "./queryDatabase.schema";

/**
 * Notion `query_database` action handler.
 *
 * Returns paginated rows from a Notion database. Each row's properties
 * are parsed via `parseProperties` — supported types surface as typed
 * values; unsupported types (relation, people, files, rollup, formula,
 * multi_select, status) are summarized in the row's `skippedProperties`
 * so workflows can degrade gracefully.
 *
 * Output shape (downstream variable refs):
 *   { results, hasMore, nextCursor }
 *   - `results` is an array of:
 *     { id, url, archived, createdTime, lastEditedTime,
 *       properties: Record<name, ParsedPropertyValue>,
 *       skippedProperties: Array<{ name, type }> }
 *   - workflows can drill into
 *     `{{nodeId.results[0].properties.Name.value}}`.
 */
export const queryDatabase: ActionHandler = async (input) => {
  const config = QueryDatabaseConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "notion",
    accountId,
    apiCall: (accessToken) =>
      databasesQuery({
        accessToken,
        databaseId: config.databaseId,
        filter: config.filter,
        sorts: config.sorts,
        pageSize: config.pageSize,
        startCursor: config.startCursor,
      }),
  });

  const results = result.results.map((row) => {
    const { parsed, skipped } = parseProperties(
      (row.properties ?? {}) as Record<string, NotionPropertyResponse>,
    );
    return {
      id: row.id,
      url: row.url ?? null,
      archived: row.archived ?? false,
      createdTime: row.created_time ?? null,
      lastEditedTime: row.last_edited_time ?? null,
      properties: parsed,
      skippedProperties: skipped,
    };
  });

  return {
    output: {
      results,
      hasMore: result.has_more,
      nextCursor: result.next_cursor,
    },
  };
};
