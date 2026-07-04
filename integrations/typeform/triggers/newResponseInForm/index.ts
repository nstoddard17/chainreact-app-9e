import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { typeformNewResponseInFormActivate } from "./activate";
import { typeformNewResponseInFormDeactivate } from "./deactivate";
import { typeformNewResponseInFormFilter } from "./filter";

/**
 * Module-init registration for the Typeform `new_response_in_form`
 * trigger — Slice 5.TYPEFORM-1.
 *
 * The single Typeform trigger: per-form webhook with a caller-minted
 * secret (no creation handshake — contrast Asana). Imported by
 * `integrations/_registry.ts` (boot pipeline) AND
 * `app/api/webhooks/typeform/route.ts` (cold serverless receive
 * invocations — without it the P-S2 formId filter registry would be
 * empty and events would match all rows).
 *
 * **NO subscription/renewal registration** — Typeform webhooks don't
 * expire on a schedule (same "permanent endpoint" pattern as GitHub /
 * Monday / Asana).
 */
registerActivation(
  "typeform",
  "new_response_in_form",
  typeformNewResponseInFormActivate,
);
registerDeactivation(
  "typeform",
  "new_response_in_form",
  typeformNewResponseInFormDeactivate,
);
registerTriggerFilter(typeformNewResponseInFormFilter);

export {
  typeformNewResponseInFormActivate as activate,
  typeformNewResponseInFormDeactivate as deactivate,
  typeformNewResponseInFormFilter,
};
