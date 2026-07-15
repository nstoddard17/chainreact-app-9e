import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { renameNote } from "@/integrations/_shared/eden/api/notes";
import { RenameNoteConfigSchema } from "./renameNote.schema";

/** `eden:rename_note` — change a note's title. */
export const edenRenameNote: ActionHandler = async (input) => {
  const config = RenameNoteConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      renameNote({ accessToken, ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}), itemId: config.itemId, title: config.title }),
  });
  return { output: { noteId: result.noteId, title: result.title } };
};
