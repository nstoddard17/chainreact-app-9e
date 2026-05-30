import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pagesCopyToSection } from "../api/pagesCopyToSection";
import { CopyPageConfigSchema } from "./copyPage.schema";

/**
 * Microsoft OneNote `copy_page` action handler — Slice 3.ONENOTE-2.
 *
 * Wraps Graph `POST /me/onenote/pages/{id}/copyToSection`.
 *
 * **Asynchronous Graph operation.** Graph accepts the request (HTTP
 * 202) and returns an `Operation-Location` header. The actual copy
 * completes server-side; the new page id is observable only via
 * polling that operation endpoint.
 *
 * **ONENOTE-2 does NOT poll the operation** per ONENOTE-1 D-ON2.
 * `success: true` means "Graph accepted the request" — NOT "copy
 * complete." Workflow authors who need the new page id chain via
 * the next polling cycle's `new_note` trigger (ONENOTE-5).
 *
 * Real operation polling can ship as an ONENOTE-N polish slice if
 * real consumers ask. The action meta (ONENOTE-4) surfaces this
 * "accepted vs complete" warning in its description.
 *
 * Output (downstream variable refs):
 *   {operationLocation, sourcePageId, targetSectionId, success}
 */
export const copyPage: ActionHandler = async (input) => {
  const config = CopyPageConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-onenote",
    providerAccountId,
    apiCall: (accessToken) =>
      pagesCopyToSection({
        accessToken,
        pageId: config.sourcePageId,
        targetSectionId: config.targetSectionId,
      }),
  });

  return {
    output: {
      operationLocation: result.operationLocation,
      sourcePageId: config.sourcePageId,
      targetSectionId: config.targetSectionId,
      // "Graph accepted the request" — NOT "copy complete." Description
      // in the ONENOTE-4 meta warns.
      success: true,
    },
  };
};
