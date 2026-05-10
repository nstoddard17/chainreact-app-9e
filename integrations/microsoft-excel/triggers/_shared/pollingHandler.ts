import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { enqueueRun } from "@/services/execution/enqueue";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type {
  PollingHandler,
  PollingHandlerContext,
} from "@/services/triggers/pollingRegistry";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { worksheetUsedRange } from "../../api/worksheetUsedRange";
import { tableRowsList } from "../../api/tableRowsList";
import { ExcelNewRowConfigSchema } from "../newRow/schema";
import { ExcelNewTableRowConfigSchema } from "../newTableRow/schema";
import {
  buildSnapshot,
  findNewKeys,
  type ExcelRowSnapshot,
} from "./snapshot";

/**
 * Shared polling handler for the two Excel triggers.
 *
 * One handler instance covers both `new_row` (worksheet position-keyed)
 * and `new_table_row` (table stable-id-keyed). Slice 15 plan §"Trigger
 * surface" confirms the single-handler decision — both event types
 * exercise the same snapshot/diff/enqueue path with one differing
 * detail (which Graph endpoint feeds the current state).
 *
 * Per-tick flow:
 *   1. Parse the trigger row's config through the event-type-specific
 *      schema.
 *   2. Guard: snapshot must already exist (activation seeded it; absent
 *      snapshot means activation failed without aborting — defensive
 *      log + skip rather than re-seed silently).
 *   3. Resolve integration → providerAccountId.
 *   4. Fetch current rows from Graph.
 *   5. Diff `current` vs `previousSnapshot` — new keys → emit one
 *      TriggerEvent per new row, dedup-keyed on
 *      `<provider>:<workflowId>:<nodeId>:<key>:<hash>` via the shared
 *      `webhook_event_dedup` repo.
 *   6. Persist updated snapshot back to `trigger_resources.config` and
 *      bump `polling.lastPolledAt`.
 *
 * Polling interval: 60s for Slice 15 (matches Gmail). V1's role-based
 * intervals deferred to a later optimization.
 *
 * Failure mode: any error mid-tick logs + skips this trigger; the next
 * tick retries. Matches Gmail's poll-loop "one bad trigger doesn't
 * abort the batch" semantics handled at the registry level.
 */

const HANDLER_ID = "microsoft-excel/polling";

async function poll(ctx: PollingHandlerContext): Promise<void> {
  const { trigger } = ctx;

  if (trigger.provider !== "microsoft-excel") return;
  if (trigger.eventType !== "new_row" && trigger.eventType !== "new_table_row") {
    return;
  }

  const integration = await getActiveForExecution(
    trigger.userId,
    "microsoft-excel",
    null,
  );
  if (!integration) {
    console.warn(
      JSON.stringify({
        event: "microsoft-excel.poll.no_integration",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        userId: trigger.userId,
      }),
    );
    return;
  }
  const accountId = integration.providerAccountId;

  if (trigger.eventType === "new_row") {
    await pollWorksheet({ trigger, accountId, now: ctx.now });
  } else {
    await pollTable({ trigger, accountId, now: ctx.now });
  }
}

async function pollWorksheet(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  accountId: string;
  now: number;
}): Promise<void> {
  const { trigger, accountId, now } = input;
  const config = ExcelNewRowConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "microsoft-excel.poll.no_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        eventType: "new_row",
      }),
    );
    return;
  }

  const range = await refreshAndRetry({
    userId: trigger.userId,
    provider: "microsoft-excel",
    accountId,
    apiCall: (accessToken) =>
      worksheetUsedRange({
        accessToken,
        workbookId: config.workbookId,
        worksheetName: config.worksheetName,
        valuesOnly: true,
      }),
  });

  const allValues = range.values ?? [];
  const isEmpty =
    allValues.length === 0 ||
    (allValues.length === 1 &&
      (allValues[0]?.length ?? 0) === 1 &&
      (allValues[0]![0] === null || allValues[0]![0] === undefined));

  const current = isEmpty
    ? []
    : allValues.map((row, index) => ({ key: String(index + 1), values: row }));

  const previous: ExcelRowSnapshot = config.snapshot;
  const newEntries = findNewKeys(previous, current);

  for (const entry of newEntries) {
    await emitEvent({
      trigger,
      accountId,
      eventType: "new_row",
      key: entry.key,
      values: entry.values,
      extra: {
        workbookId: config.workbookId,
        worksheetName: config.worksheetName,
        rowIndex: Number(entry.key),
      },
    });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: buildSnapshot(current),
    now,
  });
}

async function pollTable(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  accountId: string;
  now: number;
}): Promise<void> {
  const { trigger, accountId, now } = input;
  const config = ExcelNewTableRowConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "microsoft-excel.poll.no_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        eventType: "new_table_row",
      }),
    );
    return;
  }

  const rows = await refreshAndRetry({
    userId: trigger.userId,
    provider: "microsoft-excel",
    accountId,
    apiCall: (accessToken) =>
      tableRowsList({
        accessToken,
        workbookId: config.workbookId,
        tableName: config.tableName,
      }),
  });

  const current = rows.map((r) => ({
    key: String(r.index),
    values: r.values[0] ?? [],
  }));

  const previous: ExcelRowSnapshot = config.snapshot;
  const newEntries = findNewKeys(previous, current);

  for (const entry of newEntries) {
    await emitEvent({
      trigger,
      accountId,
      eventType: "new_table_row",
      key: entry.key,
      values: entry.values,
      extra: {
        workbookId: config.workbookId,
        tableName: config.tableName,
        rowIndex: Number(entry.key),
      },
    });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: buildSnapshot(current),
    now,
  });
}

async function emitEvent(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  accountId: string;
  eventType: "new_row" | "new_table_row";
  key: string;
  values: ReadonlyArray<unknown>;
  extra: Record<string, unknown>;
}): Promise<void> {
  const { trigger, accountId, eventType, key, values, extra } = input;

  // Synthetic event id ties to the trigger + row key so a snapshot
  // regression (e.g. workflow reactivated and pre-existing rows reappear
  // as "new") would still dedupe at the engine boundary.
  const eventId = `microsoft-excel:${trigger.workflowId}:${trigger.nodeId}:${eventType}:${key}`;

  const event: TriggerEvent = {
    provider: "microsoft-excel",
    eventType,
    eventId,
    occurredAt: new Date().toISOString(),
    accountId,
    payload: {
      ...extra,
      values,
    },
  };

  try {
    await enqueueRun({
      workflowId: trigger.workflowId,
      triggerNodeId: trigger.nodeId,
      event,
    });
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "microsoft-excel.poll.enqueue_failed",
        triggerId: trigger.id,
        eventId,
        error: (err as Error).message,
      }),
    );
  }
}

async function persistSnapshot(input: {
  triggerId: string;
  config: Record<string, unknown>;
  snapshot: ExcelRowSnapshot;
  now: number;
}): Promise<void> {
  await triggerResourcesRepo.updateConfig(input.triggerId, {
    ...input.config,
    snapshot: input.snapshot,
    polling: {
      lastPolledAt: new Date(input.now).toISOString(),
    },
  });
}

export const microsoftExcelPollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "microsoft-excel" &&
    (trigger.eventType === "new_row" ||
      trigger.eventType === "new_table_row"),
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};
