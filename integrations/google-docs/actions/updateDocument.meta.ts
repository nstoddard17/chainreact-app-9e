import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-docs:update_document` —
 * Slice 3.GDOCS-4.
 *
 * Mirrors `updateDocument.schema.ts` (4 fields):
 *   - `documentId`     REQUIRED — document to update. Wires
 *     `google-docs:documents` (Slice 3.GDOCS-3).
 *   - `content`        REQUIRED — text to insert.
 *   - `insertLocation` REQUIRED enum — 5 modes (`end`, `beginning`,
 *     `replace`, `after_text`, `before_text`). Schema has no
 *     `.default()`; the meta mirrors that — the author chooses
 *     explicitly per the Q11 honest-state pattern (no silent default).
 *   - `searchText`     OPTIONAL — required at runtime when
 *     `insertLocation ∈ {"after_text", "before_text"}` (schema enforces
 *     via `.superRefine`). Documented as conditional in the field
 *     description; the contract doesn't surface conditional visibility
 *     to the renderer today, so the field is unconditionally visible
 *     and the description warns when it's needed.
 *
 * **`replace` mode wipes the existing body before inserting the new
 * content.** Recovery is via Docs' built-in version history (File →
 * Version history) — NOT through ChainReact. The risk classification
 * stays at `medium` per GDOCS-1 §9 D-GD4 because:
 *   - Replace is reversible by the document owner via Docs UI;
 *   - The V1 surface ships this as a single action mode (not a separate
 *     destructive primitive) and conservative classification would
 *     require splitting modes which the runtime doesn't support;
 *   - The description carries an explicit warning.
 *
 * Wildcard `*` is preserved for `after_text` / `before_text` per V1
 * runtime (maps to regex `.*`). Authors who paste a literal `*` get
 * regex wildcard behavior; if they actually want to match the asterisk
 * character they must escape it. Documented in the field description.
 *
 * Sensitive outputs:
 *   - `documentUrl` — flagged sensitive (same rationale as
 *     `create_document.documentUrl`).
 *   - `title` — flagged sensitive per slice spec (titles often carry
 *     project / customer identifiers).
 *   - `documentId` / `updatedAt` / `revisionId` / `contentLength` /
 *     `insertionLocation` — opaque ids / structural counters /
 *     timestamps; not sensitive.
 *   - The output intentionally does NOT include the inserted body
 *     content (`contentLength` is the only signal). If V2 ever surfaces
 *     the body it MUST be flagged sensitive (`content` is in the
 *     structural suspicious-name set).
 */
export const googleDocsUpdateDocumentMeta: ActionMeta = {
  key: "google-docs:update_document",
  provider: "google-docs",
  type: "update_document",
  displayName: "Update Document",
  description:
    "Insert or replace content in an existing Google Doc via documents.batchUpdate. Supports 5 insertion modes (end, beginning, replace, after_text, before_text). **`replace` mode wipes the existing body content before inserting** — recovery is via Docs' Version history (File → Version history), not through ChainReact. `after_text` / `before_text` find the last match of `searchText` (with wildcard `*` mapping to regex `.*`) and insert relative to it.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "documentId",
      label: "Document",
      description:
        "Google Doc to update. Picker lists docs in the connected account, sorted by most recently modified.",
      type: "combobox",
      optionsSource: "google-docs:documents",
      required: true,
      placeholder: "Search documents…",
    },
    {
      name: "content",
      label: "Content",
      description:
        "Text to insert. Variables resolve at runtime — interpolate upstream node outputs with `{{nodeId.field}}` syntax. For `replace` mode, this REPLACES the entire body (existing content is wiped before insertion).",
      type: "textarea",
      required: true,
      placeholder: "New content…",
    },
    {
      name: "insertLocation",
      label: "Insert location",
      description:
        "Where to insert the content. `end` appends; `beginning` inserts at the top (right after BODY_START); `replace` wipes the existing body and inserts (irreversible via API — recover via Docs Version history); `after_text` / `before_text` find the last match of `searchText` and insert relative to it. No default — author chooses explicitly.",
      type: "select",
      required: true,
      options: [
        { value: "end", label: "Append to end" },
        { value: "beginning", label: "Insert at beginning" },
        {
          value: "replace",
          label: "Replace entire body (irreversible via API)",
        },
        { value: "after_text", label: "Insert after matching text" },
        { value: "before_text", label: "Insert before matching text" },
      ],
    },
    {
      name: "searchText",
      label: "Search text",
      description:
        "REQUIRED when `insertLocation` is `after_text` or `before_text` — ignored for `end` / `beginning` / `replace`. The handler finds the LAST match in the document body. Supports wildcard `*` (maps to regex `.*` — paste a literal `*` if you want regex-wildcard behavior; otherwise the text is matched literally).",
      type: "text",
      required: false,
      placeholder: "Last edited:",
    },
  ],
  outputs: [
    {
      name: "documentId",
      type: "string",
      description: "Echoed document id (== input.documentId).",
    },
    {
      name: "documentUrl",
      type: "string",
      description:
        "Canonical edit URL (`https://docs.google.com/document/d/<id>/edit`). Not access-bearing — recipients still need Google sign-in + share permission.",
      sensitive: true,
    },
    {
      name: "title",
      type: "string",
      description:
        "Document title at the time of update. Falls through to `null` when batchUpdate doesn't return it (compose with Get Document downstream if you need the title).",
      sensitive: true,
    },
    {
      name: "updatedAt",
      type: "string",
      description: "ISO 8601 timestamp the update completed at.",
    },
    {
      name: "revisionId",
      type: "string",
      description:
        "Best-effort revision id from batchUpdate's writeControl response. `null` when Docs didn't return one (common — compose with Get Document if you need a concrete revisionId).",
    },
    {
      name: "contentLength",
      type: "number",
      description:
        "Character count of the inserted content (== input.content.length). The body content itself is NOT surfaced on output — chain Get Document if you need the resulting body.",
    },
    {
      name: "insertionLocation",
      type: "string",
      description: "Echoed insertion mode (== input.insertLocation).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Mutates an existing Google Doc. `replace` mode wipes the body before inserting — recoverable only via Docs Version history (File → Version history), not through ChainReact.",
};
