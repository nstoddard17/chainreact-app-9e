import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Google Docs discovery sub-registry — Slice 3.GDOCS-4 (actions) +
 * Slice 3.GDOCS-5 (triggers).
 *
 * Per-provider extraction of the Google Docs meta imports — mirrors
 * the `services/discovery/providers/discord.ts` +
 * `services/discovery/providers/mailchimp.ts` pattern. Central registry
 * validation (`ActionMetaSchema.parse` + `TriggerMetaSchema.parse` +
 * duplicate-key rejection) still happens in
 * `services/discovery/_registry.ts` — this file is purely an import
 * grouping.
 *
 * **Coverage:** 5 actions, 2 triggers.
 *
 * **Trigger architecture (GDOCS-5):**
 *   - Google Docs has no native trigger surface; both triggers ride
 *     Drive's `files.watch` push channel + filter to Docs mimeType in
 *     normalize per GDOCS-1 §3.5 D-GD2.
 *   - `new_document` — fires on `createdTime === modifiedTime`
 *     changes. Optional `folderId` scope; defaults to whole-drive.
 *   - `document_updated` — fires on `createdTime < modifiedTime`
 *     changes. Optional `documentId` (narrowest scope) OR `folderId`.
 *   - Both register a per-trigger Drive channel + a renewal handler
 *     (`googleDocsNewDocumentSubscriptionHandler` /
 *     `googleDocsDocumentUpdatedSubscriptionHandler`).
 *   - The webhook receive route is `/api/webhooks/google-docs`;
 *     receive.ts dispatches by `trigger.eventType`.
 *
 * **Field-name preservation:** Field names mirror V1 / runtime
 * schemas verbatim (`documentId`, `folderId`, etc.). No
 * normalization to snake_case.
 *
 * **Resolver wiring** (shipped in Slice 3.GDOCS-3):
 *   - `google-docs:documents` — backs `documentId` pickers.
 *   - `google-drive:folders`  — backs `folderId` pickers.
 */

import { googleDocsCreateDocumentMeta } from "@/integrations/google-docs/actions/createDocument.meta";
import { googleDocsUpdateDocumentMeta } from "@/integrations/google-docs/actions/updateDocument.meta";
import { googleDocsShareDocumentMeta } from "@/integrations/google-docs/actions/shareDocument.meta";
import { googleDocsGetDocumentMeta } from "@/integrations/google-docs/actions/getDocument.meta";
import { googleDocsExportDocumentMeta } from "@/integrations/google-docs/actions/exportDocument.meta";
import { googleDocsNewDocumentTriggerMeta } from "@/integrations/google-docs/triggers/newDocument/newDocument.meta";
import { googleDocsDocumentUpdatedTriggerMeta } from "@/integrations/google-docs/triggers/documentUpdated/documentUpdated.meta";

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
 * Google Docs trigger metas in displayOrder:
 *   10 - new_document       (webhook, optional folderId scope)
 *   20 - document_updated   (webhook, optional documentId OR folderId
 *                            scope)
 *
 * Both activation hooks live in their respective `index.ts` files →
 * `registerActivation("google-docs", <type>, activate)`. The
 * trigger-meta-activation-invariant test is satisfied without
 * exemptions.
 */
export const GOOGLE_DOCS_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  googleDocsNewDocumentTriggerMeta,
  googleDocsDocumentUpdatedTriggerMeta,
];
