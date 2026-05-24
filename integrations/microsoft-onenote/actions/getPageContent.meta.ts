import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:get_page_content` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `getPageContent.schema.ts`:
 *   - `notebookId`   OPTIONAL UI scope-narrower (handler ignores) —
 *                    parent of the sections picker.
 *   - `sectionId`    OPTIONAL UI scope-narrower (handler ignores) —
 *                    parent of the pages picker.
 *   - `pageId`       REQUIRED — page to read. Combobox via
 *                    `microsoft-onenote:pages` (depends on `sectionId`).
 *   - `includeIDs`   boolean — Graph adds `data-id` attributes to the
 *                    returned HTML. **Load-bearing when chaining into
 *                    `update_page` with `updateMode: "insert"`** —
 *                    the `target` field accepts those `data-id`
 *                    values. Schema default: `false`.
 *   - `preGenerated` boolean — Graph performance hint (`preAuthenticated`
 *                    pre-rendered HTML cache). Schema default: `true`.
 *
 * Risk: `low`. Pure read; no mutation of provider state.
 *
 * Sensitive outputs:
 *   - `content`  — the page body HTML. Bulk PII collection by design;
 *                  also matches the structural suspicious-name guard
 *                  (`content` is in the SUSPICIOUS_NAMES set at
 *                  tests/structure/sensitive-output-coverage.test.ts).
 *   - `title`    — pages carry project / customer identifiers.
 *   - `contentUrl` / `webUrl` — see `create_page` rationale.
 *   - `id` / `createdDateTime` / `lastModifiedDateTime` / `level` —
 *     opaque / structural; not sensitive.
 */
export const microsoftOneNoteGetPageContentMeta: ActionMeta = {
  key: "microsoft-onenote:get_page_content",
  provider: "microsoft-onenote",
  type: "get_page_content",
  displayName: "Get Page Content",
  description:
    "Fetch a OneNote page's HTML body via Graph `GET /me/onenote/pages/{id}/content`. Set `includeIDs: true` when chaining into `update_page` with `updateMode: \"insert\"` — Graph then embeds `data-id` attributes the insert target field accepts. `preGenerated: true` (default) lets Graph serve a cached HTML representation; flip to `false` only when you suspect stale content.",
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
        "Pick a page to fetch the body of. Most-recently-modified first inside the chosen section.",
      type: "combobox",
      optionsSource: "microsoft-onenote:pages",
      dependsOn: "sectionId",
      required: true,
      placeholder: "Select Section first",
    },
    {
      name: "includeIDs",
      label: "Include element IDs",
      description:
        "When enabled, Graph embeds `data-id` attributes in the returned HTML — load-bearing when chaining into Update Page with mode `insert` (the `target` field accepts those `data-id` values).",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
    {
      name: "preGenerated",
      label: "Use cached HTML",
      description:
        "Graph performance hint — when enabled (default), Graph may return a cached HTML representation. Flip to `false` only when you need fresh content and accept the latency cost.",
      type: "boolean",
      required: false,
      defaultValue: true,
    },
  ],
  outputs: [
    {
      name: "id",
      type: "string",
      description: "Page id (echoed from input.pageId).",
    },
    {
      name: "title",
      type: "string",
      description: "Page title (null if Graph didn't return one).",
      sensitive: true,
    },
    {
      name: "content",
      type: "string",
      description:
        "Full page body HTML. When `includeIDs: true`, contains `data-id` attributes usable by Update Page's `insert` mode.",
      sensitive: true,
    },
    {
      name: "contentUrl",
      type: "string",
      description:
        "Graph content endpoint URL (== the URL that was just fetched). Requires the bearer token.",
      sensitive: true,
    },
    {
      name: "webUrl",
      type: "string",
      description: "Canonical OneNote web URL for the page.",
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
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
