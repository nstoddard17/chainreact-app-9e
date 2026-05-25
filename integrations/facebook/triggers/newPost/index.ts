import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { facebookSharedActivate } from "../_shared/activate";
import { facebookSharedDeactivate } from "../_shared/deactivate";
import { facebookNewPostFilter } from "./filter";

/**
 * Module-init registration for the Facebook `new_post` webhook trigger —
 * Slice 3.FACEBOOK-5. Imported by `integrations/_registry.ts` (boot
 * pipeline) AND `app/api/webhooks/facebook/route.ts` (so a cold serverless
 * invocation of the receive route has the filter populated before dispatch).
 *
 * Activation subscribes the Page (`subscribed_apps`) — real per-page work,
 * so NO `SHARED_INFRA_EXEMPT_KEYS` entry is needed. Deactivation is
 * reference-count-safe (shared page-level subscription). The filter narrows
 * the app-level webhook fan-out to rows whose `pageId` matches the event.
 */
registerActivation("facebook", "new_post", facebookSharedActivate);
registerDeactivation("facebook", "new_post", facebookSharedDeactivate);
registerTriggerFilter(facebookNewPostFilter);

export { facebookSharedActivate, facebookSharedDeactivate, facebookNewPostFilter };
