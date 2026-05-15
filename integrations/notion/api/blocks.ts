import type { NotionBlockBody } from "@/integrations/_shared/notion/blocks";
import { notionRequest } from "./_request";

/**
 * Notion Blocks API wrappers — Slice 9 + Notion 2.1 Commit 4.
 *
 * Three endpoints:
 *   - `blocksAppendChildren` — PATCH /v1/blocks/{block_id}/children (Slice 9)
 *   - `blocksRetrieve` — GET /v1/blocks/{block_id} (Notion 2.1 Commit 4)
 *   - `blocksChildrenList` — GET /v1/blocks/{block_id}/children (Notion 2.1 Commit 4)
 *
 * Used by `actions/appendBlockChildren.ts`, `actions/getBlock.ts`,
 * `actions/getBlockChildren.ts`. The same endpoints accept a page id
 * (Notion treats pages as blocks at the API level), so these wrappers
 * cover both "block-as-block" and "page-as-block" cases.
 *
 * Notion enforces a hard cap of 100 children per request on append;
 * the caller (action schema) enforces this as a Zod constraint so the
 * wrapper doesn't need to validate.
 */

// ─── Shared shapes ────────────────────────────────────────────────────────

/**
 * Notion's rich-text segment shape (subset). Same shape as the comments
 * wrapper but exported here for block-side consumers. Rich-text-bearing
 * block types (paragraph, headings, list items, quote, to_do, callout,
 * code, toggle, ...) carry an array of these.
 */
export interface NotionRichTextSegment {
  type?: "text" | "mention" | "equation";
  plain_text?: string;
  text?: { content?: string; link?: { url: string } | null };
  href?: string | null;
}

/**
 * Notion's block response shape. Subset — only fields V2 reads.
 *
 * `type` discriminates the per-type payload at `result[result.type]`.
 * V2's block-action mapping does NOT echo the entire raw block object;
 * the handler builds a stable flat output from named fields.
 */
export interface NotionBlock {
  object: "block";
  id: string;
  type?: string;
  archived?: boolean;
  has_children?: boolean;
  created_time?: string;
  last_edited_time?: string;
  parent?: {
    type?: "page_id" | "block_id" | "database_id" | "workspace";
    page_id?: string;
    block_id?: string;
    database_id?: string;
    workspace?: boolean;
  };
  /**
   * The type-specific payload — Notion returns the block's content
   * under a key named after the block's `type` field. We index into
   * this generically via `block[block.type]` in the handler.
   */
  [key: string]: unknown;
}

// ─── blocksAppendChildren (Slice 9) ──────────────────────────────────────

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

// ─── blocksRetrieve ──────────────────────────────────────────────────────

export interface BlocksRetrieveInput {
  accessToken: string;
  /** Block id OR page id — same dual meaning as elsewhere. */
  blockId: string;
}

export async function blocksRetrieve(
  input: BlocksRetrieveInput,
): Promise<NotionBlock> {
  return notionRequest<NotionBlock>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/v1/blocks/${encodeURIComponent(input.blockId)}`,
    resourceForNotFound: `block ${input.blockId}`,
  });
}

// ─── blocksChildrenList ──────────────────────────────────────────────────

export interface BlocksChildrenListResponse {
  object: "list";
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface BlocksChildrenListInput {
  accessToken: string;
  /** Block id OR page id — same dual meaning as elsewhere. */
  blockId: string;
  /** Optional — 1..100 per Notion's hard ceiling. Schema enforces. */
  pageSize?: number;
  startCursor?: string;
}

export async function blocksChildrenList(
  input: BlocksChildrenListInput,
): Promise<BlocksChildrenListResponse> {
  const params = new URLSearchParams();
  if (input.pageSize !== undefined) {
    params.set("page_size", String(input.pageSize));
  }
  if (input.startCursor !== undefined) {
    params.set("start_cursor", input.startCursor);
  }
  const qs = params.toString();
  const base = `/v1/blocks/${encodeURIComponent(input.blockId)}/children`;
  const path = qs.length > 0 ? `${base}?${qs}` : base;

  return notionRequest<BlocksChildrenListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path,
    resourceForNotFound: `block ${input.blockId}`,
  });
}
