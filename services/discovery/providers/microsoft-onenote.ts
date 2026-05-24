import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Microsoft OneNote discovery sub-registry — Slice 3.ONENOTE-4
 * (actions) + Slice 3.ONENOTE-5 (triggers).
 *
 * Per-provider extraction of the OneNote meta imports — mirrors
 * `services/discovery/providers/google-docs.ts` /
 * `services/discovery/providers/discord.ts` /
 * `services/discovery/providers/mailchimp.ts` pattern. Central registry
 * validation (`ActionMetaSchema.parse` + `TriggerMetaSchema.parse` +
 * duplicate-key rejection) still happens in
 * `services/discovery/_registry.ts` — this file is purely an import
 * grouping.
 *
 * **Coverage:** 12 actions, 2 triggers.
 *
 * **Trigger architecture (ONENOTE-5):**
 *   - Microsoft Graph **deprecated OneNote subscriptions in May 2023**
 *     — webhooks are not an option for OneNote (different from
 *     Outlook / Calendar / OneDrive which all carry Graph webhook
 *     subscriptions). The OneNote manifest's
 *     `capabilities.webhookTrigger` is permanently `false` per
 *     ONENOTE-1 §4.2.
 *   - Both triggers (`new_note` + `updated_note`) are V2-native
 *     section-scoped polling via the shared
 *     `services/triggers/pollingRegistry` + 5-minute default cadence
 *     (`services/cron/pollingIntervals.DEFAULT_INTERVAL_MS`). Section-
 *     scope matches the Discord per-channel polling precedent +
 *     reuses the ONENOTE-3 cascade resolvers (notebookId →
 *     sectionId).
 *   - `new_note` snapshot: `{lastSeenCreatedDateTime, capturedAt}`.
 *     Event-id namespace: `${pageId}:created`.
 *   - `updated_note` snapshot: `{lastSeenModifiedDateTime,
 *     capturedAt}`. Event-id namespace:
 *     `${pageId}:${lastModifiedDateTime}` (composite key — multiple
 *     updates of the same page over time fire once each, but a single
 *     update fetched across two ticks dedups). Brand-new pages
 *     excluded (`createdDateTime === lastModifiedDateTime`) so
 *     `new_note` and `updated_note` don't double-fire on creation.
 *   - Both triggers register `registerActivation("microsoft-onenote",
 *     <type>, activate)` in their `index.ts` files —
 *     trigger-meta-activation-invariant test is satisfied without
 *     exemption.
 *
 * **Field-name preservation:** Field names mirror the ONENOTE-2 Zod
 * schemas verbatim (`notebookId`, `sectionId`, `pageId`,
 * `displayName`, `sourcePageId`, `targetSectionId`, `includeIDs`,
 * `preGenerated`, etc. — all camelCase). No normalization.
 *
 * **UI scope-narrower convention:** Several actions (create_page,
 * update_page, get_page_content, list_pages, copy_page, delete_page,
 * get_section_details) declare optional `notebookId` / `sectionId`
 * meta fields that the runtime handler ignores. They exist purely to
 * provide the cascade-picker parent for the
 * `microsoft-onenote:sections` / `microsoft-onenote:pages` resolvers
 * (which require fixed dep names — builder cascade wiring sends
 * `deps[<parent-field-name>]`). The ONENOTE-2 schemas were extended
 * to accept these as `.optional()` UI scope-narrowers in the same
 * ONENOTE-4 slice; see the per-schema headers for rationale.
 *
 * **Dual-hierarchy picker limitation (copy_page):** The same dep-name
 * constraint means `copy_page` can only have ONE cascade chain per
 * meta — source-side wins. The `targetSectionId` field is a text
 * input; the action description points authors at chaining a
 * `list_sections` action and using the variable picker. Cleanly
 * resolving this requires either a sibling resolver
 * (`microsoft-onenote:sections_by_target_notebook`) or route-level
 * renamable deps; both deferred to ONENOTE-N polish.
 *
 * **Resolver wiring** (shipped in Slice 3.ONENOTE-3):
 *   - `microsoft-onenote:notebooks` — backs `notebookId` pickers.
 *   - `microsoft-onenote:sections`  — backs `sectionId` pickers
 *                                     (depends on `notebookId`).
 *   - `microsoft-onenote:pages`     — backs `pageId` / `sourcePageId`
 *                                     pickers (depends on `sectionId`).
 */

