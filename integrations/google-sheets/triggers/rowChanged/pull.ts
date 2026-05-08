import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { valuesGet } from "../../api/valuesGet";
import { normalize } from "./normalize";

/**
 * Pull the row-count delta for an inbound notification.
 *
 * Slice 5 Batch 1 — added-only detection:
 *   1. Read stored `lastRowCount` from `trigger_resources.config`.
 *   2. Call `values.get` on the configured `<sheetName>!A:Z` range.
 *   3. If `currentRowCount > lastRowCount`: emit one TriggerEvent per
 *      new row at indices [lastRowCount, currentRowCount). Each event's
 *      payload includes the row's values, the 1-indexed rowIndex, and
 *      the headers if `headerRow=true` was set at activate.
 *   4. Persist `lastRowCount = currentRowCount` regardless of direction
 *      (including when the count went DOWN — someone deleted rows).
 *      Updating-down is critical: without it, a delete-then-readd cycle
 *      would silently miss the readd because the snapshot would still
 *      reflect the pre-delete count.
 *   5. If the count went down or stayed the same: emit zero events. V2
 *      Batch 1 does not detect updated/removed rows; the row-count
 *      semantic is honest about what it can know cheaply.
 *
 * Why values.get instead of Drive changes.list (which Drive uses for
 * its file_changed trigger): Sheets' notification fires for ANY change
 * to the spreadsheet — formatting, comments, row changes. Drive's
 * `changes.list` would tell us "the spreadsheet changed" but NOT what
 * inside it changed. We have to call values.get anyway to surface the
 * actual rows. So skipping changes.list is a pure win — one fewer API
 * call per notification.
 *
 * The Drive `pageToken` we stored at activate is unused here. It's
 * persisted for potential future polling-mode parity; harmless to keep.
 */
export interface PullResult {
  events: TriggerEvent[];
  resyncRequired: boolean;
}

export async function pull(
  trigger: TriggerResourceRecord,
): Promise<PullResult> {
  const config = trigger.config as {
    spreadsheetId?: string;
    sheetName?: string;
    headerRow?: boolean;
    lastRowCount?: number;
  };

  if (!config.spreadsheetId || !config.sheetName) {
    return { events: [], resyncRequired: true };
  }
  // lastRowCount being undefined means activate didn't run or stored
  // partial state — treat as a resync request rather than emit a flood
  // of "added" events for every existing row.
  if (config.lastRowCount === undefined) {
    return { events: [], resyncRequired: true };
  }

  const integration = await getActiveForExecution(
    trigger.userId,
    trigger.provider,
    trigger.accountId,
  );
  if (!integration) {
    return { events: [], resyncRequired: false };
  }

  const result = await refreshAndRetry({
    userId: integration.userId,
    provider: "google-sheets",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      valuesGet({
        accessToken,
        spreadsheetId: config.spreadsheetId!,
        range: `${config.sheetName}!A:Z`,
      }),
  });

  const values = (result.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
  const currentRowCount = values.length;
  const lastRowCount = config.lastRowCount;

  // Compute headers once per pull so every emitted event sees the same
  // snapshot. Null when headerRow=false OR the sheet has no row 1.
  const headers =
    config.headerRow === true && values.length > 0 ? values[0]! : null;

  const events: TriggerEvent[] = [];
  if (currentRowCount > lastRowCount) {
    const occurredAt = new Date().toISOString();
    for (let i = lastRowCount; i < currentRowCount; i++) {
      events.push(
        normalize(
          {
            // 1-indexed spreadsheet row number = array index + 1.
            rowIndex: i + 1,
            rowValues: values[i] ?? [],
            occurredAt,
          },
          {
            accountId: integration.providerAccountId,
            spreadsheetId: config.spreadsheetId,
            sheetName: config.sheetName,
            headers,
          },
        ),
      );
    }
  } else if (currentRowCount < lastRowCount) {
    // Row count decreased — someone deleted rows. Slice 5 Batch 1 does
    // not detect or emit removed-row events; we just refresh the
    // snapshot so future appends fire correctly.
    console.debug(
      JSON.stringify({
        event: "sheets.pull.row_count_decreased",
        triggerId: trigger.id,
        previous: lastRowCount,
        current: currentRowCount,
      }),
    );
  }

  // Always persist the new count, even when it went down or stayed
  // equal. Without this, delete-then-readd cycles would silently miss
  // the readd.
  if (currentRowCount !== lastRowCount) {
    await triggerResourcesRepo.updateConfig(trigger.id, {
      ...config,
      lastRowCount: currentRowCount,
    });
  }

  return { events, resyncRequired: false };
}
