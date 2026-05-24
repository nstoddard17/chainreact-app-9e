import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { sectionsList } from "../api/sectionsList";
import { ListSectionsConfigSchema } from "./listSections.schema";

/**
 * Microsoft OneNote `list_sections` action handler —
 * Slice 3.ONENOTE-2.
 *
 * Wraps Graph `GET /me/onenote/notebooks/{notebookId}/sections`.
 *
 * Output (downstream variable refs):
 *   {sections: [{id, displayName, createdDateTime,
 *                lastModifiedDateTime, isDefault}],
 *    count, hasMore, nextLink}
 */
export const listSections: ActionHandler = async (input) => {
  const config = ListSectionsConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-onenote",
    accountId,
    apiCall: (accessToken) =>
      sectionsList({
        accessToken,
        notebookId: config.notebookId,
        orderBy: config.orderBy,
      }),
  });

  return {
    output: {
      sections: result.sections.map((s) => ({
        id: s.id,
        displayName: s.displayName ?? null,
        createdDateTime: s.createdDateTime ?? null,
        lastModifiedDateTime: s.lastModifiedDateTime ?? null,
        isDefault: s.isDefault ?? false,
      })),
      count: result.sections.length,
      hasMore: result.nextLink !== null,
      nextLink: result.nextLink,
    },
  };
};