import { microsoftOneNoteNewNoteTriggerMeta } from "@/integrations/microsoft-onenote/triggers/newNote/newNote.meta";
import { microsoftOneNoteUpdatedNoteTriggerMeta } from "@/integrations/microsoft-onenote/triggers/updatedNote/updatedNote.meta";

import { microsoftOneNoteCreatePageMeta } from "@/integrations/microsoft-onenote/actions/createPage.meta";
import { microsoftOneNoteUpdatePageMeta } from "@/integrations/microsoft-onenote/actions/updatePage.meta";
import { microsoftOneNoteCopyPageMeta } from "@/integrations/microsoft-onenote/actions/copyPage.meta";
import { microsoftOneNoteGetPageContentMeta } from "@/integrations/microsoft-onenote/actions/getPageContent.meta";
import { microsoftOneNoteListPagesMeta } from "@/integrations/microsoft-onenote/actions/listPages.meta";
import { microsoftOneNoteDeletePageMeta } from "@/integrations/microsoft-onenote/actions/deletePage.meta";
import { microsoftOneNoteCreateSectionMeta } from "@/integrations/microsoft-onenote/actions/createSection.meta";
import { microsoftOneNoteListSectionsMeta } from "@/integrations/microsoft-onenote/actions/listSections.meta";
import { microsoftOneNoteGetSectionDetailsMeta } from "@/integrations/microsoft-onenote/actions/getSectionDetails.meta";
import { microsoftOneNoteCreateNotebookMeta } from "@/integrations/microsoft-onenote/actions/createNotebook.meta";
import { microsoftOneNoteListNotebooksMeta } from "@/integrations/microsoft-onenote/actions/listNotebooks.meta";
import { microsoftOneNoteGetNotebookDetailsMeta } from "@/integrations/microsoft-onenote/actions/getNotebookDetails.meta";

/**
 * OneNote action metas in displayOrder (10..120). Ordered so the
 * library panel surfaces the most-used page-targeted actions first
 * (create / update / copy / get_content / list), then the
 * destructive delete, then sections, then notebooks.
 *
 *   10  - create_page          (medium — new external content)
 *   20  - update_page          (medium — replace mode recoverable via
 *                               OneNote per-page version history)
 *   30  - copy_page            (medium — async; success != complete)
 *   40  - get_page_content     (low — pure read; content is sensitive)
 *   50  - list_pages           (low — pure read)
 *   60  - delete_page          (HIGH + destructive trio — irreversible)
 *   70  - create_section       (medium)
 *   80  - list_sections        (low)
 *   90  - get_section_details  (low)
 *  100  - create_notebook      (medium — top-level resource)
 *  110  - list_notebooks       (low)
 *  120  - get_notebook_details (low)
 */
export const MICROSOFT_ONENOTE_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  microsoftOneNoteCreatePageMeta,
  microsoftOneNoteUpdatePageMeta,
  microsoftOneNoteCopyPageMeta,
  microsoftOneNoteGetPageContentMeta,
  microsoftOneNoteListPagesMeta,
  microsoftOneNoteDeletePageMeta,
  microsoftOneNoteCreateSectionMeta,
  microsoftOneNoteListSectionsMeta,
  microsoftOneNoteGetSectionDetailsMeta,
  microsoftOneNoteCreateNotebookMeta,
  microsoftOneNoteListNotebooksMeta,
  microsoftOneNoteGetNotebookDetailsMeta,
];

/**
 * OneNote polling trigger metas in displayOrder (10..20).
 *
 *   10 - new_note      (low — observational; fires on page creation
 *                       in the chosen section; snapshot keyed on
 *                       createdDateTime)
 *   20 - updated_note  (low — observational; fires on page updates
 *                       in the chosen section, excluding brand-new
 *                       pages; snapshot keyed on
 *                       lastModifiedDateTime; optional pageId filter)
 *
 * Both register activation hooks in their respective `index.ts`
 * files (`registerActivation("microsoft-onenote", <type>, activate)`)
 * — the trigger-meta-activation-invariant test is satisfied without
 * exemption. `webhookTrigger` stays false on the manifest
 * permanently (Microsoft Graph deprecated OneNote subscriptions in
 * May 2023).
 */
export const MICROSOFT_ONENOTE_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  microsoftOneNoteNewNoteTriggerMeta,
  microsoftOneNoteUpdatedNoteTriggerMeta,
];
