import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Google Docs discovery sub-registry — Slice 3.GDOCS-4.
 *
 * Per-provider extraction of the Google Docs meta imports — mirrors
 * the `services/discovery/providers/discord.ts` +
 * `services/discovery/providers/mailchimp.ts` pattern. Central registry
 * validation (`ActionMetaSchema.parse` + duplicate-key rejection) still
 * happens in `services/discovery/_registry.ts` — this file is purely an
 * import grouping.
 *
 * **Coverage:** 5 actions, **0 triggers** in this slice.
 *
 * **Intentional trigger-staging gap (GDOCS-5 forthcoming):**
 *   - Google Docs action metadata is complete in GDOCS-4.
 *   - Drive-watch triggers (`new_document` + `document_updated`) are
 *     planned for GDOCS-5 — Google Docs has no native triggers
 *     surface; both are implemented via Drive's `files.watch` push
 *     channel filtered by the Docs mimeType (per GDOCS-1 §3.5 D-GD2).
 *   - This is a deliberate staged provider arc, **not** an accidental
 *     gap. The meta-coverage structural test enforces action ↔
 *     handler 1:1 only (precedent: Stripe / Discord); trigger coverage
 *     is not enforced. Adding `google-docs` to `COVERED_PROVIDERS` in
 *     this slice locks the 5-action coverage forward; GDOCS-5 will
 *     append 2 triggers to `GOOGLE_DOCS_TRIGGER_METAS`.
 *
 * **Field-name preservation:** All field names mirror the V1 runtime
 * schemas verbatim (`documentId`, `folderId`, `insertLocation`,
 * `searchText`, `shareWith`, `permission`, `sendNotification`,
 * `makePublic`, `publicPermission`, `allowDiscovery`,
 * `transferOwnership`, `exportFormat`, `fileName`). No normalization
 * to snake_case — the meta-coverage test would fail if drift
 * occurred.
 *
 * **Resolver wiring** (shipped in Slice 3.GDOCS-3):
 *   - `google-docs:documents` (no deps) — backs `documentId` on
 *     update_document / share_document / get_document /
 *     export_document.
 *   - `google-drive:folders` (no deps; intentionally cross-product) —
 *     backs `folderId` on create_document.
 */

import { googleDocsCreateDocumentMeta } from "@/integrations/google-docs/actions/createDocument.meta";
import { googleDocsUpdateDocumentMeta } from "@/integrations/google-docs/actions/updateDocument.meta";
import { googleDocsShareDocumentMeta } from "@/integrations/google-docs/actions/shareDocument.meta";
import { googleDocsGetDocumentMeta } from "@/integrations/google-docs/actions/getDocument.meta";
import { googleDocsExportDocumentMeta } from "@/integrations/google-docs/actions/exportDocument.meta";

/**
 * Google Docs action metas in displayOrder (10..50). Matches the
 * runtime handler registration order in
 * `services/execution/handlers/_registry.ts` (Slice 3.GDOCS-2).
 *
 *   10 - create_document  (medium — new external resource per call)
 *   20 - update_document  (medium — replace mode wipes body)
 *   30 - share_document   (HIGH + destructive trio — public + ownership)
 *   40 - get_document     (low — pure read)
 *   50 - export_document  (low — file-generation; FileRef-producing)
 */
export const GOOGLE_DOCS_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  googleDocsCreateDocumentMeta,
  googleDocsUpdateDocumentMeta,
  googleDocsShareDocumentMeta,
  googleDocsGetDocumentMeta,
  googleDocsExportDocumentMeta,
];

/**
 * Google Docs trigger metas. Empty array in GDOCS-4 — Drive-watch
 * triggers ship in GDOCS-5. The const stays exported as an empty
 * `ReadonlyArray<TriggerMeta>` so the central registry can spread it
 * unconditionally without a follow-up edit when GDOCS-5 lands.
 */
export const GOOGLE_DOCS_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [];
