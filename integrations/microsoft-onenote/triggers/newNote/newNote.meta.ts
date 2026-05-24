import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:new_note` — Slice
 * 3.ONENOTE-5.
 *
 * **Polling-activated, section-scoped.** The activation hook at
 * `integrations/microsoft-onenote/triggers/newNote/activate.ts`
 * registers via `registerActivation("microsoft-onenote", "new_note",
 * ...)` and seeds `snapshot.lastSeenCreatedDateTime` from the
 * section's CURRENT newest page BEFORE the `trigger_resources` row is
 * upserted. This is V2's first-poll-miss protection — without the
 * activation baseline, the first poll would establish its own
 * baseline and silently drop pages that arrived between activate and
 * the first tick.
 *
 * The activation-registry invariant test
 * (`tests/structure/trigger-meta-activation-invariant.test.ts`) is
 * satisfied by this registration; no exemption is needed (and adding
 * one would mask a real correctness invariant).
 *
 * **No Microsoft Graph webhook subscription.** Graph deprecated
 * OneNote subscriptions in May 2023; the manifest's
 * `capabilities.webhookTrigger` is permanently `false`. V2 uses
 * polling (`activation: "polling"`) via the shared
 * `services/triggers/pollingRegistry` + 5-minute default cadence
 * (`services/cron/pollingIntervals.DEFAULT_INTERVAL_MS`).
 *
 * **Section-scoped scope choice.** Account-wide polling would
 * require Graph `/me/onenote/pages` enumeration (no per-section
 * pagination, expensive for large notebooks) OR per-section
 * traversal multiplication. Section-scoped matches V2's "explicit
 * scope > magic global discovery" pattern + the existing Discord
 * per-channel polling precedent + reuses the ONENOTE-3 cascade
 * resolvers (notebookId → sectionId).
 *
 * `notebookId` is a UI scope-narrower (required so the builder's
 * sections-resolver dep wiring works — same convention as the
 * ONENOTE-4 action metas). The poll runtime preserves it for
 * payload echo + re-activation idempotency.
 *
 * Internal server-managed state — `pollingEnabled`, `snapshot`,
 * `polling` — is intentionally NOT surfaced as `fields[]` (mirrors
 * the Gmail / Discord polling-trigger convention of hiding
 * activation-managed state).
 *
 * **No body / content in payload.** Workflow authors chain
 * `microsoft-onenote:get_page_content` to fetch the body (which marks
 * `content` sensitive at the action layer). Trigger payloads carry
 * metadata only.
 */
export const microsoftOneNoteNewNoteTriggerMeta: TriggerMeta = {
  key: "microsoft-onenote:new_note",
  provider: "microsoft-onenote",
  type: "new_note",
  displayName: "New Note",
  description:
    "Fires when a new page appears in the chosen OneNote section. Polls every 5 minutes by default (Microsoft Graph deprecated OneNote webhook subscriptions in May 2023 — polling is the V2-native architecture). Section-scoped: pick a notebook and section; the trigger watches that one section. Payload carries page metadata only — chain `Get Page Content` downstream to fetch the body.",
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
        "Pick the section to watch. Change the notebook and the section picker re-fetches. Only pages created in this section will fire the trigger.",
      type: "combobox",
      optionsSource: "microsoft-onenote:sections",
      dependsOn: "notebookId",
      required: true,
      placeholder: "Select Notebook first",
    },
  ],
  payloadShape: [
    {
      name: "changeKind",
      type: "string",
      description: "Always `\"created\"` for new_note. Mirrors the updated_note shape for branch-on-kind workflows.",
    },
    {
      name: "pageId",
      type: "string",
      description: "Graph onenotePage id of the new page. Stable; usable as a dedup key.",
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
      description: "ISO 8601 timestamp of the most recent modification.",
    },
  ],
  displayOrder: 10,
};
