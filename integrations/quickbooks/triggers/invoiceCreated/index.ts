import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import {
  quickbooksAppLevelActivate,
  quickbooksAppLevelDeactivate,
} from "../_shared/lifecycle";
import { makeQuickbooksRealmFilter } from "../_shared/filter";

/**
 * Module-init registration for `quickbooks:invoice_created` —
 * QUICKBOOKS-1. Same app-level lifecycle + realm filter as
 * customer_created (see that index for the pattern notes).
 */
registerActivation("quickbooks", "invoice_created", quickbooksAppLevelActivate);
registerDeactivation(
  "quickbooks",
  "invoice_created",
  quickbooksAppLevelDeactivate,
);
export const quickbooksInvoiceCreatedFilter =
  makeQuickbooksRealmFilter("invoice_created");
registerTriggerFilter(quickbooksInvoiceCreatedFilter);

export {
  quickbooksAppLevelActivate as activate,
  quickbooksAppLevelDeactivate as deactivate,
};
