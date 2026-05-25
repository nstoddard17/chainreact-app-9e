import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { DriveChangeEntry } from "@/integrations/google-drive/api/changesList";

/**
 * Convert a Drive change entry into a Google Docs `new_document`
 * TriggerEvent — Slice 3.GDOCS-5.
 *
 * Filters applied in order:
 *   1. Drop drive-level changes (`changeType === "drive"`) — those
 *      describe Shared Drive changes, not files.
 *   2. Drop removed files (the document is gone; not a "new" event).
 *   3. Drop files without a Docs mimeType
 *      (`application/vnd.google-apps.document`). The Drive watch
 *      can't pre-filter by mimeType; we filter post-fetch.
 *   4. Drop files whose `createdTime !== modifiedTime` — Drive stamps
 *      both equal at insert; subsequent edits bump only modifiedTime.
 *      The `document_updated` trigger surfaces the inverse path.
 *   5. Drop files outside the configured folder (when `folderId` set
 *      — same pattern as `google-drive:file_changed`).
 *
 * Dedup key (`(provider, eventId)` for `webhook_event_dedup`):
 * `${fileId}:${createdTime ?? time}`. A genuine new document produces
 * a fresh key; duplicate push notifications for the same insert
 * collapse via dedup.
 */

const GOOGLE_DOCS_MIME_TYPE = "application/vnd.google-apps.document";

export interface NormalizeContext {
  accountId: string;
  /**
   * When set, only documents whose file has this id in `parents` are
   * emitted. Drive's `changes.list` returns the whole drive; this
   * narrows to the configured folder.
   */
  folderId?: string;
}

export function isCreatedChange(change: DriveChangeEntry): boolean {
  if (change.removed === true) return false;
  if (change.file?.trashed === true) return false;
  const f = change.file as
    | { createdTime?: string; modifiedTime?: string }
    | undefined;
  if (!f?.createdTime || !f?.modifiedTime) return false;
  return f.createdTime === f.modifiedTime;
}

export function normalize(
  change: DriveChangeEntry,
  context: NormalizeContext,
): TriggerEvent | null {
  if (change.changeType === "drive") return null;
  const fileId = change.fileId;
  if (!fileId) return null;
  if (change.removed === true) return null;

  const file = change.file as
    | {
        mimeType?: string;
        name?: string;
        parents?: ReadonlyArray<string>;
        createdTime?: string;
        modifiedTime?: string;
        webViewLink?: string;
        owners?: ReadonlyArray<{ emailAddress?: string }>;
        trashed?: boolean;
      }
    | undefined;
  if (!file) return null;
  if (file.trashed === true) return null;
  if (file.mimeType !== GOOGLE_DOCS_MIME_TYPE) return null;
  if (!isCreatedChange(change)) return null;

  if (context.folderId) {
    const parents = (file.parents ?? []) as ReadonlyArray<string>;
    if (!parents.includes(context.folderId)) return null;
  }

  const createdAt = file.createdTime ?? change.time ?? new Date().toISOString();
  const eventId = `${fileId}:${createdAt}`;

  // documentUrl: construct the canonical edit URL when Drive doesn't
  // return webViewLink (defensive — webViewLink is in the standard
  // fields mask but mock servers / partial responses may omit it).
  const documentUrl =
    file.webViewLink ?? `https://docs.google.com/document/d/${fileId}/edit`;

  // createdBy: first owner's email if Drive returns it. Drive includes
  // owners only when the fields mask requests it; the trigger pull
  // requests `owners(emailAddress)` for this reason.
  const createdBy = file.owners?.[0]?.emailAddress ?? null;

  return {
    provider: "google-docs",
    eventType: "new_document",
    eventId,
    occurredAt: createdAt,
    accountId: context.accountId,
    payload: {
      documentId: fileId,
      title: file.name ?? null,
      documentUrl,
      folderId: context.folderId ?? null,
      createdAt,
      createdBy,
      mimeType: GOOGLE_DOCS_MIME_TYPE,
      changeKind: "created" as const,
    },
  };
}
