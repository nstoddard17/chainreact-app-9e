import { edenCallTool } from "./_client";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export interface EdenCreatedNote {
  noteId: string;
  boardId: string | null;
  title: string | null;
}

/** `eden_create_note` → a note on a board. Returns the new note (item) id. */
export async function createNote(input: {
  accessToken: string;
  workspaceId?: string;
  boardId: string;
  title?: string;
  content?: string;
}): Promise<EdenCreatedNote> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_create_note",
    args: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      boardId: input.boardId,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
    },
    idempotent: false,
  });
  return { noteId: str(env.itemId) ?? "", boardId: str(env.boardId), title: str(env.title) };
}

export interface EdenNote {
  noteId: string;
  title: string | null;
  markdown: string;
  accessMode: string | null;
}

/** `eden_get_note_markdown` → a note's title + markdown body. `markdown` is note content (sensitive). */
export async function getNoteMarkdown(input: {
  accessToken: string;
  workspaceId?: string;
  itemId: string;
}): Promise<EdenNote> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_get_note_markdown",
    args: { ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}), itemId: input.itemId },
    idempotent: true,
  });
  return {
    noteId: str(env.itemId) ?? input.itemId,
    title: str(env.title),
    markdown: str(env.markdown) ?? "",
    accessMode: str(env.accessMode),
  };
}

/** `eden_append_to_note` → append markdown to an existing note. */
export async function appendToNote(input: {
  accessToken: string;
  workspaceId?: string;
  itemId: string;
  content: string;
}): Promise<{ noteId: string }> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_append_to_note",
    args: { ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}), itemId: input.itemId, content: input.content },
    idempotent: false,
  });
  return { noteId: str(env.itemId) ?? input.itemId };
}

/** `eden_update_note` → REPLACE a note's content (rewrite). */
export async function updateNote(input: {
  accessToken: string;
  workspaceId?: string;
  itemId: string;
  content: string;
}): Promise<{ noteId: string }> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_update_note",
    args: { ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}), itemId: input.itemId, content: input.content },
    idempotent: false,
  });
  return { noteId: str(env.itemId) ?? input.itemId };
}

/** `eden_rename_note` → change a note's title. */
export async function renameNote(input: {
  accessToken: string;
  workspaceId?: string;
  itemId: string;
  title: string;
}): Promise<{ noteId: string; title: string | null }> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_rename_note",
    args: { ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}), itemId: input.itemId, title: input.title },
    idempotent: false,
  });
  return { noteId: str(env.itemId) ?? input.itemId, title: str(env.title) };
}

/** `eden_create_sticky_note` → a sticky note on a board. */
export async function createStickyNote(input: {
  accessToken: string;
  workspaceId?: string;
  boardId: string;
  content: string;
  color?: string;
}): Promise<{ noteId: string; boardId: string | null }> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_create_sticky_note",
    args: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      boardId: input.boardId,
      content: input.content,
      ...(input.color ? { color: input.color } : {}),
    },
    idempotent: false,
  });
  return { noteId: str(env.itemId) ?? "", boardId: str(env.boardId) };
}
