import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { OneNotePage } from "../../api/types";
import { buildEventId } from "./dedup";

/**
 * Builds the canonical TriggerEvent for OneNote `new_note` — Slice
 * 3.ONENOTE-5.
 *
 * **No body / content surfaced.** Per ONENOTE-5 architecture spec and
 * matching the `list_pages` action precedent, the trigger payload
 * carries metadata only — title, URLs, notebook/section identifiers,
 * timestamps. Workflow authors chain `get_page_content` for the body
 * (which gets `content` marked sensitive at the action layer).
 *
 * Payload shape mirrors the `microsoft-onenote:new_note` TriggerMeta's
 * `payloadShape[]`. Drift trips the discovery contract test.
 *
 * `notebookName` / `sectionName` are best-effort — Graph's
 * `onenotePage.parentNotebook` + `parentSection` echo when the
 * pages-list response includes the expand, but the wrapper doesn't
 * currently request `$expand=parentNotebook,parentSection`. We pass
 * `null` when not available rather than blocking on an extra Graph
 * round-trip; the description warns + workflow authors can chain
 * `get_notebook_details` / `get_section_details` for names.
 */

export interface NormalizeInput {
  page: OneNotePage;
  providerAccountId: string;
  notebookId: string;
  sectionId: string;
}

export function normalizeNewNote(input: NormalizeInput): TriggerEvent {
  const { page, providerAccountId, notebookId, sectionId } = input;
  return {
    provider: "microsoft-onenote",
    eventType: "new_note",
    eventId: buildEventId(page.id),
    occurredAt: page.createdDateTime ?? new Date().toISOString(),
    providerAccountId,
    payload: {
      changeKind: "created",
      pageId: page.id,
      title: page.title ?? null,
      webUrl: page.links?.oneNoteWebUrl?.href ?? null,
      contentUrl: page.contentUrl ?? null,
      notebookId,
      notebookName: page.parentNotebook?.displayName ?? null,
      sectionId,
      sectionName: page.parentSection?.displayName ?? null,
      createdDateTime: page.createdDateTime ?? null,
      lastModifiedDateTime: page.lastModifiedDateTime ?? null,
    },
  };
}
