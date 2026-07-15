import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { appendToNote } from "@/integrations/_shared/eden/api/notes";
import { AppendToNoteConfigSchema } from "./appendToNote.schema";

/** `eden:append_to_note` — append Markdown to a note. */
export const edenAppendToNote: ActionHandler = async (input) => {
  const config = AppendToNoteConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      appendToNote({ accessToken, ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}), itemId: config.itemId, content: config.content }),
  });
  return { output: { noteId: result.noteId } };
};
