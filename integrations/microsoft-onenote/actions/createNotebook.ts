import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { notebooksCreate } from "../api/notebooksCreate";
import { CreateNotebookConfigSchema } from "./createNotebook.schema";

/**
 * Microsoft OneNote `create_notebook` action handler —
 * Slice 3.ONENOTE-2.
 *
 * Wraps Graph `POST /me/onenote/notebooks` with `{displayName}`.
 *
 * Output (downstream variable refs):
 *   {id, displayName, createdDateTime, lastModifiedDateTime,
 *    isDefault, isShared, sectionsUrl, sectionGroupsUrl}
 */
export const createNotebook: ActionHandler = async (input) => {
  const config = CreateNotebookConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.providerAccountId
      : null;

  const notebook = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-onenote",
    providerAccountId,
    apiCall: (accessToken) =>
      notebooksCreate({ accessToken, displayName: config.displayName }),
  });

  return {
    output: {
      id: notebook.id,
      displayName: notebook.displayName ?? config.displayName,
      createdDateTime: notebook.createdDateTime ?? null,
      lastModifiedDateTime: notebook.lastModifiedDateTime ?? null,
      isDefault: notebook.isDefault ?? false,
      isShared: notebook.isShared ?? false,
      sectionsUrl: notebook.sectionsUrl ?? null,
      sectionGroupsUrl: notebook.sectionGroupsUrl ?? null,
    },
  };
};
