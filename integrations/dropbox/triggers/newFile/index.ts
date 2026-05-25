import { registerActivation } from "@/services/triggers/activationRegistry";
import { activate } from "./activate";

/**
 * Module-init registration for the Dropbox `new_file` webhook trigger —
 * Slice 3.DROPBOX-5. Imported by `integrations/_registry.ts` so the
 * registration exists on every worker process.
 *
 * **Activation only — NO deactivation hook.** Dropbox's webhook is
 * app-level (one URL in the App Console); there's no per-workflow remote
 * subscription to create OR delete. Activation seeds the `list_folder`
 * cursor (first-poll-miss protection); deactivation is handled generically
 * by `services/triggers/lifecycle.ts` deleting the `trigger_resources` row
 * (`deleteByWorkflow`). The cursor-seeding activation satisfies the
 * `trigger-meta-activation-invariant` test WITHOUT a
 * `SHARED_INFRA_EXEMPT_KEYS` entry.
 *
 * **NO subscription/renewal handler** — the app webhook never expires.
 */
registerActivation("dropbox", "new_file", activate);

export { activate };
