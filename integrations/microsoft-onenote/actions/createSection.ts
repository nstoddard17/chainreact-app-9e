import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { sectionsCreate } from "../api/sectionsCreate";
import { CreateSectionConfigSchema } from "./createSection.schema";

/**
 * Microsoft OneNote `create_section` action handler —
 * Slice 3.ONENOTE-2.
 *
 * Wraps Graph
 * `POST /me/onenote/notebooks/{notebookId}/sections` with
 * `{displayName}`.
 *
 * Output (downstream variable refs):
 *   {id, displayName, createdDateTime, lastModifiedDateTime,
 *    isDefault, pagesUrl}
 */
export const createSection: ActionHandler = async (input) => {
  const config = CreateSectionConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.accountId
      : null;

  const section = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-onenote",
    accountId,
    apiCall: (accessToken) =>
      sectionsCreate({
        accessToken,
        notebookId: config.notebookId,
        displayName: config.displayName,
      }),
  });

  return {
    output: {
      id: section.id,
      displayName: section.displayName ?? config.displayName,
      createdDateTime: section.createdDateTime ?? null,
      lastModifiedDateTime: section.lastModifiedDateTime ?? null,
      isDefault: section.isDefault ?? false,
      pagesUrl: section.pagesUrl ?? null,
    },
  };
};
