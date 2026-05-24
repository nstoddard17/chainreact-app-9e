/**
 * Shared TypeScript types for the Microsoft Graph OneNote resources
 * (Notebook, Section, Page) — Slice 3.ONENOTE-2.
 *
 * Subset of the full Graph schemas — only the fields V2 reads in
 * responses + writes in create/update/copy bodies. Adding a new field
 * that V2 needs to read goes here, not in each per-wrapper file.
 *
 * Graph references:
 *   https://learn.microsoft.com/graph/api/resources/notebook
 *   https://learn.microsoft.com/graph/api/resources/onenotesection
 *   https://learn.microsoft.com/graph/api/resources/onenotepage
 */

/**
 * Graph-rendered links block — present on Notebook, Section, Page.
 * Each has `oneNoteClientUrl` (opens in the OneNote app) and
 * `oneNoteWebUrl` (opens in the OneNote web app).
 */
export interface OneNoteLinks {
  oneNoteClientUrl?: { href?: string };
  oneNoteWebUrl?: { href?: string };
}

/**
 * Subset of Graph `notebook` resource. V2 reads `id`, `displayName`,
 * `createdDateTime`, `lastModifiedDateTime`, `isDefault`, `isShared`,
 * `sectionsUrl`, `sectionGroupsUrl`, `links`.
 */
export interface OneNoteNotebook {
  id: string;
  displayName?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  isDefault?: boolean;
  isShared?: boolean;
  sectionsUrl?: string;
  sectionGroupsUrl?: string;
  links?: OneNoteLinks;
  [k: string]: unknown;
}

/**
 * Subset of Graph `onenoteSection` resource. V2 reads `id`,
 * `displayName`, `createdDateTime`, `lastModifiedDateTime`,
 * `isDefault`, `pagesUrl`, `links`.
 */
export interface OneNoteSection {
  id: string;
  displayName?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  isDefault?: boolean;
  pagesUrl?: string;
  links?: OneNoteLinks;
  [k: string]: unknown;
}

/**
 * Subset of Graph `onenotePage` resource. V2 reads `id`, `title`,
 * `createdDateTime`, `lastModifiedDateTime`, `level`, `order`,
 * `contentUrl`, `links`, `parentSection`, `parentNotebook`.
 *
 * Note: Graph response carries `webUrl` indirectly via
 * `links.oneNoteWebUrl.href`. There is NO top-level `webUrl` on
 * Graph's `onenotePage` resource. Handlers construct the webUrl from
 * `links.oneNoteWebUrl.href` (V1 fallback chain identical).
 */
export interface OneNotePage {
  id: string;
  title?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  level?: number;
  order?: number;
  contentUrl?: string;
  links?: OneNoteLinks;
  parentSection?: { id?: string; displayName?: string };
  parentNotebook?: { id?: string; displayName?: string };
  [k: string]: unknown;
}

/**
 * Graph PATCH operation entries accepted by
 * `PATCH /me/onenote/pages/{id}/content`. The handler builds one entry
 * per `updateMode` value (`append` / `prepend` / `replace` / `insert`)
 * — see `updatePage.ts`.
 *
 * Reference: https://learn.microsoft.com/graph/api/page-update
 */
export interface OneNotePagePatchAction {
  /** Either "body" (special token) or a CSS selector / `data-id` value. */
  target: string;
  /** `append`, `prepend`, `replace`, `insert`. */
  action: "append" | "prepend" | "replace" | "insert" | "before" | "after";
  /** HTML or xhtml content to apply. */
  content: string;
  /** Optional `position` for `insert` — "after" / "before". */
  position?: "after" | "before";
}
