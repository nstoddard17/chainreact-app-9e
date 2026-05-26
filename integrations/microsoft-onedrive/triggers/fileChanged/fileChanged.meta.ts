import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder metadata for `microsoft-onedrive:file_changed` — Slice 4.ONEDRIVE-META-3.
 *
 * Whole-drive Microsoft Graph webhook (subscription on `/me/drive/root`,
 * `changeType:"updated"`, renewed before its ~70.5h expiry). Activation is
 * registered in `triggers/fileChanged/index.ts` via
 * `registerActivation("microsoft-onedrive","file_changed",…)` (loaded by
 * `integrations/_registry.ts`), so the trigger-meta-activation-invariant
 * passes with no exemption.
 *
 * **`fields: []`** — the subscription watches the entire drive; `activate`
 * reads no per-trigger config (there is no folder filter). A future runtime
 * slice could add folder scoping, at which point a `folderId` field →
 * `microsoft-onedrive:folders` lands here.
 *
 * Payload (one shape from `normalize.ts` / `normalizeDeleted`): the
 * `downloadUrl` (`@microsoft.graph.downloadUrl`, short-lived pre-signed URL)
 * is sensitive; ids / names / sizes / dates / kind / changeType / source /
 * parentReference are structural.
 */
export const microsoftOneDriveFileChangedTriggerMeta: TriggerMeta = {
  key: "microsoft-onedrive:file_changed",
  provider: "microsoft-onedrive",
  type: "file_changed",
  displayName: "File Changed",
  description:
    "Fires when any file or folder in your OneDrive is created, updated, or deleted. Branch on changeType / deleted; the changed item's id is in itemId.",
  category: "files",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    { name: "itemId", type: "string", description: "The changed DriveItem id." },
    {
      name: "kind",
      type: "string",
      description: '"file" / "folder" (null on deletes we couldn\'t fetch).',
    },
    { name: "changeType", type: "string", description: 'Graph change type ("updated").' },
    {
      name: "source",
      type: "string",
      description: '"id-fetch" or "delta-fallback" (which receive path produced this).',
    },
    { name: "name", type: "string", description: "Item name (null on deletes)." },
    { name: "size", type: "number", description: "Bytes (files)." },
    { name: "mimeType", type: "string", description: "MIME type (files)." },
    { name: "parentReference", type: "object", description: "Parent drive/folder reference." },
    { name: "webUrl", type: "string", description: "Item URL." },
    {
      name: "downloadUrl",
      type: "string",
      description: "Short-lived pre-signed download URL (files).",
      sensitive: true,
    },
    { name: "createdDateTime", type: "string", description: "ISO-8601 created." },
    { name: "lastModifiedDateTime", type: "string", description: "ISO-8601 modified." },
    { name: "deleted", type: "boolean", description: "True on a deleted-item event." },
  ],
  displayOrder: 10,
};
