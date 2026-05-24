import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { googleDocsDocumentUpdatedSubscriptionHandler } from "./renew";

/**
 * Module-init registration for the Google Docs `document_updated`
 * watch-based push trigger — Slice 3.GDOCS-5.
 *
 * Same pattern as `newDocument/index.ts` — activation / deactivation
 * / subscription handler registered at module load so the central
 * registries pick them up.
 */
registerActivation("google-docs", "document_updated", activate);
registerDeactivation("google-docs", "document_updated", deactivate);
registerSubscriptionHandler(googleDocsDocumentUpdatedSubscriptionHandler);

export {
  activate,
  deactivate,
  googleDocsDocumentUpdatedSubscriptionHandler,
};
