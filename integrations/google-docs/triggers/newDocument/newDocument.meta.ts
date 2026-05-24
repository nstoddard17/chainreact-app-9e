import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `google-docs:new_document` —
 * Slice 3.GDOCS-5.
 *
 * Webhook-activated push trigger. Activation creates a Drive
 * `files.watch` channel on the user's whole drive (or the configured
 * folder), captures a baseline `startPageToken`, and seeds the
 * trigger_resources row tagged with `type: "subscription-watch"` so
 * the existing renewal cron picks it up. Filtering to Google Docs
 * mimeType + `created` change-kind happens in `normalize.ts` — the
 * Drive watch can't pre-filter by mimeType, so the trigger pays the
 * post-fetch filter cost.
 *
 * Activation registry — registered in
 * `integrations/google-docs/triggers/newDocument/index.ts` via
 * `registerActivation("google-docs", "new_document", activate)`. The
 * trigger-meta-activation-invariant test is satisfied without an
 * exemption.
 *
 * Payload sensitive flags per GDOCS-1 §5 + slice spec:
 *   - `title` sensitive (document titles often carry project /
 *     customer identifiers).
 *   - `documentUrl` sensitive (canonical edit URL).
 *   - `createdBy` sensitive (email address — PII).
 *   - `documentId`, `folderId`, `mimeType`, `changeKind` non-sensitive
 *     (opaque ids / structural flags).
 *   - `createdAt` non-sensitive (timestamp).
 */
export const googleDocsNewDocumentTriggerMeta: TriggerMeta = {
  key: "google-docs:new_document",
  provider: "google-docs",
  type: "new_document",
  displayName: "New Document",
  description:
    "Fires when a new Google Doc appears in your Drive (or in a specific folder, if scoped). Backed by Drive's `files.watch` push channel filtered to the Google Docs mimeType — the trigger only emits events whose `createdTime === modifiedTime` (Drive's signal for a fresh insert). When `folderId` is set, only documents in that folder surface; otherwise the whole drive is watched. Each trigger node owns its own channel; multiple workflows on the same scope coexist.",
  category: "files",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "folderId",
      label: "Folder",
      description:
        "Optional. Scope the trigger to a specific Drive folder — only Google Docs created directly inside this folder surface. Leave unset to watch the entire connected Drive.",
      type: "combobox",
      optionsSource: "google-drive:folders",
      required: false,
      placeholder: "Search folders…",
    },
  ],
  payloadShape: [
    {
      name: "documentId",
      type: "string",
      description:
        "Google-assigned document id (`1aBc…`). Wire to downstream Get Document / Update Document / Share Document / Export Document actions.",
    },
    {
      name: "title",
      type: "string",
      description: "Document title at creation time.",
      sensitive: true,
    },
    {
      name: "documentUrl",
      type: "string",
      description:
        "Canonical edit URL (`https://docs.google.com/document/d/<id>/edit`). Falls back to a constructed URL when Drive omits webViewLink.",
      sensitive: true,
    },
    {
      name: "folderId",
      type: "string",
      description:
        "Echoed folder scope (== config.folderId), or `null` when the trigger watches the whole drive.",
    },
    {
      name: "createdAt",
      type: "string",
      description: "ISO 8601 timestamp the document was created at (Drive's `createdTime`).",
    },
    {
      name: "createdBy",
      type: "string",
      description:
        "Email address of the document's first owner per Drive (`owners[0].emailAddress`). `null` when Drive omits owner info.",
      sensitive: true,
    },
    {
      name: "mimeType",
      type: "string",
      description: "Always `application/vnd.google-apps.document` — the trigger filters to Docs.",
    },
    {
      name: "changeKind",
      type: "string",
      description: "Always `\"created\"` — included for downstream parity with `document_updated`'s discriminated payload.",
    },
  ],
  displayOrder: 10,
};
