import { edenCallTool, type EdenEnvelope } from "./_client";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface EdenCreatedBoard {
  boardId: string;
  title: string | null;
  workspaceId: string | null;
}

/** `eden_create_board` → the new board's id. */
export async function createBoard(input: {
  accessToken: string;
  workspaceId?: string;
  title: string;
}): Promise<EdenCreatedBoard> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_create_board",
    args: { ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}), title: input.title },
    idempotent: false,
  });
  return { boardId: str(env.boardId) ?? "", title: str(env.title), workspaceId: str(env.workspaceId) };
}

export interface EdenBoardSummary {
  boardId: string;
  title: string | null;
  itemCount: number | null;
  stickyNoteCount: number | null;
  textBlockCount: number | null;
}

/** `eden_read_board` → a bounded summary (counts), never the raw board contents/positions. */
export async function readBoard(input: {
  accessToken: string;
  workspaceId?: string;
  itemId: string;
}): Promise<EdenBoardSummary> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_read_board",
    args: { ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}), itemId: input.itemId },
    idempotent: true,
  });
  const summary = (env.summary ?? {}) as Record<string, unknown>;
  return {
    boardId: str(env.itemId) ?? input.itemId,
    title: str(env.title),
    itemCount: num(summary.itemCount),
    stickyNoteCount: num(summary.stickyNoteCount),
    textBlockCount: num(summary.textBlockCount),
  };
}

/** `eden_trash_board` → confirms the trashed board id (reversible in Eden's UI). */
export async function trashBoard(input: { accessToken: string; boardId: string }): Promise<{ boardId: string }> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_trash_board",
    args: { boardId: input.boardId },
    idempotent: false,
  });
  return { boardId: str(env.boardId) ?? input.boardId };
}

export interface EdenWorkspaceItem {
  id: string;
  title: string | null;
  type: string | null;
  parentId: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  pinned: boolean;
}

export interface EdenBoardList {
  items: EdenWorkspaceItem[];
  nextCursor: string | null;
  totalCount: number | null;
}

/**
 * `eden_list_workspace_items` → boards for the workspace, one page + cursor.
 *
 * LIVE-CERT NOTE (EDEN-4): Eden models a board as a workspace item of type **`canvas`** (verified
 * live 2026-07-14 — `type:"board"` returns zero items even when boards exist). Filter on `canvas`.
 */
export async function listBoards(input: {
  accessToken: string;
  workspaceId?: string;
  cursor?: string;
  limit?: number;
}): Promise<EdenBoardList> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_list_workspace_items",
    args: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      type: "canvas",
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    },
    idempotent: true,
  });
  const raw = Array.isArray(env.items) ? (env.items as unknown[]) : [];
  const items: EdenWorkspaceItem[] = raw.map((it) => {
    const o = (it ?? {}) as Record<string, unknown>;
    return {
      id: str(o.id) ?? "",
      title: str(o.title),
      type: str(o.type),
      parentId: str(o.parentId),
      createdAt: num(o.createdAt),
      updatedAt: num(o.updatedAt),
      pinned: o.pinned === true,
    };
  }).filter((i) => i.id.length > 0);
  return { items, nextCursor: str(env.nextCursor), totalCount: num(env.totalCount) };
}
