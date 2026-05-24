import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { notebooksGet } from "../api/notebooksGet";
import { GetNotebookDetailsConfigSchema } from "./getNotebookDetails.schema";

/**
 * Microsoft OneNote `get_notebook_details` action handler —
 * Slice 3.ONENOTE-2.
 *
 * Wraps Graph `GET /me/onenote/notebooks/{notebookId}`.
 *
 * Output (downstream variable refs):
 *   {id, displayName, createdDateTime, lastModifiedDateTime,
 *    isDefault, isShared, sectionsUrl, sectionGroupsUrl, links}
 */
export const getNotebookDetails: ActionHandler = async (input) => {
  const config = GetNotebookDetailsConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.accountId
      : null;

  const notebook = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-onenote",
    accountId,
    apiCall: (accessToken) =>
      notebooksGet({ accessToken, notebookId: config.notebookId }),
  });

  return {
    output: {
      id: notebook.id,
      displayName: notebook.displayName ?? null,
      createdDateTime: notebook.createdDateTime ?? null,
      lastModifiedDateTime: notebook.lastModifiedDateTime ?? null,
      isDefault: notebook.isDefault ?? false,
      isShared: notebook.isShared ?? false,
      sectionsUrl: notebook.sectionsUrl ?? null,
      sectionGroupsUrl: notebook.sectionGroupsUrl ?? null,
      links: notebook.links ?? null,
    },
  };
};
