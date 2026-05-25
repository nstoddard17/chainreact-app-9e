import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pagesDelete } from "../api/pagesDelete";
import { DeletePageConfigSchema } from "./deletePage.schema";

/**
 * Microsoft OneNote `delete_page` action handler — Slice 3.ONENOTE-2.
 *
 * Wraps Graph `DELETE /me/onenote/pages/{id}`.
 *
 * **Irreversible.** Risk gating ships in ONENOTE-4 meta.
 *
 * Output (downstream variable refs):
 *   {success, deletedPageId, deletedAt}
 *
 * The output deliberately does NOT include any page body content —
 * a deleted page surfaces only the structural confirmation. This
 * matches the V1 surface and the structural sensitive-output rules.
 */
export const deletePage: ActionHandler = async (input) => {
  const config = DeletePageConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.accountId
      : null;

  await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-onenote",
    accountId,
    apiCall: (accessToken) =>
      pagesDelete({ accessToken, pageId: config.pageId }),
  });

  return {
    output: {
      success: true,
      deletedPageId: config.pageId,
      deletedAt: new Date().toISOString(),
    },
  };
};
