import type { NotionBlockBody } from "@/integrations/_shared/notion/blocks";
import { notionRequest } from "./_request";

/**
 * Notion Blocks API wrapper — Slice 9.
 *
 * One endpoint:
 *   - `blocksAppendChildren` — PATCH /v1/blocks/{block_id}/children
 *
 * Used by `actions/appendBlockChildren.ts`. The same endpoint accepts
 * a page id (Notion treats pages as blocks at the API level), so this
 * wrapper covers both "append blocks under a page" and "append blocks
 * under a parent block."
 *
 * Notion enforces a hard cap of 100 children per request; the caller
 * (action schema) enforces this as a Zod constraint so the wrapper
 * doesn't need to validate.
 */

/**
 * Notion's response shape — list of newly-created block objects. We
 * don't echo the full block payload back to the engine; the action
 * handler returns ids + count.
 */
export interface BlocksAppendChildrenResponse {
  object: "list";
  results: ReadonlyArray<{ object: "block"; id: string; type?: string }>;
}

export interface BlocksAppendChildrenInput {
  accessToken: string;
  /** Block id OR page id — Notion treats pages as block parents. */
  blockId: string;
  children: ReadonlyArray<NotionBlockBody>;
}

export async function blocksAppendChildren(
  input: BlocksAppendChildrenInput,
): Promise<BlocksAppendChildrenResponse> {
  return notionRequest<BlocksAppendChildrenResponse>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: `/v1/blocks/${encodeURIComponent(input.blockId)}/children`,
    body: { children: input.children },
    resourceForNotFound: `block ${input.blockId}`,
  });
}
