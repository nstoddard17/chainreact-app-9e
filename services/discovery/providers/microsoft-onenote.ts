import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Microsoft OneNote discovery sub-registry — Slice 3.ONENOTE-4 (actions).
 *
 * Per-provider extraction of the OneNote meta imports — mirrors
 * `services/discovery/providers/google-docs.ts` /
 * `services/discovery/providers/discord.ts` /
 * `services/discovery/providers/mailchimp.ts` pattern. Central registry
 * validation (`ActionMetaSchema.parse` + duplicate-key rejection) still
 * happens in `services/discovery/_registry.ts` — this file is purely
 * an import grouping.
 *
 * **Coverage:** 12 actions, 0 triggers (action-only flip in ONENOTE-4;
 * triggers in ONENOTE-5).
 *
 * **Trigger staging rationale (ONENOTE-5 vs ONENOTE-4):**
 *   - Microsoft Graph **deprecated OneNote subscriptions in May 2023**
 *     — webhooks are not an option for OneNote (different from
 *     Outlook / Calendar / OneDrive which all carry Graph webhook
 *     subscriptions). The OneNote manifest's
 *     `capabilities.webhookTrigger` is permanently `false` per
 *     ONENOTE-1 §4.2.
 *   - V2-native OneNote triggers are **polling** via the shared
 *     Excel-style polling-trigger infrastructure (ONENOTE-1 §4.2).
 *     `new_note` + `updated_note` ship in ONENOTE-5 against
 *     `pollingTrigger: true` on the manifest.
 *   - The actions surface is fully usable without triggers — V2-v1
 *     workflows that REACT to non-OneNote events and write into
 *     OneNote work today. The staged trigger arc is a deliberate
 *     sequencing, not an accidental gap. Same precedent as Stripe /
 *     Discord / Google Docs's staged trigger arcs.
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
 * No OneNote triggers in ONENOTE-4. Polling triggers (`new_note` +
 * `updated_note`) land in ONENOTE-5 via the shared Excel-style
 * polling-trigger infrastructure. Manifest's `pollingTrigger`
 * capability flips true in that slice; `webhookTrigger` stays false
 * permanently (Microsoft deprecated OneNote subscriptions in
 * May 2023).
 */
export const MICROSOFT_ONENOTE_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [];
