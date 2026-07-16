import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:update_page` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `updatePage.schema.ts`:
 *   - `notebookId` OPTIONAL UI scope-narrower (handler ignores) —
 *     parent of the sections picker.
 *   - `sectionId`  OPTIONAL UI scope-narrower (handler ignores) —
 *     parent of the pages picker.
 *   - `pageId`     REQUIRED — page to update. Combobox via
 *                  `microsoft-onenote:pages` (depends on `sectionId`).
 *   - `updateMode` enum — `append` / `prepend` / `replace` / `insert`.
 *                  Defaults to `append` (schema + meta agree). **Replace
 *                  wipes the body content** before inserting; OneNote's
 *                  per-page version history is the recovery mechanism
 *                  (NOT through ChainReact). Mirrors the
 *                  `google-docs:update_document.replace` rationale.
 *   - `content`    REQUIRED — HTML fragment (caller owns markup;
 *                  Graph parses with the HTML5 parser).
 *   - `target`     REQUIRED-WHEN-VISIBLE — runtime requires it when
 *                  `updateMode === "insert"` (schema enforces via
 *                  `.superRefine`). CSS selector or `data-id` value.
 *                  Gated by `visibleWhen: updateMode ∈ {insert}`
 *                  (CONFIG-UX-SETUP-ADVANCED-1 required-when-visible
 *                  semantics — hidden ⇒ not a readiness gap).
 *   - `position`   enum — `after` / `before` / `inside`. Only used
 *                  when `updateMode === "insert"`; same `visibleWhen`
 *                  gate. Schema default `after`.
 *
 * Risk: `medium`. Mutates existing OneNote content. `replace` mode is
 * recoverable via OneNote's per-page version history (right-click the
 * page → Page Versions). Not destructive; no confirmation. Same
 * rationale as `google-docs:update_document`.
 *
 * Sensitive outputs:
 *   - `title` / `webUrl` / `contentUrl` — same rationale as
 *     `create_page`.
 *   - `id` / `lastModifiedDateTime` / `success` / `updateMode` —
 *     opaque ids / timestamps / structural; not sensitive.
 */
export const microsoftOneNoteUpdatePageMeta: ActionMeta = {
  key: "microsoft-onenote:update_page",
  provider: "microsoft-onenote",
  type: "update_page",
  displayName: "Update Page",
  description:
    "Modify an existing OneNote page via Graph `PATCH /me/onenote/pages/{id}/content`. Supports 4 update modes: `append` (add to end), `prepend` (add to start), `replace` (wipe + insert — **recoverable via OneNote's per-page version history, NOT through ChainReact**), `insert` (insert relative to a CSS selector or `data-id` target — `target` becomes required). Microsoft Graph's update semantics differ from a full document editor: the operation is a server-side body mutation, not a real-time collaborative edit.",
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
        "Pick a section inside the chosen notebook. Required so the page picker can scope its results.",
      type: "combobox",
      optionsSource: "microsoft-onenote:sections",
      dependsOn: "notebookId",
      required: true,
      placeholder: "Select Notebook first",
    },
    {
      name: "pageId",
      label: "Page",
      description:
        "Pick a page inside the chosen section. Most-recently-modified first.",
      type: "combobox",
      optionsSource: "microsoft-onenote:pages",
      dependsOn: "sectionId",
      required: true,
      placeholder: "Select Section first",
    },
    {
      name: "updateMode",
      label: "Update mode",
      description:
        "Where your content goes: add to the end (append), the start (prepend), replace everything (old content only recoverable via OneNote's version history), or insert at a specific spot (set Insert target).",
      type: "select",
      required: true,
      defaultValue: "append",
      options: [
        { value: "append", label: "Append to end" },
        { value: "prepend", label: "Prepend to start" },
        {
          value: "replace",
          label: "Replace body (recoverable via OneNote version history)",
        },
        { value: "insert", label: "Insert at target" },
      ],
    },
    {
      name: "content",
      label: "Content",
      description:
        "The content to add or insert. HTML formatting is supported; variables from earlier steps resolve at runtime.",
      type: "textarea",
      required: true,
      placeholder: "<p>Updated content…</p>",
    },
    {
      name: "target",
      label: "Insert target",
      description:
        "Where on the page to insert: a CSS selector (e.g. div#summary) or a data-id value from an earlier Get Page Content step with Include element IDs turned on.",
      type: "text",
      required: true,
      visibleWhen: { field: "updateMode", valueIn: ["insert"] },
      placeholder: "#summary",
    },
    {
      name: "position",
      label: "Insert position",
      description: "Where the content lands relative to the Insert target.",
      type: "select",
      required: false,
      defaultValue: "after",
      visibleWhen: { field: "updateMode", valueIn: ["insert"] },
      options: [
        { value: "after", label: "After the target" },
        { value: "before", label: "Before the target" },
        { value: "inside", label: "Inside the target" },
      ],
    },
  ],
  outputs: [
    {
      name: "id",
      type: "string",
      description: "Page id that was updated (echoed from input.pageId).",
    },
    {
      name: "title",
      type: "string",
      description:
        "Page title from Graph's post-update read (null when Graph didn't return it).",
      sensitive: true,
    },
    {
      name: "contentUrl",
      type: "string",
      description:
        "Graph content endpoint for fetching the updated body. Requires the bearer token.",
      sensitive: true,
    },
    {
      name: "webUrl",
      type: "string",
      description:
        "Canonical OneNote web URL for the updated page.",
      sensitive: true,
    },
    {
      name: "lastModifiedDateTime",
      type: "string",
      description: "ISO 8601 timestamp of the update.",
    },
    {
      name: "success",
      type: "boolean",
      description:
        "Always `true` on a successful update — convenience scalar for branch-on-success.",
    },
    {
      name: "updateMode",
      type: "string",
      description: "Echoed update mode (== input.updateMode).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Mutates an existing OneNote page. `replace` mode wipes the body before inserting — recoverable only via OneNote's per-page version history (right-click page → Page Versions), NOT through ChainReact.",
};
