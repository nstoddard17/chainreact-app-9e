import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-docs:get_document` —
 * Slice 3.GDOCS-4.
 *
 * Mirrors `getDocument.schema.ts` (1 field). Pure read.
 *
 * Risk: low. Read-only call against `documents.get`; no provider-side
 * mutation. Not destructive; no confirmation.
 *
 * Sensitive outputs:
 *   - `content` — the flattened document body text. Marked sensitive
 *     (`content` is in the structural suspicious-name set; documents
 *     routinely carry PII / proprietary text).
 *   - `title` — flagged sensitive per slice spec; titles often carry
 *     project / customer identifiers.
 *   - `documentUrl` — flagged sensitive per slice spec.
 *   - `documentId` / `revisionId` — opaque ids, non-sensitive.
 */
export const googleDocsGetDocumentMeta: ActionMeta = {
  key: "google-docs:get_document",
  provider: "google-docs",
  type: "get_document",
  displayName: "Get Document",
  description:
    "Read a Google Doc's title, flattened body text, and current revision id via `documents.get`. Pure read — no provider-side mutation. Body text is flattened from Docs' structural tree (paragraph / table / sectionBreak / etc.) into plain text.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "documentId",
      label: "Document",
      description:
        "Google Doc to read. Picker lists docs in the connected account, sorted by most recently modified.",
      type: "combobox",
      optionsSource: "google-docs:documents",
      required: true,
      placeholder: "Search documents…",
    },
  ],
  outputs: [
    {
      name: "documentId",
      type: "string",
      description: "Echoed document id (== input.documentId).",
    },
    {
      name: "title",
      type: "string",
      description:
        "Document title at read time. `null` when Docs omits it (unusual; defensive against API drift).",
      sensitive: true,
    },
    {
      name: "content",
      type: "string",
      description:
        "Flattened plain-text body. Walks Docs' `body.content[]` structural tree (paragraphs, tables, section breaks) and concatenates `textRun.content` per Docs' extraction strategy. Formatting / links / inline objects do NOT round-trip — this is text only. Pass through `format_transformer` if you need a specific shape.",
      sensitive: true,
    },
    {
      name: "revisionId",
      type: "string",
      description:
        "Docs revision id at read time. `null` when Docs omits it. Wire to a downstream `update_document` (future feature) for optimistic-concurrency writes.",
    },
    {
      name: "documentUrl",
      type: "string",
      description:
        "Canonical edit URL (`https://docs.google.com/document/d/<id>/edit`). Not access-bearing — recipients still need Google sign-in + share permission.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
