import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { DropboxEntry } from "@/integrations/_shared/dropbox/api/_types";

/**
 * Normalize a Dropbox `list_folder/continue` file entry into the canonical
 * `TriggerEvent` for `dropbox:new_file` — Slice 3.DROPBOX-5.
 *
 * Works from the RAW Dropbox entry (not `normalizeDropboxEntry`) because
 * the trigger payload surfaces `pathLower` + `isDownloadable`, which the
 * action-side normalizer doesn't expose — keeping the trigger
 * self-contained avoids touching DROPBOX-2 shared code.
 *
 * Bytes / content / download / shared / temporary links NEVER appear in
 * the payload (P-S3 contract + DROPBOX-1 §6).
 *
 * `eventId` is the stable file identity `new_file:{accountId}:{id}:{rev}`
 * (DROPBOX-1 §4). The reconciler uses a ROW-scoped dedup key for
 * `webhook_event_dedup` so two workflows watching the same folder don't
 * cross-suppress; this `eventId` is the file-identity carried on the event.
 */

/** Raw Dropbox file entry — `DropboxEntry` plus the trigger-only field. */
export type DropboxFileEntry = DropboxEntry & { is_downloadable?: boolean };

export function buildNewFileEventId(
  providerAccountId: string,
  entry: DropboxFileEntry,
): string {
  const id = entry.id ?? entry.path_lower ?? entry.path_display ?? "unknown";
  const rev = entry.rev ?? "";
  return `new_file:${providerAccountId}:${id}:${rev}`;
}

export function normalizeNewFile(input: {
  entry: DropboxFileEntry;
  providerAccountId: string;
}): TriggerEvent {
  const { entry, providerAccountId } = input;
  const path = entry.path_display ?? entry.path_lower ?? null;
  return {
    provider: "dropbox",
    eventType: "new_file",
    eventId: buildNewFileEventId(providerAccountId, entry),
    occurredAt: entry.server_modified ?? new Date().toISOString(),
    providerAccountId,
    payload: {
      changeKind: "new_file",
      id: entry.id ?? null,
      name: entry.name ?? null,
      path,
      pathLower: entry.path_lower ?? null,
      rev: entry.rev ?? null,
      sizeBytes: typeof entry.size === "number" ? entry.size : null,
      clientModified: entry.client_modified ?? null,
      serverModified: entry.server_modified ?? null,
      providerAccountId,
      isDownloadable:
        typeof entry.is_downloadable === "boolean"
          ? entry.is_downloadable
          : null,
    },
  };
}
