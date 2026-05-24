import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { OneNotePage } from "../../api/types";
import { buildEventId } from "./dedup";

/**
 * Builds the canonical TriggerEvent for OneNote `updated_note` —
 * Slice 3.ONENOTE-5.
 *
 * **No body / content surfaced.** Same convention as `new_note` and
 * the `list_pages` action — metadata only. Workflow authors chain
 * `get_page_content` for the body.
 *
 * Payload shape mirrors the `microsoft-onenote:updated_note`
 * TriggerMeta's `payloadShape[]`. Drift trips the discovery contract
 * test.
 *
 * `changeKind: "updated"` distinguishes this trigger's payload from
 * `new_note`'s `"created"` for branch-on-kind workflows.
 */

export interface NormalizeInput {
  page: OneNotePage;
  accountId: string;
  notebookId: string;
  sectionId: string;
}

export function normalizeUpdatedNote(input: NormalizeInput): TriggerEvent {
  const { page, accountId, notebookId, sectionId } = input;
  const lastModified = page.lastModifiedDateTime;
  if (typeof lastModified !== "string" || lastModified.length === 0) {
    throw new Error(
      "normalizeUpdatedNote: page.lastModifiedDateTime is required for eventId composition.",
    );
  }
  return {
    provider: "microsoft-onenote",
    eventType: "updated_note",
    eventId: buildEventId(page.id, lastModified),
    occurredAt: lastModified,
    accountId,
    payload: {
      changeKind: "updated",
      pageId: page.id,
      title: page.title ?? null,
      webUrl: page.links?.oneNoteWebUrl?.href ?? null,
      contentUrl: page.contentUrl ?? null,
      notebookId,
      notebookName: page.parentNotebook?.displayName ?? null,
      sectionId,
      sectionName: page.parentSection?.displayName ?? null,
      createdDateTime: page.createdDateTime ?? null,
      lastModifiedDateTime: lastModified,
    },
  };
}
