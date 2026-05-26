import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder metadata for `google-drive:file_changed` — Slice 4.GDRIVE-META-2.
 *
 * Watch-based Google Drive push trigger (`files.watch` channel → Drive
 * Changes API → `/api/webhooks/google-drive`, `changes.list?pageToken=…`
 * delta, ~24h renewal; 410 Gone → re-baseline). Activation is registered
 * in `triggers/fileChanged/index.ts` via
 * `registerActivation("google-drive","file_changed",…)` (loaded by
 * `integrations/_registry.ts`), so the trigger-meta-activation-invariant
 * passes with no exemption.
 *
 * Two folder-shaped config fields with distinct runtime meanings —
 * runtime owns the names, the meta preserves them:
 *   - `fileId` (default "root") — the WATCH TARGET. Drive subscribes to
 *     changes on this folder. Default "root" watches the user's entire
 *     Drive. Both fields share the `google-drive:folders` picker.
 *   - `folderId` (optional) — POST-FETCH FILTER. When set, the trigger
 *     only emits changes whose file is a DIRECT child of this folder.
 *     Independent of `fileId`.
 *
 * Payload mirrors `normalize.ts` (10 fields). No payload field is marked
 * sensitive in v1:
 *   - `name` is title-like (mirror Teams `subject` / GCal `summary` — not in
 *     the suspicious set, not marked). Marcus decision: revisit if product /
 *     security review later treats file names as PII.
 *   - `webViewLink` is the auth-gated Drive UI deeplink (not a signed URL —
 *     mirror OneDrive `webUrl` / GCal `htmlLink`).
 *   - Ids / mimeType / parents / dates / `trashed` / `removed` / `changeKind`
 *     / `objectKind` are structural.
 */
export const googleDriveFileChangedTriggerMeta: TriggerMeta = {
  key: "google-drive:file_changed",
  provider: "google-drive",
  type: "file_changed",
  displayName: "File Changed",
  description:
    "Fires when a file or folder is created, updated, or removed inside the watched folder (or anywhere in your Drive when the default watch target is used).",
  category: "files",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "fileId",
      label: "Folder To Watch",
      description:
        'The folder Drive subscribes to. Leave empty to watch your entire Drive (stored as the literal "root"). To watch a specific folder, pick one — the trigger then fires on changes inside that folder and its descendants per Drive\'s push model.',
      type: "combobox",
      required: false,
      defaultValue: "root",
      optionsSource: "google-drive:folders",
      placeholder: 'Entire Drive (root) — or pick a folder',
    },
    {
      name: "folderId",
      label: "Restrict To Folder (Optional)",
      description:
        "Optional post-fetch filter. When set, the trigger only emits changes whose file is a DIRECT child of this folder. Independent of Folder To Watch — useful when you watch the whole Drive but only care about one folder's children.",
      type: "combobox",
      required: false,
      optionsSource: "google-drive:folders",
      placeholder: "No filter (emit all changes from the watch target)",
    },
  ],
  payloadShape: [
    {
      name: "changeKind",
      type: "string",
      description: "What changed: created | updated | removed.",
    },
    {
      name: "objectKind",
      type: "string",
      description: 'What kind of object: "file" or "folder".',
    },
    { name: "fileId", type: "string", description: "The changed file's id." },
    { name: "name", type: "string", description: "The file's name (or null)." },
    { name: "mimeType", type: "string", description: "The file's MIME type (or null)." },
    {
      name: "parents",
      type: "array",
      description: "Parent folder ids of the file at change time.",
    },
    { name: "webViewLink", type: "string", description: "Drive UI link to the file (or null)." },
    { name: "modifiedTime", type: "string", description: "ISO-8601 last-modified timestamp (or null)." },
    { name: "trashed", type: "boolean", description: "True if the file is in Drive trash." },
    { name: "removed", type: "boolean", description: "True if Drive reported the file as removed." },
  ],
  displayOrder: 10,
};
