import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:delete_page` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `deletePage.schema.ts`:
 *   - `notebookId` OPTIONAL UI scope-narrower (handler ignores) —
 *                  parent of the sections picker.
 *   - `sectionId`  OPTIONAL UI scope-narrower (handler ignores) —
 *                  parent of the pages picker.
 *   - `pageId`     REQUIRED — page to delete. Combobox via
 *                  `microsoft-onenote:pages` (depends on `sectionId`).
 *
 * **Full destructive trio:** `isDestructive: true` +
 * `requiresConfirmation: true` + `riskLevel: "high"`. Page deletion
 * is irreversible from ChainReact's side — the page is removed from
 * the section. Microsoft Graph does NOT expose a deleted-pages /
 * recycle-bin endpoint for OneNote (different from Outlook
 * `DeletedItems`). The OneNote desktop app has a per-notebook
 * recycle bin that may surface recently-deleted pages, but it's
 * client-side and not reliable for automation recovery.
 *
 * No output `content` / `title` / `body` is surfaced post-delete —
 * the handler intentionally returns only structural ack
 * (`{success, deletedPageId, deletedAt}`) so deletion doesn't echo
 * the just-deleted body.
 *
 * Sensitive outputs:
 *   - `deletedPageId` — opaque id, not sensitive. (No `title` /
 *     `content` is surfaced — see above.)
 *   - `deletedAt` / `success` — structural; not sensitive.
 */
export const microsoftOneNoteDeletePageMeta: ActionMeta = {
  key: "microsoft-onenote:delete_page",
  provider: "microsoft-onenote",
  type: "delete_page",
  displayName: "Delete Page",
  description:
    "**Destructive.** Permanently delete a OneNote page via Graph `DELETE /me/onenote/pages/{id}`. **Irreversible from ChainReact** — Microsoft Graph does NOT expose a deleted-pages / recycle-bin endpoint for OneNote. The OneNote desktop app has a per-notebook recycle bin that may surface recently-deleted pages, but it's client-side and unreliable for automation recovery. Requires typed confirmation before activation + real Run-now. Output intentionally does NOT echo the deleted page's body or title.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "notebookId",
      label: "Notebook",
      description:
        "Pick the notebook containing the page to delete. Required so the section picker scopes its results.",
      type: "combobox",
      optionsSource: "microsoft-onenote:notebooks",
      required: true,
      placeholder: "Search notebooks…",
    },
    {
      name: "sectionId",
      label: "Section",
      description:
        "Pick the section containing the page to delete. Required so the page picker scopes its results.",
      type: "combobox",
      optionsSource: "microsoft-onenote:sections",
      dependsOn: "notebookId",
      required: true,
      placeholder: "Select Notebook first",
    },
    {
      name: "pageId",
      label: "Page",
      description:
        "Pick the page to delete. Confirm carefully — the page content cannot be recovered through ChainReact.",
      type: "combobox",
      optionsSource: "microsoft-onenote:pages",
      dependsOn: "sectionId",
      required: true,
      placeholder: "Select Section first",
    },
  ],
  outputs: [
    {
      name: "success",
      type: "boolean",
      description: "Always `true` on successful deletion.",
    },
    {
      name: "deletedPageId",
      type: "string",
      description: "Echoed page id that was deleted (== input.pageId).",
    },
    {
      name: "deletedAt",
      type: "string",
      description: "ISO 8601 timestamp the delete completed at.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Destructive — permanently deletes the OneNote page. Microsoft Graph has no deleted-pages / recycle-bin endpoint; the OneNote desktop app's per-notebook recycle bin is client-side and unreliable for automation recovery. Page content cannot be restored through ChainReact.",
};
