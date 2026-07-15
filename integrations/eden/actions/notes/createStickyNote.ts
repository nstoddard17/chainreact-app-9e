import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { createStickyNote } from "@/integrations/_shared/eden/api/notes";
import { CreateStickyNoteConfigSchema } from "./createStickyNote.schema";

/** `eden:create_sticky_note` — add a sticky note to a board. */
export const edenCreateStickyNote: ActionHandler = async (input) => {
  const config = CreateStickyNoteConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      createStickyNote({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        boardId: config.boardId,
        content: config.content,
        ...(config.color ? { color: config.color } : {}),
      }),
  });
  return { output: { noteId: result.noteId, boardId: result.boardId } };
};
