import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { microsoftExcelPollingHandler } from "../_shared/pollingHandler";
import { activate } from "./activate";

/**
 * Module-init registration for the Excel `new_row` polling trigger.
 *
 * Slice 15 Commit 4: importing this module registers the activation
 * hook for `new_row` AND the shared polling handler that owns both
 * Excel trigger event types.
 *
 * `registerPollingHandler` is idempotent on (provider, eventType) at
 * activation, but registers a handler instance per call — the
 * `canHandle` predicate in the handler is mutually-exclusive with
 * sibling handlers, and `findPollingHandler` returns first-match. To
 * keep registry size O(providers) rather than O(eventTypes), the
 * shared handler is registered exactly once via newRow's side-effect
 * import (newTableRow does NOT re-register it).
 */

registerActivation("microsoft-excel", "new_row", activate);
registerPollingHandler(microsoftExcelPollingHandler);

export { activate };
