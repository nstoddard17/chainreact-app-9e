import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerTriggerFilter } from "@/core/triggers/filterRegistry";
import { buildAsanaActivate } from "../_shared/activate";
import { asanaSharedDeactivate } from "../_shared/deactivate";
import { asanaNewTaskInProjectFilter } from "./filter";

/**
 * Module-init registration for the Asana `new_task_in_project` trigger —
 * Slice 5.ASANA-1.
 *
 * One of 2 Asana project-webhook triggers sharing the `_shared/`
 * activate/deactivate lifecycle; the per-trigger differences are the
 * webhook-creation filter pair (task+added) and the P-S2 projectId
 * dispatcher filter. Imported by `integrations/_registry.ts` (boot
 * pipeline) AND `app/api/webhooks/asana/route.ts` (cold serverless
 * receive invocations).
 *
 * **NO subscription/renewal registration** — Asana webhooks don't expire
 * on a schedule (same "permanent endpoint" pattern as GitHub / Monday).
 */
const activate = buildAsanaActivate("new_task_in_project");
registerActivation("asana", "new_task_in_project", activate);
registerDeactivation("asana", "new_task_in_project", asanaSharedDeactivate);
registerTriggerFilter(asanaNewTaskInProjectFilter);

export { activate, asanaSharedDeactivate as deactivate, asanaNewTaskInProjectFilter };
