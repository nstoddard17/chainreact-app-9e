import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import {
  quickbooksAppLevelActivate,
  quickbooksAppLevelDeactivate,
} from "../_shared/lifecycle";
import { makeQuickbooksRealmFilter } from "../_shared/filter";

/**
 * Module-init registration for `quickbooks:payment_received` —
 * QUICKBOOKS-1. Same app-level lifecycle + realm filter as
 * customer_created (see that index for the pattern notes).
 */
registerActivation(
  "quickbooks",
  "payment_received",
  quickbooksAppLevelActivate,
);
registerDeactivation(
  "quickbooks",
  "payment_received",
  quickbooksAppLevelDeactivate,
);
export const quickbooksPaymentReceivedFilter =
  makeQuickbooksRealmFilter("payment_received");
registerTriggerFilter(quickbooksPaymentReceivedFilter);

export {
  quickbooksAppLevelActivate as activate,
  quickbooksAppLevelDeactivate as deactivate,
};
