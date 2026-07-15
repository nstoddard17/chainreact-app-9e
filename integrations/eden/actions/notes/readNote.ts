import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getNoteMarkdown } from "@/integrations/_shared/eden/api/notes";
import { ReadNoteConfigSchema } from "./readNote.schema";

/** `eden:read_note` — a note's title + markdown body. */
export const edenReadNote: ActionHandler = async (input) => {
  const config = ReadNoteConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      getNoteMarkdown({ accessToken, ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}), itemId: config.itemId }),
  });
  return { output: { noteId: result.noteId, title: result.title, markdown: result.markdown, accessMode: result.accessMode } };
};
