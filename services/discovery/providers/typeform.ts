import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Typeform discovery sub-registry — Slice 5.TYPEFORM-1.
 *
 * Second net-new V2 provider (no V1 code — see
 * docs/providers/typeform/v2-pattern-audit.md). This first slice ships
 * ZERO actions deliberately: the `form_response` webhook payload is
 * self-contained (answers, hidden fields, score), so no read action is
 * needed and none is invented. There is consequently NO
 * `TYPEFORM_ACTION_METAS` export and `typeform` stays OUT of
 * `COVERED_PROVIDERS` (tests/structure/discovery-meta-coverage.test.ts
 * requires at least one ActionMeta per covered provider) until the first
 * action slice flips it.
 *
 * **Coverage:** 1 webhook trigger.
 *
 * **Trigger:** `new_response_in_form` — per-form webhook via Typeform's
 * PUT /forms/{id}/webhooks/{tag} lifecycle with a V2-minted per-webhook
 * secret. Activation + deactivation registered in
 * `integrations/typeform/triggers/newResponseInForm/index.ts`,
 * satisfying the trigger-meta-activation-invariant test without an
 * exemption.
 */

import { typeformNewResponseInFormTriggerMeta } from "@/integrations/typeform/triggers/newResponseInForm/newResponseInForm.meta";

/** Typeform webhook trigger metas — displayOrder 10. */
export const TYPEFORM_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  typeformNewResponseInFormTriggerMeta,
];
