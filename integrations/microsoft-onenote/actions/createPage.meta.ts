import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:create_page` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `createPage.schema.ts`:
 *   - `notebookId` OPTIONAL — UI scope-narrower for the section
 *     picker cascade. Handler ignores; the meta exposes it so the
 *     `microsoft-onenote:sections` resolver (requires `notebookId`)
 *     gets its parent dep. Builder cascade wiring sends
 *     `deps[<parent-field-name>]` so the field MUST be literally
 *     named `notebookId`.
 *   - `sectionId`  REQUIRED — page target. Combobox via
 *     `microsoft-onenote:sections` (depends on `notebookId`).
 *   - `title`      REQUIRED — page title.
 *   - `content`    OPTIONAL textarea — schema defaults to "" (empty
 *     body is valid). Description warns that markup is interpreted
 *     per `contentType`.
 *   - `contentType` REQUIRED enum — `text/html` / `text/plain` /
 *     `application/xhtml+xml`. Schema defaults to `text/html`
 *     (ONENOTE-1 D-ON1 — flipped from V1's `text/plain` per the
 *     recurring user-pain-point feedback in V1's
 *     `learning/docs/onenote-enhancement-summary.md`). The meta
 *     surfaces the same default so the builder pre-fills it.
 *
 * Risk: `medium`. Creates new external content; recoverable via
 * `delete_page`. Not destructive; no confirmation.
 *
 * Sensitive outputs (per slice spec):
 *   - `title`   — pages often carry project / customer identifiers
 *                 in their title.
 *   - `webUrl`  — canonical OneNote web URL; not access-bearing
 *                 (recipients still need OneNote sign-in + notebook
 *                 share) but the URL itself leaks the notebook /
 *                 section / page structure.
 *   - `contentUrl` — Graph content endpoint; reading it requires the
 *                    bearer token. Sensitive as an addressable
 *                    pointer to caller-supplied content.
 *   - `id` / `createdDateTime` / `lastModifiedDateTime` / `level` /
 *     `order` — opaque ids / timestamps / structural ints; not
 *     sensitive.
 */
export const microsoftOneNoteCreatePageMeta: ActionMeta = {
  key: "microsoft-onenote:create_page",
  provider: "microsoft-onenote",
  type: "create_page",
  displayName: "Create Page",
  description:
    "Create a new OneNote page in the chosen section. The page body is interpreted per `contentType` — `text/html` (V2-v1 default) accepts the full Graph HTML5 fragment grammar (headings, lists, embedded images via `<img src='...'>`, etc.); `text/plain` wraps in a `<pre>` block; `application/xhtml+xml` requires strict XHTML. The new page appears at the end of the section's page list.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "notebookId",
      label: "Notebook",
      description:
        "Pick a notebook from the connected account. Required so the section picker can scope its results.",
      type: "combobox",
      optionsSource: "microsoft-onenote:notebooks",
      required: true,
      placeholder: "Search notebooks…",
    },
    {
      name: "sectionId",
      label: "Section",
      description:
        "Pick a section inside the chosen notebook. Change the notebook and the section picker re-fetches.",
      type: "combobox",
      optionsSource: "microsoft-onenote:sections",
      dependsOn: "notebookId",
      required: true,
      placeholder: "Select Notebook first",
    },
    {
      name: "title",
      label: "Title",
      description:
        "Page title. Shown in the OneNote app's page list and in the rendered HTML's `<title>` element.",
      type: "text",
      required: true,
      placeholder: "Q4 Planning",
    },
    {
      name: "content",
      label: "Content",
      description:
        "Page body. Empty is valid (the page renders with just the title). Variables resolve at runtime — interpolate upstream node outputs with `{{nodeId.field}}` syntax. Markup is interpreted per `contentType`.",
      type: "textarea",
      required: false,
      placeholder: "<p>Body…</p>",
    },
    {
      name: "contentType",
      label: "Content type",
      description:
        "How the body markup is interpreted. `text/html` is the V2 default — accepts full HTML5 fragments; the OneNote app renders them inline. `text/plain` wraps the body in a `<pre>` block. `application/xhtml+xml` requires strict XHTML.",
      type: "select",
      required: true,
      defaultValue: "text/html",
      options: [
        { value: "text/html", label: "HTML (text/html — V2 default)" },
        { value: "text/plain", label: "Plain text (text/plain)" },
        {
          value: "application/xhtml+xml",
          label: "XHTML (application/xhtml+xml)",
        },
      ],
    },
  ],
  outputs: [
    {
      name: "id",
      type: "string",
      description: "New page id (Graph onenotePage id).",
    },
    {
      name: "title",
      type: "string",
      description:
        "Page title (echoed from input if Graph didn't return one).",
      sensitive: true,
    },
    {
      name: "contentUrl",
      type: "string",
      description:
        "Graph content endpoint for fetching the page body. Requires the bearer token; not directly shareable.",
      sensitive: true,
    },
    {
      name: "webUrl",
      type: "string",
      description:
        "Canonical OneNote web URL for the new page. Recipients still need OneNote sign-in + notebook share to open it.",
      sensitive: true,
    },
    {
      name: "createdDateTime",
      type: "string",
      description: "ISO 8601 timestamp the page was created.",
    },
    {
      name: "lastModifiedDateTime",
      type: "string",
      description: "ISO 8601 timestamp of the most recent modification.",
    },
    {
      name: "level",
      type: "number",
      description: "Page indentation level inside the section (0-based).",
    },
    {
      name: "order",
      type: "number",
      description: "Page ordinal position inside the section (0-based).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a new OneNote page in the chosen section. Recoverable by chaining `delete_page` downstream.",
};
