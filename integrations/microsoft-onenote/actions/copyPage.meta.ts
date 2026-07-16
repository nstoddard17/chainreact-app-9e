import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:copy_page` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `copyPage.schema.ts`:
 *   - `notebookId`      OPTIONAL UI scope-narrower (handler ignores)
 *                       — parent of the source sections picker.
 *   - `sectionId`       OPTIONAL UI scope-narrower (handler ignores)
 *                       — parent of the source pages picker.
 *   - `sourcePageId`    REQUIRED — page to copy. Combobox via
 *                       `microsoft-onenote:pages` (depends on
 *                       `sectionId`).
 *   - `targetSectionId` REQUIRED — destination section. **TEXT input,
 *                       not a picker** — see §"Dual-hierarchy picker
 *                       limitation" below.
 *
 * §Dual-hierarchy picker limitation
 *   The builder's cascade wiring keys on field NAME — it sends
 *   `deps[<parent-field-name>]` to the options route. Resolver
 *   `microsoft-onenote:sections` requires `notebookId` as its dep,
 *   so the parent field MUST be literally named `notebookId`. Field
 *   names within a single meta must be unique → we can have ONE
 *   source-side cascade or ONE target-side cascade, but not both.
 *   The source side wins (it provides the natural notebook → section
 *   → page narrowing for picking the page to copy); the target side
 *   uses a text input with a description that points authors at
 *   chaining a `list_sections` action and picking via the variable
 *   picker. Resolving this without runtime contortions requires either
 *   a `microsoft-onenote:sections_by_target_notebook` sibling
 *   resolver OR route-level renamable deps; both deferred to
 *   ONENOTE-N polish.
 *
 * §Asynchronous Graph operation
 *   Graph `POST /me/onenote/pages/{id}/copyToSection` returns
 *   HTTP 202 + `Operation-Location` header. The actual copy completes
 *   server-side. **ONENOTE-2 does NOT poll the operation** per
 *   ONENOTE-1 D-ON2; `success: true` means "Graph accepted the
 *   request" — NOT "copy complete." The new page id is observable
 *   only via polling that operation endpoint (deferred to ONENOTE-N
 *   polish) OR via the next polling cycle's `new_note` trigger
 *   (ONENOTE-5).
 *
 * Risk: `medium`. Creates a duplicate page in the target section;
 * recoverable by deleting the copy. Not destructive; no confirmation.
 *
 * Sensitive outputs:
 *   - `sourcePageId` / `targetSectionId` — echoed input, not
 *     sensitive (workflow author already supplied them).
 *   - `operationLocation` — Graph operation endpoint URL; requires
 *     the bearer token to poll. Not sensitive in itself (no
 *     access-bearing query string).
 *   - `success` — structural scalar; not sensitive.
 */
export const microsoftOneNoteCopyPageMeta: ActionMeta = {
  key: "microsoft-onenote:copy_page",
  provider: "microsoft-onenote",
  type: "copy_page",
  displayName: "Copy Page",
  description:
    "Copy a page into another section. The copy finishes on Microsoft's side shortly after this step succeeds — use the New Note trigger if a later step needs the new page.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "notebookId",
      label: "Source notebook",
      description:
        "Pick the notebook containing the page you want to copy. Scopes the source section picker.",
      type: "combobox",
      optionsSource: "microsoft-onenote:notebooks",
      required: true,
      placeholder: "Search notebooks…",
    },
    {
      name: "sectionId",
      label: "Source section",
      description:
        "Pick the section containing the page you want to copy. Scopes the source page picker.",
      type: "combobox",
      optionsSource: "microsoft-onenote:sections",
      dependsOn: "notebookId",
      required: true,
      placeholder: "Select Source notebook first",
    },
    {
      name: "sourcePageId",
      label: "Source page",
      description:
        "Pick the page to copy. Most-recently-modified first inside the chosen section.",
      type: "combobox",
      optionsSource: "microsoft-onenote:pages",
      dependsOn: "sectionId",
      required: true,
      placeholder: "Select Source section first",
    },
    {
      name: "targetSectionId",
      sensitivity: "recipient",
      label: "Target section id",
      description:
        "The section to copy the page into. Paste a section id, or add a List Sections step earlier and insert its id with the variable picker.",
      type: "text",
      required: true,
      placeholder: "0-ABCD1234…",
    },
  ],
  outputs: [
    {
      name: "operationLocation",
      type: "string",
      description:
        "Graph operation endpoint URL. Poll it (or chain `new_note` trigger downstream) to discover the new page id.",
    },
    {
      name: "sourcePageId",
      type: "string",
      description: "Echoed source page id (== input.sourcePageId).",
    },
    {
      name: "targetSectionId",
      type: "string",
      description: "Echoed target section id (== input.targetSectionId).",
    },
    {
      name: "success",
      type: "boolean",
      description:
        "Always `true` when Graph accepted the copy request — **NOT** a signal that the copy finished server-side. See `operationLocation` for completion polling.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Copies a page into another section. The Graph operation is asynchronous — `success: true` means 'request accepted', NOT 'copy complete'. The duplicate is recoverable by chaining `delete_page` once polling resolves the new page id.",
};
