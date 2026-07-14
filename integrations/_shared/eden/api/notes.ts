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
