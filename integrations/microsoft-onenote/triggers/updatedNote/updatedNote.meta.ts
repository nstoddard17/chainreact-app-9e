import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:updated_note` —
 * Slice 3.ONENOTE-5.
 *
 * **Polling-activated, section-scoped, with optional pageId filter.**
 * See `microsoft-onenote:new_note` meta + the trigger's poll.ts
 * header for the full architecture rationale (Graph deprecated OneNote
 * webhook subscriptions May 2023 — polling is the V2-native path).
 *
 * **Brand-new pages are excluded.** The poll handler filters out
 * pages where `createdDateTime === lastModifiedDateTime` so a freshly-
 * created page doesn't fire BOTH `new_note` AND `updated_note`. This
 * is a contract decision per the ONENOTE-5 slice spec; without it,
 * authors composing both triggers would see double-fires on every
 * new page.
 *
 * **Dedup by (pageId, lastModifiedDateTime) composite key** — so the
 * same page updated at T1 then again at T2 fires twice (one event
 * per real update), but a single update fetched across two poll ticks
 * (cursor regression / Graph stale read) only fires once. Distinct
 * from `new_note`'s `${pageId}:created` namespace so the two triggers
 * don't suppress each other.
 *
 * Optional `pageId` filter: when set, the trigger fires ONLY for
 * updates to that one page. When unset, fires for any update in the
 * section. Useful for workflows that watch a single living document.
 *
 * **No body / content in payload.** Chain
 * `microsoft-onenote:get_page_content` for the body.
 */
export const microsoftOneNoteUpdatedNoteTriggerMeta: TriggerMeta = {
  key: "microsoft-onenote:updated_note",
  provider: "microsoft-onenote",
  type: "updated_note",
  displayName: "Updated Note",
  description:
    "Fires when an existing page in the chosen OneNote section is updated. Polls every 5 minutes by default (Microsoft Graph deprecated OneNote webhook subscriptions in May 2023 — polling is the V2-native architecture). Brand-new pages do NOT fire this trigger (they fire `New Note` instead). Optionally filter to a single page to watch one document. Multiple updates of the same page over time each fire the trigger (dedup keyed by page + modification timestamp). Payload carries page metadata only — chain `Get Page Content` downstream to fetch the body.",
  category: "files",
  activation: "polling",
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
        "Pick the section to watch. Only pages updated in this section will fire the trigger.",
      type: "combobox",
      optionsSource: "microsoft-onenote:sections",
      dependsOn: "notebookId",
      required: true,
      placeholder: "Select Notebook first",
    },
    {
      name: "pageId",
      label: "Page (optional)",
      description:
        "When set, the trigger fires ONLY when this specific page is updated. Leave empty to fire for any update in the section.",
      type: "combobox",
      optionsSource: "microsoft-onenote:pages",
      dependsOn: "sectionId",
      required: false,
      placeholder: "Select Section first (or leave empty)",
    },
  ],
  payloadShape: [
    {
      name: "changeKind",
      type: "string",
      description: "Always `\"updated\"` for updated_note. Mirrors the new_note shape for branch-on-kind workflows.",
    },
    {
      name: "pageId",
      type: "string",
      description: "Graph onenotePage id of the updated page.",
    },
    {
      name: "title",
      type: "string",
      description: "Page title.",
      sensitive: true,
    },
    {
      name: "webUrl",
      type: "string",
      description:
        "Canonical OneNote web URL for the page. Recipients still need OneNote sign-in + notebook share to open it.",
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
      name: "notebookId",
      type: "string",
      description: "Notebook id the page belongs to (echoed from trigger config).",
    },
    {
      name: "notebookName",
      type: "string",
      description:
        "Notebook display name when Graph returns it; `null` otherwise. Chain `Get Notebook Details` if you need the name reliably.",
      sensitive: true,
    },
    {
      name: "sectionId",
      type: "string",
      description: "Section id the page belongs to (echoed from trigger config).",
    },
    {
      name: "sectionName",
      type: "string",
      description:
        "Section display name when Graph returns it; `null` otherwise. Chain `Get Section Details` if you need the name reliably.",
      sensitive: true,
    },
    {
      name: "createdDateTime",
      type: "string",
      description: "ISO 8601 timestamp the page was created at.",
    },
    {
      name: "lastModifiedDateTime",
      type: "string",
      description: "ISO 8601 timestamp of this update.",
    },
  ],
  displayOrder: 20,
};
