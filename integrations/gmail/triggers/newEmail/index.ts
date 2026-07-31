import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { registerLiveTriggerCaptureAdapter } from "@/services/triggers/liveCapture/registry";
import { activate } from "./activate";
import { gmailNewEmailPollingHandler } from "./poll";
import { gmailNewEmailLiveCaptureAdapter } from "./liveCapture";

/**
 * Module-init registration for the Gmail "new_email" polling trigger.
 *
 * Slice 2e: importing this module registers BOTH the activation hook and
 * the polling handler. The cron route (app/api/cron/poll-triggers/route.ts)
 * imports `integrations/_registry` which transitively imports this module,
 * so registration happens before the first poll executes.
 *
 * WORKFLOW-LIVE-TEST-4: also registers the live-capture adapter — the
 * session-scoped stand-in the live-test flow polls instead of the
 * production trigger. Server surfaces that consult the live-capture
 * registry (the live-test routes) import `integrations/_registry` the
 * same way the cron route does.
 *
 * Re-exports kept thin — the orchestration entry points (activate,
 * pollingHandler) are the only public API of this module.
 */

registerActivation("gmail", "new_email", activate);
registerPollingHandler(gmailNewEmailPollingHandler);
registerLiveTriggerCaptureAdapter(gmailNewEmailLiveCaptureAdapter);

export { activate, gmailNewEmailPollingHandler };
