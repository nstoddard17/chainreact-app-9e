import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { sectionsGet } from "../api/sectionsGet";
import { GetSectionDetailsConfigSchema } from "./getSectionDetails.schema";

/**
 * Microsoft OneNote `get_section_details` action handler —
 * Slice 3.ONENOTE-2.
 *
 * Wraps Graph `GET /me/onenote/sections/{sectionId}`.
 *
 * Output (downstream variable refs):
 *   {id, displayName, createdDateTime, lastModifiedDateTime,
 *    isDefault, pagesUrl, links}
 */
export const getSectionDetails: ActionHandler = async (input) => {
  const config = GetSectionDetailsConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.accountId
      : null;

  const section = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-onenote",
    accountId,
    apiCall: (accessToken) =>
      sectionsGet({ accessToken, sectionId: config.sectionId }),
  });

  return {
    output: {
      id: section.id,
      displayName: section.displayName ?? null,
      createdDateTime: section.createdDateTime ?? null,
      lastModifiedDateTime: section.lastModifiedDateTime ?? null,
      isDefault: section.isDefault ?? false,
      pagesUrl: section.pagesUrl ?? null,
      links: section.links ?? null,
    },
  };
};
