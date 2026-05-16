/**
 * Manual trigger — Native-nodes Slice 2 Commit 1.
 *
 * Pure registration / shape module. The trigger has no activation hook
 * (the lifecycle persists the trigger_resources row with the empty
 * config straight from the WorkflowNode) and no dispatch path of its
 * own — runs are kicked off via the dedicated
 * `POST /api/workflows/[id]/run-now` route, which calls `enqueueRun`
 * directly without going through `dispatchTriggerEvent`.
 *
 * See:
 *   - docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §4
 *   - app/api/workflows/[id]/run-now/route.ts
 */
export {
  MANUAL_TRIGGER_PROVIDER,
  MANUAL_TRIGGER_EVENT_TYPE,
  ManualTriggerConfigSchema,
  ManualTriggerPayloadSchema,
  type ManualTriggerConfig,
  type ManualTriggerPayload,
} from "./manualTrigger.schema";
