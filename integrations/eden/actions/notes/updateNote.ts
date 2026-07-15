import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { updateNote } from "@/integrations/_shared/eden/api/notes";
import { UpdateNoteConfigSchema } from "./updateNote.schema";

/** `eden:update_note` — replace a note's content (rewrite). */
export const edenUpdateNote: ActionHandler = async (input) => {
  const config = UpdateNoteConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      updateNote({ accessToken, ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}), itemId: config.itemId, content: config.content }),
  });
  return { output: { noteId: result.noteId } };
};
