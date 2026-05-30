import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { notebooksList } from "../api/notebooksList";
import { ListNotebooksConfigSchema } from "./listNotebooks.schema";

/**
 * Microsoft OneNote `list_notebooks` action handler —
 * Slice 3.ONENOTE-2.
 *
 * Wraps Graph `GET /me/onenote/notebooks`. Returns one page +
 * `nextLink` for forward-compat; does NOT auto-paginate.
 *
 * Output (downstream variable refs):
 *   {notebooks: [{id, displayName, createdDateTime,
 *                 lastModifiedDateTime, isDefault, isShared}],
 *    count, hasMore, nextLink}
 */
export const listNotebooks: ActionHandler = async (input) => {
  const config = ListNotebooksConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-onenote",
    providerAccountId,
    apiCall: (accessToken) =>
      notebooksList({ accessToken, orderBy: config.orderBy }),
  });

  return {
    output: {
      notebooks: result.notebooks.map((n) => ({
        id: n.id,
        displayName: n.displayName ?? null,
        createdDateTime: n.createdDateTime ?? null,
        lastModifiedDateTime: n.lastModifiedDateTime ?? null,
        isDefault: n.isDefault ?? false,
        isShared: n.isShared ?? false,
      })),
      count: result.notebooks.length,
      hasMore: result.nextLink !== null,
      nextLink: result.nextLink,
    },
  };
};
