import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `google-docs:document_updated` —
 * Slice 3.GDOCS-5.
 *
 * Webhook-activated push trigger. Activation registers a Drive
 * `files.watch` channel; the watch target is the configured
 * `documentId` (per-file watch), `folderId` (per-folder watch), or
 * the literal `"root"` (whole-drive watch) — whichever is set in
 * descending precedence. `normalize` re-filters by `documentId` /
 * `folderId` post-fetch as defense in depth, since Drive's
 * `changes.list` returns the whole drive regardless of watch
 * scope.
 *
 * Activation registry — registered in
 * `integrations/google-docs/triggers/documentUpdated/index.ts` via
 * `registerActivation("google-docs", "document_updated", activate)`.
 * The trigger-meta-activation-invariant test is satisfied without
 * an exemption.
 *
 * Payload sensitive flags per GDOCS-1 §5 + slice spec:
 *   - `title` sensitive.
 *   - `documentUrl` sensitive.
 *   - `updatedBy` sensitive (email — PII).
 *   - `documentId` / `folderId` / `mimeType` / `changeKind` /
 *     `updatedAt` / `revisionId` non-sensitive (opaque ids /
 *     structural / timestamps; `revisionId` is Drive's coarse
 *     version counter).
 */
export const googleDocsDocumentUpdatedTriggerMeta: TriggerMeta = {
  key: "google-docs:document_updated",
  provider: "google-docs",
  type: "document_updated",
  displayName: "Document Updated",
  description:
    "Fires when an existing Google Doc changes in the watched scope. Backed by Drive's `files.watch` push channel filtered to the Google Docs mimeType — only files whose `createdTime < modifiedTime` (Drive's signal for a post-insert edit) surface; brand-new documents go to the `New Document` trigger instead. When `documentId` is set, the trigger scopes to one specific doc (per-file watch). When `folderId` is set (and documentId is unset), the trigger scopes to that folder. Both unset → whole-drive watch. The emitted `revisionId` is Drive's coarse version counter — chain Get Document if you need the precise Docs revision id.",
  category: "files",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "documentId",
      label: "Document",
      description:
        "Optional. Scope the trigger to a specific Google Doc — narrowest filter. When set, the Drive watch is registered against this fileId directly. Picker lists Docs in the connected account.",
      type: "combobox",
      optionsSource: "google-docs:documents",
      required: false,
      placeholder: "Search documents…",
    },
    {
      name: "folderId",
      label: "Folder",
      description:
        "Optional. Scope the trigger to Docs inside this folder. Ignored when `documentId` is set. Leave both unset to watch the entire connected Drive.",
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
      description: "Google-assigned document id. Wire to downstream Get / Update / Share / Export actions.",
    },
    {
      name: "title",
      type: "string",
      description: "Document title at change time.",
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
      description: "Echoed folder scope (== config.folderId), or `null` when watching the whole drive / a specific document.",
    },
    {
      name: "updatedAt",
      type: "string",
      description: "ISO 8601 timestamp the document was last modified (Drive's `modifiedTime`).",
    },
    {
      name: "updatedBy",
      type: "string",
      description:
        "Email address of the user who made the change (Drive's `lastModifyingUser.emailAddress`). `null` when Drive omits it.",
      sensitive: true,
    },
    {
      name: "revisionId",
      type: "string",
      description:
        "Drive's coarse `version` counter as a string. NOT the same as Docs' own `revisionId` — chain `Get Document` if you need a true Docs revision id for optimistic-concurrency writes.",
    },
    {
      name: "mimeType",
      type: "string",
      description: "Always `application/vnd.google-apps.document` — the trigger filters to Docs.",
    },
    {
      name: "changeKind",
      type: "string",
      description: "Always `\"updated\"` — included for downstream parity with `new_document`'s discriminated payload.",
    },
  ],
  displayOrder: 20,
};
