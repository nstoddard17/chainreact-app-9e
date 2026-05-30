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
import { worksheetsList } from "../../api/worksheetsList";
import { ExcelNewRowConfigSchema } from "../newRow/schema";
import { ExcelNewTableRowConfigSchema } from "../newTableRow/schema";
import { ExcelUpdatedRowConfigSchema } from "../updatedRow/schema";
import { ExcelUpdatedTableRowConfigSchema } from "../updatedTableRow/schema";
import { ExcelNewWorksheetConfigSchema } from "../newWorksheet/schema";
import {
  buildSnapshot,
  buildWorksheetListSnapshot,
  findChangedKeys,
  findNewKeys,
  findNewWorksheets,
  type ExcelRowSnapshot,
  type ExcelWorksheetListSnapshot,
} from "./snapshot";

/**
 * Shared polling handler for the five Excel polling triggers.
 *
 * One handler instance covers `new_row`, `new_table_row`, `updated_row`,
 * `updated_table_row`, and `new_worksheet`. All five exercise the same
 * snapshot/diff/enqueue path with two differing details:
 *   - which Graph endpoint feeds the current state.
 *   - which snapshot helper (findNewKeys / findChangedKeys / findNewWorksheets)
 *     computes the diff.
 *
 * Per-tick flow:
 *   1. Parse the trigger row's config through the event-type-specific
 *      schema.
 *   2. Guard: snapshot must already exist (activation seeded it; absent
 *      snapshot means activation failed without aborting — defensive
 *      log + skip rather than re-seed silently).
 *   3. Resolve integration → providerAccountId.
 *   4. Fetch current state from Graph.
 *   5. Diff `current` vs `previousSnapshot` — emit one TriggerEvent per
 *      new/changed entry, dedup-keyed on
 *      `<provider>:<workflowId>:<nodeId>:<eventType>:<key>` so a
 *      snapshot regression would still dedupe at the engine boundary.
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

const SUPPORTED_EVENT_TYPES = new Set([
  "new_row",
  "new_table_row",
  "updated_row",
  "updated_table_row",
  "new_worksheet",
]);

async function poll(ctx: PollingHandlerContext): Promise<void> {
  const { trigger } = ctx;

  if (trigger.provider !== "microsoft-excel") return;
  if (!SUPPORTED_EVENT_TYPES.has(trigger.eventType)) return;

  const integration = await getActiveForExecution(trigger.workflowAccountId!,
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
  const providerAccountId = integration.providerAccountId;

  switch (trigger.eventType) {
    case "new_row":
      await pollWorksheet({ trigger, providerAccountId, now: ctx.now, mode: "new" });
      return;
    case "updated_row":
      await pollWorksheet({
        trigger,
        providerAccountId,
        now: ctx.now,
        mode: "updated",
      });
      return;
    case "new_table_row":
      await pollTable({ trigger, providerAccountId, now: ctx.now, mode: "new" });
      return;
    case "updated_table_row":
      await pollTable({ trigger, providerAccountId, now: ctx.now, mode: "updated" });
      return;
    case "new_worksheet":
      await pollWorksheetList({ trigger, providerAccountId, now: ctx.now });
      return;
  }
}

async function pollWorksheet(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  providerAccountId: string;
  now: number;
  mode: "new" | "updated";
}): Promise<void> {
  const { trigger, providerAccountId, now, mode } = input;
  const eventType = mode === "new" ? "new_row" : "updated_row";
  const schema =
    mode === "new" ? ExcelNewRowConfigSchema : ExcelUpdatedRowConfigSchema;
  const config = schema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "microsoft-excel.poll.no_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        eventType,
      }),
    );
    return;
  }

  const range = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "microsoft-excel",
    providerAccountId,
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
  const diff =
    mode === "new"
      ? findNewKeys(previous, current)
      : findChangedKeys(previous, current);

  for (const entry of diff) {
    await emitEvent({
      trigger,
      providerAccountId,
      eventType,
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
  providerAccountId: string;
  now: number;
  mode: "new" | "updated";
}): Promise<void> {
  const { trigger, providerAccountId, now, mode } = input;
  const eventType = mode === "new" ? "new_table_row" : "updated_table_row";
  const schema =
    mode === "new"
      ? ExcelNewTableRowConfigSchema
      : ExcelUpdatedTableRowConfigSchema;
  const config = schema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "microsoft-excel.poll.no_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        eventType,
      }),
    );
    return;
  }

  const rows = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "microsoft-excel",
    providerAccountId,
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
  const diff =
    mode === "new"
      ? findNewKeys(previous, current)
      : findChangedKeys(previous, current);

  for (const entry of diff) {
    await emitEvent({
      trigger,
      providerAccountId,
      eventType,
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

async function pollWorksheetList(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  providerAccountId: string;
  now: number;
}): Promise<void> {
  const { trigger, providerAccountId, now } = input;
  const config = ExcelNewWorksheetConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "microsoft-excel.poll.no_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        eventType: "new_worksheet",
      }),
    );
    return;
  }

  const sheets = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "microsoft-excel",
    providerAccountId,
    apiCall: (accessToken) =>
      worksheetsList({
        accessToken,
        workbookId: config.workbookId,
      }),
  });

  const currentSheets = sheets.filter(
    (s): s is { id: string; name: string; position?: number; visibility?: string } =>
      typeof s.name === "string" && s.name.length > 0,
  );
  const currentNames = currentSheets.map((s) => s.name);

  const previous: ExcelWorksheetListSnapshot = config.snapshot;
  const newNames = findNewWorksheets(previous, currentNames);

  for (const name of newNames) {
    const sheet = currentSheets.find((s) => s.name === name);
    await emitEvent({
      trigger,
      providerAccountId,
      eventType: "new_worksheet",
      key: name,
      // No row values for a worksheet — payload carries the metadata
      // fields below instead. Passing an empty values array keeps the
      // emitEvent shape consistent across triggers.
      values: [],
      extra: {
        workbookId: config.workbookId,
        worksheetName: name,
        worksheetId: sheet?.id ?? null,
        position: sheet?.position ?? null,
      },
    });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: buildWorksheetListSnapshot(currentNames),
    now,
  });
}

async function emitEvent(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  providerAccountId: string;
  eventType:
    | "new_row"
    | "new_table_row"
    | "updated_row"
    | "updated_table_row"
    | "new_worksheet";
  key: string;
  values: ReadonlyArray<unknown>;
  extra: Record<string, unknown>;
}): Promise<void> {
  const { trigger, providerAccountId, eventType, key, values, extra } = input;

  // Synthetic event id ties to the trigger + entry key so a snapshot
  // regression (e.g. workflow reactivated and pre-existing entries
  // reappear as "new") would still dedupe at the engine boundary.
  const eventId = `microsoft-excel:${trigger.workflowId}:${trigger.nodeId}:${eventType}:${key}`;

  const event: TriggerEvent = {
    provider: "microsoft-excel",
    eventType,
    eventId,
    occurredAt: new Date().toISOString(),
    providerAccountId,
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
  snapshot: ExcelRowSnapshot | ExcelWorksheetListSnapshot;
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
    SUPPORTED_EVENT_TYPES.has(trigger.eventType),
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};
