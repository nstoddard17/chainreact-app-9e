import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { DriveChangeEntry } from "../../api/changesList";

/**
 * Convert a Drive change entry into the canonical V2 TriggerEvent shape.
 *
 * Slice 4 single-trigger model — one `file_changed` trigger emits all
 * change kinds. Workflow authors filter downstream on `payload.changeKind`
 * and `payload.objectKind`. (See docs/slices/slice-4-google-drive.md
 * §"Out of scope" — splitting back into separate trigger types is a
 * deliberate non-goal.)
 *
 * Change-kind classification:
 *   - `removed` when `change.removed === true` OR `change.file.trashed`.
 *   - `created` when the file's `createdTime === modifiedTime` (Drive
 *     stamps both equal at insert; subsequent edits only bump
 *     `modifiedTime`). Drive doesn't carry the createdTime for non-file
 *     changes (drive-level changeType), so we fall back to "updated".
 *   - `updated` otherwise.
 *
 * Object-kind classification:
 *   - `folder` when `mimeType === "application/vnd.google-apps.folder"`.
 *   - `file` otherwise (including Google Docs, Sheets, etc. — they're
 *     "files" in Drive's model).
 *
 * Folder filtering: when `context.folderId` is set, drop changes whose
 * file is NOT a direct child of that folder. Drive's `changes.list`
 * returns the user's WHOLE drive; the trigger config opts the user out
 * of broader chatter. Returns `null` for filtered-out changes.
 *
 * Dedup key (`(provider, eventId)` for `webhook_event_dedup`): combine
 * Drive's fileId with `change.time` so a true new change (different
 * timestamp) produces a fresh dedup key while a duplicate push
 * notification for the same change re-uses it. Mirrors Calendar's
 * `${eventId}:${updated}` pattern.
 */

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export type ChangeKind = "created" | "updated" | "removed";
export type ObjectKind = "file" | "folder";

export interface NormalizeContext {
  providerAccountId: string;
  /** When set, only changes whose file has this id in `parents` are emitted. */
  folderId?: string;
}

export function classifyChangeKind(change: DriveChangeEntry): ChangeKind {
  if (change.removed === true) return "removed";
  if (change.file?.trashed === true) return "removed";
  const f = change.file as
    | { createdTime?: string; modifiedTime?: string }
    | undefined;
  if (f?.createdTime && f?.modifiedTime && f.createdTime === f.modifiedTime) {
    return "created";
  }
  return "updated";
}

export function classifyObjectKind(change: DriveChangeEntry): ObjectKind {
  return change.file?.mimeType === FOLDER_MIME_TYPE ? "folder" : "file";
}

export function normalize(
  change: DriveChangeEntry,
  context: NormalizeContext,
): TriggerEvent | null {
  // Drop drive-level changes (changeType === "drive") — those describe
  // changes to the Shared Drive itself, not files. Slice 4 Batch 1
  // intentionally focuses on file/folder events.
  if (change.changeType === "drive") return null;

  const fileId = change.fileId;
  if (!fileId) return null;

  // Folder filter — when configured, drop changes whose file's parents
  // don't include the configured folder. `change.removed === true` means
  // the file resource is omitted; we can't filter by parents, so drop
  // those too rather than leak deletion noise from outside the folder.
  if (context.folderId) {
    const parents = (change.file?.parents ?? []) as ReadonlyArray<string>;
    if (!parents.includes(context.folderId)) return null;
  }

  const changeKind = classifyChangeKind(change);
  const objectKind = classifyObjectKind(change);
  const occurredAt = change.time ?? new Date().toISOString();
  // Combine fileId + change.time so a real new change produces a fresh
  // dedup key, and duplicate push deliveries for the same change collapse
  // via dedup.
  const eventId = `${fileId}:${occurredAt}`;

  return {
    provider: "google-drive",
    eventType: "file_changed",
    eventId,
    occurredAt,
    providerAccountId: context.providerAccountId,
    payload: {
      changeKind,
      objectKind,
      fileId,
      name: change.file?.name ?? null,
      mimeType: change.file?.mimeType ?? null,
      parents: (change.file?.parents ?? []) as ReadonlyArray<string>,
      webViewLink: (change.file as { webViewLink?: string } | undefined)
        ?.webViewLink ?? null,
      modifiedTime: (change.file as { modifiedTime?: string } | undefined)
        ?.modifiedTime ?? null,
      trashed: change.file?.trashed ?? false,
      removed: change.removed ?? false,
    },
  };
}
