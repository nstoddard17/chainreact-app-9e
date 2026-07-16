import { getActiveForExecution } from "@/repositories/integrations";
import type {
  PollingHandler,
  PollingHandlerContext,
} from "@/services/triggers/pollingRegistry";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import { pollSemanticModelRefreshes } from "./pollSemanticModelRefreshes";
import { pollDataflowTransactions } from "./pollDataflowTransactions";
import { pollImports } from "./pollImports";
import { pollPipelineOperations } from "./pollPipelineOperations";
import { pollDaxConditionMet, pollDaxQueryResultChanged } from "./pollDax";
import { pollGatewayDatasourceStatusChanged } from "./pollGatewayDatasourceStatus";
import {
  pollWorkspaceItemAdded,
  pollWorkspaceItemRemoved,
  pollWorkspaceAccessChanged,
} from "./pollWorkspace";

/**
 * The ONE polling handler for every Power BI polling trigger.
 *
 * Power BI has no webhook surface for the events we care about, so all 16
 * triggers are cron-polled. Each poll function lives in a sibling module
 * named for the domain it diffs; they fall into two families:
 *
 *   - Refresh / job lifecycle (`pollSemanticModelRefreshes`,
 *     `pollDataflowTransactions`, `pollImports`,
 *     `pollPipelineOperations`). Diff = new ids in a bounded provider job
 *     history.
 *   - State / diff (`pollDax`, `pollGatewayDatasourceStatus`,
 *     `pollWorkspace`). Diff = a change in observable provider state.
 *
 * The cross-domain plumbing they all share (`emitEvent`,
 * `persistSnapshot`, `warnMissingSnapshot`) lives in `pollShared`.
 *
 * The handler itself owns only the concerns common to all of them:
 * ownership (`canHandle`), cadence, integration resolution, and dispatch.
 * Per-trigger config parsing, snapshot diffing, and emission live in the
 * poll functions.
 *
 * Failure mode: a throw from any poll function propagates to the polling
 * registry, which isolates it per-trigger ("one bad trigger doesn't abort
 * the batch"). The next tick retries — every trigger is at-least-once and
 * dedups on a durable provider id at the engine boundary.
 */

const HANDLER_ID = "microsoft-powerbi/polling";

const PROVIDER = "microsoft-powerbi";

/**
 * Every event type this handler owns.
 *
 * NOTE: 16, not 17. The trigger catalog numbers a 17th entry, but it is
 * the deliberately-deferred tenant/admin bucket (`tenant_activity_event`,
 * `unused_artifact_detected`, `capacity_refreshable_failed`) — those need
 * Fabric-admin consent (research.md §2.9 / §4) and ship no code. Adding
 * them here would make `canHandle` claim triggers that don't exist.
 */
const SUPPORTED_EVENT_TYPES = new Set([
  // Refresh / job lifecycle.
  "semantic_model_refresh_completed",
  "semantic_model_refresh_failed",
  "semantic_model_refresh_canceled",
  "dataflow_refresh_completed",
  "dataflow_refresh_failed",
  "dataflow_refresh_canceled",
  "import_completed",
  "import_failed",
  "pipeline_deployment_completed",
  "pipeline_deployment_failed",
  // State / diff.
  "dax_condition_met",
  "dax_query_result_changed",
  "gateway_datasource_status_changed",
  "workspace_item_added",
  "workspace_item_removed",
  "workspace_access_changed",
]);

async function poll(ctx: PollingHandlerContext): Promise<void> {
  const { trigger, now } = ctx;

  if (trigger.provider !== PROVIDER) return;
  if (!SUPPORTED_EVENT_TYPES.has(trigger.eventType)) return;

  const integration = await getActiveForExecution(
    trigger.workflowAccountId!,
    PROVIDER,
    null,
  );
  if (!integration) {
    console.warn(
      JSON.stringify({
        event: "microsoft-powerbi.poll.no_integration",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        eventType: trigger.eventType,
      }),
    );
    return;
  }
  const providerAccountId = integration.providerAccountId;
  const base = { trigger, providerAccountId, now };

  switch (trigger.eventType) {
    case "semantic_model_refresh_completed":
    case "semantic_model_refresh_failed":
    case "semantic_model_refresh_canceled":
      await pollSemanticModelRefreshes({ ...base, eventType: trigger.eventType });
      return;
    case "dataflow_refresh_completed":
    case "dataflow_refresh_failed":
    case "dataflow_refresh_canceled":
      await pollDataflowTransactions({ ...base, eventType: trigger.eventType });
      return;
    case "import_completed":
    case "import_failed":
      await pollImports({ ...base, eventType: trigger.eventType });
      return;
    case "pipeline_deployment_completed":
    case "pipeline_deployment_failed":
      await pollPipelineOperations({ ...base, eventType: trigger.eventType });
      return;
    case "dax_condition_met":
      await pollDaxConditionMet(base);
      return;
    case "dax_query_result_changed":
      await pollDaxQueryResultChanged(base);
      return;
    case "gateway_datasource_status_changed":
      await pollGatewayDatasourceStatusChanged(base);
      return;
    case "workspace_item_added":
      await pollWorkspaceItemAdded(base);
      return;
    case "workspace_item_removed":
      await pollWorkspaceItemRemoved(base);
      return;
    case "workspace_access_changed":
      await pollWorkspaceAccessChanged(base);
      return;
  }
}

export const microsoftPowerBiPollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === PROVIDER &&
    SUPPORTED_EVENT_TYPES.has(trigger.eventType),
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};
