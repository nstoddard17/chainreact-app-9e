import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { DriveChangeEntry } from "@/integrations/google-drive/api/changesList";

/**
 * Convert a Drive change entry into a Google Docs
 * `document_updated` TriggerEvent — Slice 3.GDOCS-5.
 *
 * Filters applied in order:
 *   1. Drop drive-level changes (`changeType === "drive"`).
 *   2. Drop removed files + trashed files (those are "removed",
 *      not "updated").
 *   3. Drop files without a Docs mimeType
 *      (`application/vnd.google-apps.document`).
 *   4. Drop files whose `createdTime === modifiedTime` — Drive
 *      stamps both equal at insert. Updates produce
 *      `createdTime < modifiedTime`. The `new_document` trigger
 *      surfaces the inverse path.
 *   5. Drop files outside `context.documentId` (when set — narrowest
 *      filter, takes precedence).
 *   6. Drop files outside `context.folderId` (when set — applied
 *      when `documentId` is unset).
 *
 * Dedup key: `${fileId}:${modifiedTime ?? time}`. A genuine update
 * produces a fresh key; duplicate push deliveries for the same
 * modification collapse via dedup.
 */

const GOOGLE_DOCS_MIME_TYPE = "application/vnd.google-apps.document";

export interface NormalizeContext {
  providerAccountId: string;
  /** When set, only changes matching this fileId are emitted. */
  documentId?: string;
  /**
   * When set (and documentId is unset), only changes whose file has
   * this id in `parents` are emitted.
   */
  folderId?: string;
}

export function isUpdatedChange(change: DriveChangeEntry): boolean {
  if (change.removed === true) return false;
  if (change.file?.trashed === true) return false;
  const f = change.file as
    | { createdTime?: string; modifiedTime?: string }
    | undefined;
  if (!f?.createdTime || !f?.modifiedTime) return false;
  return f.createdTime !== f.modifiedTime;
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
        lastModifyingUser?: { emailAddress?: string };
        trashed?: boolean;
        version?: string | number;
      }
    | undefined;
  if (!file) return null;
  if (file.trashed === true) return null;
  if (file.mimeType !== GOOGLE_DOCS_MIME_TYPE) return null;
  if (!isUpdatedChange(change)) return null;

  // documentId filter takes precedence — when set, the trigger is
  // scoped to one document and folder filtering is irrelevant.
  if (context.documentId) {
    if (fileId !== context.documentId) return null;
  } else if (context.folderId) {
    const parents = (file.parents ?? []) as ReadonlyArray<string>;
    if (!parents.includes(context.folderId)) return null;
  }

  const updatedAt =
    file.modifiedTime ?? change.time ?? new Date().toISOString();
  const eventId = `${fileId}:${updatedAt}`;

  const documentUrl =
    file.webViewLink ?? `https://docs.google.com/document/d/${fileId}/edit`;

  // updatedBy: Drive's `lastModifyingUser.emailAddress` when present.
  // Like createdBy on `new_document`, this requires an explicit fields
  // mask on changes.list — pull.ts requests it.
  const updatedBy = file.lastModifyingUser?.emailAddress ?? null;

  // Drive's `version` doubles as a coarse revision marker on file
  // changes. Docs' own `revisionId` requires a separate documents.get
  // call; meta + handler description tell authors to chain
  // get_document when a true revisionId is needed.
  const revisionId =
    file.version !== undefined && file.version !== null
      ? String(file.version)
      : null;

  return {
    provider: "google-docs",
    eventType: "document_updated",
    eventId,
    occurredAt: updatedAt,
    providerAccountId: context.providerAccountId,
    payload: {
      documentId: fileId,
      title: file.name ?? null,
      documentUrl,
      folderId: context.folderId ?? null,
      updatedAt,
      updatedBy,
      revisionId,
      mimeType: GOOGLE_DOCS_MIME_TYPE,
      changeKind: "updated" as const,
    },
  };
}
