import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { createNote } from "@/integrations/_shared/eden/api/notes";
import { CreateNoteConfigSchema } from "./createNote.schema";

/** `eden:create_note` — create a note on a board. */
export const edenCreateNote: ActionHandler = async (input) => {
  const config = CreateNoteConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      createNote({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        boardId: config.boardId,
        ...(config.title !== undefined ? { title: config.title } : {}),
        ...(config.content !== undefined ? { content: config.content } : {}),
      }),
  });
  return {
    output: {
      noteId: result.noteId,
      boardId: result.boardId,
      title: result.title,
    },
  };
};
