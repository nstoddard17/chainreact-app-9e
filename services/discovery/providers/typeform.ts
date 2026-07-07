import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Typeform discovery sub-registry — Slice 5.TYPEFORM-1 + TYPEFORM-2.
 *
 * Second net-new V2 provider (no V1 code — see
 * docs/providers/typeform/v2-pattern-audit.md). TYPEFORM-1 shipped ZERO
 * actions deliberately: the `form_response` webhook payload is
 * self-contained (answers, hidden fields, score). TYPEFORM-2 adds the
 * read-action family (backfill / on-demand / digest workflows) behind
 * the new `responses:read` scope, and `typeform` joins
 * COVERED_PROVIDERS (tests/structure/discovery-meta-coverage.test.ts)
 * in the same slice — 1:1 handler↔meta drift enforced from here on.
 *
 * **Coverage:** 2 actions, 1 webhook trigger.
 *
 * Action metas in displayOrder:
 *   10 - list_responses    20 - get_response
 *
 * **Trigger:** `new_response_in_form` — per-form webhook via Typeform's
 * PUT /forms/{id}/webhooks/{tag} lifecycle with a V2-minted per-webhook
 * secret. Activation + deactivation registered in
 * `integrations/typeform/triggers/newResponseInForm/index.ts`,
 * satisfying the trigger-meta-activation-invariant test without an
 * exemption.
 */

import { typeformListResponsesMeta } from "@/integrations/typeform/actions/listResponses.meta";
import { typeformGetResponseMeta } from "@/integrations/typeform/actions/getResponse.meta";
import { typeformNewResponseInFormTriggerMeta } from "@/integrations/typeform/triggers/newResponseInForm/newResponseInForm.meta";

/** Typeform read-action metas (TYPEFORM-2) — displayOrder 10..20. */
export const TYPEFORM_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  typeformListResponsesMeta,
  typeformGetResponseMeta,
];

/** Typeform webhook trigger metas — displayOrder 10. */
export const TYPEFORM_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  typeformNewResponseInFormTriggerMeta,
];
