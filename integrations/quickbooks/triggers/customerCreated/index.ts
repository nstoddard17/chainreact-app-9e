import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import {
  quickbooksAppLevelActivate,
  quickbooksAppLevelDeactivate,
} from "../_shared/lifecycle";
import { makeQuickbooksRealmFilter } from "../_shared/filter";

/**
 * Module-init registration for `quickbooks:customer_created` —
 * QUICKBOOKS-1.
 *
 * APP-LEVEL webhook lifecycle: activation stores an internal
 * trigger-interest row (realmId config patch, NO provider call);
 * deactivation is a no-op (the row removal IS the interest removal);
 * the fail-closed realm filter scopes fan-out. Imported by
 * `integrations/_registry.ts` (boot pipeline) AND
 * `app/api/webhooks/quickbooks/route.ts` (cold serverless receive
 * invocations — without it the realm filter registry would be empty
 * and events would match all rows).
 */
registerActivation(
  "quickbooks",
  "customer_created",
  quickbooksAppLevelActivate,
);
registerDeactivation(
  "quickbooks",
  "customer_created",
  quickbooksAppLevelDeactivate,
);
export const quickbooksCustomerCreatedFilter =
  makeQuickbooksRealmFilter("customer_created");
registerTriggerFilter(quickbooksCustomerCreatedFilter);

export {
  quickbooksAppLevelActivate as activate,
  quickbooksAppLevelDeactivate as deactivate,
};
