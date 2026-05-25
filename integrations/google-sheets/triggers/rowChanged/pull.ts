import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { valuesGet } from "../../api/valuesGet";
import {
  buildBoundedSnapshot,
  findAdded,
  findRemoved,
  findUpdated,
  type BoundedSnapshot,
  type DiffEntry,
} from "../_shared/snapshot";
import { normalize, type SheetsChangeKind } from "./normalize";

/**
 * Pull the row delta for an inbound notification.
 *
 * Two paths, branched on the trigger's `changeKinds` config:
 *
 *   1. **Legacy added-only fast path** (Slice 5 baseline). Used when
 *      `changeKinds = ["added"]` (default) OR an existing trigger
 *      row predates Sheets 2.3 and has no `changeKinds` field. Reads
 *      the row COUNT, emits added events for the tail-of-sheet, and
 *      persists `lastRowCount` in `trigger_resources.config`. Same
 *      eventId format as Slice 5 — preserves `webhook_event_dedup`
 *      backwards-compat.
 *
 *   2. **Snapshot-diff path** (Sheets 2.3). Used when `changeKinds`
 *      includes `"updated"` or `"removed"`. Reads `values.get`,
 *      builds a bounded snapshot of the windowed data rows, and
 *      diffs against the previously-persisted snapshot. Emits
 *      added / updated / removed events per the `changeKinds`
 *      array. EventId carries the changeKind infix to prevent
 *      collisions with the legacy added-only format. Persists the
 *      new snapshot after emitting; failure to persist propagates
 *      (subsequent retry re-pulls and dedup catches replayed
 *      events).
 *
 * Why values.get instead of Drive changes.list (which Drive uses for
 * its file_changed trigger): Sheets' notification fires for ANY change
 * to the spreadsheet — formatting, comments, row changes. Drive's
 * `changes.list` would tell us "the spreadsheet changed" but NOT what
 * inside it changed. We have to call values.get anyway to surface the
 * actual rows.
 */
export interface PullResult {
  events: TriggerEvent[];
  resyncRequired: boolean;
}

interface SheetsRowChangedConfig {
  spreadsheetId?: string;
  sheetName?: string;
  headerRow?: boolean;
  lastRowCount?: number;
  changeKinds?: SheetsChangeKind[];
  snapshotRowLimit?: number;
  keyColumn?: string | null;
  snapshot?: BoundedSnapshot;
}

export async function pull(
  trigger: TriggerResourceRecord,
): Promise<PullResult> {
  const config = trigger.config as SheetsRowChangedConfig;

  if (!config.spreadsheetId || !config.sheetName) {
    return { events: [], resyncRequired: true };
  }

  const changeKinds: SheetsChangeKind[] = config.changeKinds ?? ["added"];
  const isExtended =
    changeKinds.includes("updated") || changeKinds.includes("removed");

  if (isExtended) {
    return pullSnapshotMode(trigger, config, changeKinds);
  }
  return pullAddedOnly(trigger, config);
}

// ──────────────────────────────────────────────────────────────────
// Path 1: Slice 5 added-only count-delta fast path.
// ──────────────────────────────────────────────────────────────────
async function pullAddedOnly(
  trigger: TriggerResourceRecord,
  config: SheetsRowChangedConfig,
): Promise<PullResult> {
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
            spreadsheetId: config.spreadsheetId!,
            sheetName: config.sheetName!,
            headers,
          },
          "added",
          { useLegacyEventId: true },
        ),
      );
    }
  } else if (currentRowCount < lastRowCount) {
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

// ──────────────────────────────────────────────────────────────────
// Path 2: Sheets 2.3 snapshot-diff path for extended changeKinds.
// ──────────────────────────────────────────────────────────────────
async function pullSnapshotMode(
  trigger: TriggerResourceRecord,
  config: SheetsRowChangedConfig,
  changeKinds: SheetsChangeKind[],
): Promise<PullResult> {
  // Snapshot must already exist (activate seeds it). Absent snapshot
  // means activate failed without aborting OR a config drift between
  // versions — return resyncRequired so the orchestrator re-activates
  // rather than silently emitting events from a missing baseline.
  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "sheets.pull.no_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
      }),
    );
    return { events: [], resyncRequired: true };
  }

  if (config.snapshotRowLimit === undefined) {
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

  const rows = (result.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
  const headerRow = config.headerRow === true;
  const headers = headerRow && rows.length > 0 ? rows[0]! : null;

  // Build new snapshot — overflow propagates if the sheet grew past
  // 2x the cap since activation. Subsequent retries will keep failing;
  // the workflow author must raise snapshotRowLimit explicitly.
  const built = buildBoundedSnapshot({
    rows,
    headerRow,
    snapshotRowLimit: config.snapshotRowLimit,
    keyColumn: config.keyColumn ?? null,
  });

  // Structured warning for keyColumn collisions — same row identity
  // problem the audit + plan called out. Last-write-wins behavior is
  // pinned by the helper.
  if (built.duplicateKeyCount > 0) {
    console.warn(
      JSON.stringify({
        event: "sheets.pull.keycolumn_duplicate",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        keyColumn: config.keyColumn,
        duplicateKeyCount: built.duplicateKeyCount,
      }),
    );
  }

  const previousSnapshot = config.snapshot;
  const newSnapshot = built.snapshot;

  const occurredAt = new Date().toISOString();
  const context = {
    accountId: integration.providerAccountId,
    spreadsheetId: config.spreadsheetId!,
    sheetName: config.sheetName!,
    headers,
    keyColumn: config.keyColumn ?? null,
  };

  const events: TriggerEvent[] = [];

  if (changeKinds.includes("added")) {
    const added = findAdded(previousSnapshot, newSnapshot, built.entries);
    for (const entry of added) {
      events.push(buildEvent("added", entry, context, occurredAt));
    }
  }

  if (changeKinds.includes("updated")) {
    const updated = findUpdated(previousSnapshot, newSnapshot, built.entries);
    for (const entry of updated) {
      events.push(buildEvent("updated", entry, context, occurredAt));
    }
  }

  if (changeKinds.includes("removed")) {
    const removed = findRemoved(previousSnapshot, newSnapshot);
    for (const entry of removed) {
      events.push(buildEvent("removed", entry, context, occurredAt));
    }
  }

  // Persist the new snapshot. Failure propagates — receive route
  // returns 5xx and Google retries; the next attempt will re-build
  // the snapshot and re-emit events (dedup catches them).
  // `lastRowCount` is kept in sync so downstream code reading the
  // legacy field still sees a sane value.
  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    lastRowCount: rows.length,
    snapshot: newSnapshot,
  });

  return { events, resyncRequired: false };
}

function buildEvent(
  changeKind: SheetsChangeKind,
  entry: DiffEntry,
  context: {
    accountId: string;
    spreadsheetId: string;
    sheetName: string;
    headers: ReadonlyArray<unknown> | null;
    keyColumn: string | null;
  },
  occurredAt: string,
): TriggerEvent {
  return normalize(
    {
      rowIndex: entry.rowIndex,
      rowValues: entry.rowValues,
      rowKey: entry.key,
      rowHash: entry.hash,
      occurredAt,
    },
    context,
    changeKind,
    { useLegacyEventId: false },
  );
}
