import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OneNotePagePatchAction } from "../api/types";
import { pageContentUpdate } from "../api/pageContentUpdate";
import { pagesGet } from "../api/pagesGet";
import { UpdatePageConfigSchema } from "./updatePage.schema";

/**
 * Microsoft OneNote `update_page` action handler — Slice 3.ONENOTE-2.
 *
 * Two-step (read-after-write):
 *   1. `PATCH /me/onenote/pages/{id}/content` with the operation
 *      list built from `updateMode` + `content` (+ `target` /
 *      `position` for insert mode).
 *   2. `GET /me/onenote/pages/{id}` to refresh the metadata for the
 *      output (Graph PATCH returns 204 No Content). Outputs `title`
 *      + `lastModifiedDateTime` + links.
 *
 * **`replace` mode wipes the page body.** Recovery is via OneNote's
 * version history UI — NOT through ChainReact. Risk classification
 * stays at `medium` per ONENOTE-1 §5.1; ONENOTE-4 metas surface a
 * description warning.
 *
 * `insert` mode dispatch:
 *   - `position: "after"` (default) → Graph `action: "after"`.
 *   - `position: "before"` → Graph `action: "before"`.
 *   - `position: "inside"` → Graph `action: "append"` (Graph's
 *     "append inside an element" semantics).
 *
 * Output (downstream variable refs):
 *   {id, title, contentUrl, webUrl, lastModifiedDateTime, success,
 *    updateMode}
 */

function buildPatchOperations(
  updateMode: "append" | "prepend" | "replace" | "insert",
  content: string,
  target: string | undefined,
  position: "after" | "before" | "inside",
): OneNotePagePatchAction[] {
  if (updateMode === "insert") {
    // Schema's superRefine guarantees target is present at this
    // point, but a defensive check keeps the type system happy.
    if (!target) {
      throw new Error(
        "updatePage: insert mode requires `target` (schema should have caught this).",
      );
    }
    const action = position === "inside" ? "append" : position;
    return [{ target, action, content }];
  }
  // append / prepend / replace all target the body sentinel.
  return [{ target: "body", action: updateMode, content }];
}

export const updatePage: ActionHandler = async (input) => {
  const config = UpdatePageConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-onenote"
      ? input.triggerEvent.accountId
      : null;

  const operations = buildPatchOperations(
    config.updateMode,
    config.content,
    config.target,
    config.position,
  );

  await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-onenote",
    accountId,
    apiCall: (accessToken) =>
      pageContentUpdate({
        accessToken,
        pageId: config.pageId,
        operations,
      }),
  });

  const page = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-onenote",
    accountId,
    apiCall: (accessToken) =>
      pagesGet({ accessToken, pageId: config.pageId }),
  });

  return {
    output: {
      id: config.pageId,
      title: page.title ?? null,
      contentUrl: page.contentUrl ?? null,
      webUrl: page.links?.oneNoteWebUrl?.href ?? null,
      lastModifiedDateTime: page.lastModifiedDateTime ?? null,
      success: true,
      updateMode: config.updateMode,
    },
  };
};
