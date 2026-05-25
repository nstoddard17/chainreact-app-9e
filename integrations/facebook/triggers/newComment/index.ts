import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { facebookSharedActivate } from "../_shared/activate";
import { facebookSharedDeactivate } from "../_shared/deactivate";
import { facebookNewCommentFilter } from "./filter";

/**
 * Module-init registration for the Facebook `new_comment` webhook trigger —
 * Slice 3.FACEBOOK-5. Shares the activation/deactivation hooks with
 * `new_post` (both subscribe the same Page `feed` field). The filter adds an
 * optional local `postId` narrowing on top of the pageId match.
 */
registerActivation("facebook", "new_comment", facebookSharedActivate);
registerDeactivation("facebook", "new_comment", facebookSharedDeactivate);
registerTriggerFilter(facebookNewCommentFilter);

export { facebookSharedActivate, facebookSharedDeactivate, facebookNewCommentFilter };
