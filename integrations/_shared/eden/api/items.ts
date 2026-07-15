import { edenCallTool, type EdenEnvelope } from "./_client";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * A bounded workspace item (board/canvas child, note, saved link/post, etc). Drops provider-internal
 * fields (file.storagePath, raw social/creatorProfile blobs, previewMessages) — keeps stable id,
 * title, type, parent, timestamps, and a source url when present.
 */
export interface EdenItem {
  id: string;
  title: string | null;
  type: string | null;
  parentId: string | null;
  url: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

export function normalizeItem(raw: unknown): EdenItem {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(o.id) ?? "",
    title: str(o.title),
    type: str(o.type),
    parentId: str(o.parentId),
    url: str(o.url),
    createdAt: num(o.createdAt),
    updatedAt: num(o.updatedAt),
  };
}

export interface EdenItemList {
  items: EdenItem[];
  count: number | null;
  totalCount: number | null;
  nextCursor: string | null;
}

function toItemList(env: EdenEnvelope): EdenItemList {
  const raw = Array.isArray(env.items) ? (env.items as unknown[]) : [];
  return {
    items: raw.map(normalizeItem).filter((i) => i.id.length > 0),
    count: num(env.count),
    totalCount: num(env.totalCount),
    nextCursor: str(env.nextCursor),
  };
}

/** `eden_list_workspace_items` — one page of items, optionally filtered by type / parent board. */
export async function listWorkspaceItems(input: {
  accessToken: string;
  workspaceId?: string;
  type?: string;
  parentId?: string;
  limit?: number;
  cursor?: string;
}): Promise<EdenItemList> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_list_workspace_items",
    args: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.parentId ? { parentId: input.parentId } : {}),
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    },
    idempotent: true,
  });
  return toItemList(env);
}

/** `eden_search_workspace_items` — text search across workspace items (one page + cursor). */
export async function searchWorkspaceItems(input: {
  accessToken: string;
  workspaceId?: string;
  q: string;
  type?: string;
  parentId?: string;
  limit?: number;
  cursor?: string;
}): Promise<EdenItemList> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_search_workspace_items",
    args: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      q: input.q,
      ...(input.type ? { type: input.type } : {}),
      ...(input.parentId ? { parentId: input.parentId } : {}),
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    },
    idempotent: true,
  });
  return toItemList(env);
}
