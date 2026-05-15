import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  blocksRetrieve,
  type NotionBlock,
  type NotionRichTextSegment,
} from "../api/blocks";
import { GetBlockConfigSchema } from "./getBlock.schema";

/**
 * Notion `get_block` action handler (Notion 2.1 Commit 4).
 *
 * Sends `GET /v1/blocks/{block_id}` and returns a stable flat
 * projection. Does NOT echo the entire raw block object — V1's
 * `notionGetBlock` returned `block: result` which leaks every Notion
 * field including future ones we may not understand. V2 returns named
 * fields plus the type-specific `content` payload (e.g. `result.paragraph`
 * for paragraphs) which is already bounded by Notion's per-type shape.
 *
 * Output shape (key set locked):
 *   {
 *     blockId,
 *     object,
 *     type,                  // "paragraph" | "heading_1" | "to_do" | ...
 *     archived,
 *     hasChildren,
 *     parentType,            // "page_id" | "block_id" | "database_id" | "workspace" | null
 *     parentId,              // resolved id from parent.page_id / block_id / database_id
 *     createdTime,
 *     lastEditedTime,
 *     plainText,             // extracted rich_text plain_text for rich-text-bearing blocks; "" otherwise
 *     content,               // type-specific payload (result[result.type]); {} when type is absent
 *   }
 */
export const getBlock: ActionHandler = async (input) => {
  const config = GetBlockConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "notion",
    accountId,
    apiCall: (accessToken) =>
      blocksRetrieve({
        accessToken,
        blockId: config.blockId,
      }),
  });

  return {
    output: mapNotionBlock(result),
  };
};

/**
 * Map a Notion block response into V2's stable flat output shape.
 * Reused by `get_block_children` so single + list block outputs match.
 */
export function mapNotionBlock(
  block: NotionBlock,
): Readonly<Record<string, unknown>> {
  const typeKey = block.type;
  const typeContent =
    typeKey !== undefined && typeKey in block
      ? (block[typeKey] as Record<string, unknown>)
      : {};

  return {
    blockId: block.id,
    object: block.object,
    type: block.type ?? null,
    archived: block.archived ?? false,
    hasChildren: block.has_children ?? false,
    parentType: block.parent?.type ?? null,
    parentId:
      block.parent?.page_id ??
      block.parent?.block_id ??
      block.parent?.database_id ??
      null,
    createdTime: block.created_time ?? null,
    lastEditedTime: block.last_edited_time ?? null,
    plainText: extractBlockPlainText(typeContent),
    content: typeContent,
  };
}

/**
 * Extract plain text from a block's type-specific payload. Rich-text-
 * bearing block types (paragraph, headings, list items, to_do, quote,
 * callout, code, toggle) carry a `rich_text` array at this level.
 * Non-text blocks (divider, image, embed, ...) return "" — workflow
 * authors needing image URLs etc. read from `content` directly.
 */
function extractBlockPlainText(
  typeContent: Record<string, unknown>,
): string {
  const richText = typeContent.rich_text;
  if (!Array.isArray(richText)) return "";
  return (richText as ReadonlyArray<NotionRichTextSegment>)
    .map((s) => s.plain_text ?? s.text?.content ?? "")
    .join("");
}
