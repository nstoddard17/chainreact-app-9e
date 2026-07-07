import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { getStateForDispatch } from "@/repositories/workflows";
import * as dedup from "@/repositories/webhookEventDedup";
import { enqueueRun } from "@/services/execution/enqueue";
import { DropboxConflictError } from "@/integrations/_shared/dropbox/errors";
import { filesListFolder } from "@/integrations/_shared/dropbox/api/filesListFolder";
import { filesListFolderGetLatestCursor } from "@/integrations/_shared/dropbox/api/filesListFolderGetLatestCursor";
import { normalizeNewFile, type DropboxFileEntry } from "./normalize";
import { DropboxNewFileConfigSchema, type DropboxNewFileConfig } from "./schema";

/**
 * Dropbox `new_file` cursor reconciliation — Slice 3.DROPBOX-5.
 *
 * Called by the global `/api/webhooks/dropbox` route with the set of
 * changed Dropbox account ids from a verified notification
 * (`{ list_folder: { accounts: [...] } }`). Dropbox tells us WHICH account
 * changed, not which file — so we reconcile each affected trigger row's
 * stored cursor via `list_folder/continue`, diff the delta, and dispatch
 * one run per new file.
 *
 * Per affected trigger row (`(dropbox, new_file)` whose seeded
 * `snapshot.accountId` is in the changed set):
 *   1. Resolve the user's active Dropbox integration (token + live
 *      account). No active integration → skip.
 *   2. Walk `list_folder/continue` from the stored cursor (paginating
 *      `has_more`). On a `reset` 409 (`DropboxConflictError` summary
 *      `reset…`) re-seed via `get_latest_cursor` and STOP — do NOT replay
 *      (same no-replay rule as activation / Gmail's stale-cursor handling).
 *   3. For each `.tag === "file"` entry under the configured `path`
 *      (folders + deletes ignored): state-gate → dedup → enqueue.
 *   4. Persist the advanced cursor back to `trigger_resources.config`.
 *
 * **Dedup** is ROW-scoped (`${triggerId}:${fileId}:${rev}`) via
 * `webhook_event_dedup`, NOT global per file — two workflows watching the
 * same folder must each fire. The cursor advance is the PRIMARY dedup
 * across repeated webhook deliveries (a second notification reconciles
 * from the already-advanced cursor and sees nothing); the dedup table is
 * the secondary net for the race window before the cursor persists. Dedup
 * is fail-CLOSED (an outage skips the file rather than risk a double-fire,
 * matching Gmail's polling dedup — `new_file` has no Q4 backstop).
 *
 * Errors from one row / one file are logged (sanitized — Dropbox error
 * surfaces never carry paths/tokens/bytes) and skipped; one failure never
 * aborts the batch.
 */

const PROVIDER = "dropbox";
const EVENT_TYPE = "new_file";

export interface ReconcileResult {
  /** Trigger rows reconciled (matched a changed account). */
  reconciled: number;
  /** Runs enqueued across all reconciled rows. */
  dispatched: number;
}

export async function reconcileDropboxAccounts(
  accountIds: readonly string[],
): Promise<ReconcileResult> {
  if (accountIds.length === 0) return { reconciled: 0, dispatched: 0 };
  const changed = new Set(accountIds);

  const rows = await triggerResourcesRepo.listForDispatch(PROVIDER, EVENT_TYPE);

  let reconciled = 0;
  let dispatched = 0;
  for (const row of rows) {
    let config: DropboxNewFileConfig;
    try {
      config = DropboxNewFileConfigSchema.parse(row.config);
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "dropbox.reconcile.bad_config",
          triggerId: row.id,
          workflowId: row.workflowId,
          error: (err as Error).message,
        }),
      );
      continue;
    }

    const storedAccount = config.snapshot?.accountId;
    if (!config.snapshot || !storedAccount || !changed.has(storedAccount)) {
      continue;
    }

    try {
      dispatched += await reconcileTriggerRow(row, config);
      reconciled += 1;
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "dropbox.reconcile.row_failed",
          triggerId: row.id,
          workflowId: row.workflowId,
          // (err as Error).message is sanitized at the Dropbox transport
          // layer — only carries the error_summary tag, never path/token.
          error: (err as Error).message,
        }),
      );
      continue;
    }
  }

  return { reconciled, dispatched };
}

async function reconcileTriggerRow(
  row: TriggerResourceRecord,
  config: DropboxNewFileConfig,
): Promise<number> {
  // Integrations are ACCOUNT-owned (V2 account-model cutover): the lookup
  // must use the workflow's account id, not the connecting user's id — every
  // other pull (Gmail / Sheets / Drive / Calendar / Docs) and the
  // refreshAndRetry calls below already do. Passing row.userId here made the
  // lookup always miss (user id ≠ account id) and reconciliation silently
  // dispatched nothing.
  const integration = await getActiveForExecution(
    row.workflowAccountId!,
    PROVIDER,
    null,
  );
  if (!integration) {
    console.warn(
      JSON.stringify({
        event: "dropbox.reconcile.no_integration",
        triggerId: row.id,
        workflowId: row.workflowId,
        userId: row.userId,
      }),
    );
    return 0;
  }
  const providerAccountId = integration.providerAccountId;

  let cursor = config.snapshot!.cursor;
  const entries: DropboxFileEntry[] = [];
  let cursorReset = false;

  while (true) {
    let page;
    try {
      page = await refreshAndRetry({
        accountId: row.workflowAccountId!,
        provider: PROVIDER,
        providerAccountId,
        apiCall: (accessToken) => filesListFolder({ accessToken, cursor }),
      });
    } catch (err) {
      if (err instanceof DropboxConflictError && err.summary.startsWith("reset")) {
        // Invalid cursor — re-seed at the current state and DO NOT replay
        // the gap (first-poll-miss parity). Next notification continues
        // cleanly from here.
        const reseed = await refreshAndRetry({
          accountId: row.workflowAccountId!,
          provider: PROVIDER,
          providerAccountId,
          apiCall: (accessToken) =>
            filesListFolderGetLatestCursor({
              accessToken,
              path: config.path,
              recursive: config.recursive,
            }),
        });
        console.warn(
          JSON.stringify({
            event: "dropbox.reconcile.cursor_reset",
            triggerId: row.id,
            workflowId: row.workflowId,
          }),
        );
        cursor = reseed.cursor;
        cursorReset = true;
        break;
      }
      throw err;
    }

    for (const e of page.entries) entries.push(e as DropboxFileEntry);
    cursor = page.cursor;
    if (!page.has_more) break;
  }

  let dispatched = 0;
  if (!cursorReset) {
    for (const entry of entries) {
      // Only new/changed FILE additions — ignore folders + deletes +
      // metadata-only changes.
      if (entry[".tag"] !== "file") continue;
      if (!isUnderConfiguredPath(entry, config.path)) continue;
      try {
        dispatched += await dispatchOneFile(row, providerAccountId, entry);
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "dropbox.reconcile.entry_failed",
            triggerId: row.id,
            workflowId: row.workflowId,
            error: (err as Error).message,
          }),
        );
      }
    }
  }

  await triggerResourcesRepo.updateConfig(row.id, {
    ...config,
    snapshot: {
      cursor,
      providerAccountId,
      capturedAt: cursorReset
        ? new Date().toISOString()
        : config.snapshot!.capturedAt,
    },
  });

  return dispatched;
}

async function dispatchOneFile(
  row: TriggerResourceRecord,
  providerAccountId: string,
  entry: DropboxFileEntry,
): Promise<number> {
  // State-gate first (cheap; avoids dedup writes for inactive workflows —
  // and the cursor still advances so files arriving while inactive are not
  // replayed on re-activation).
  const state = await getStateForDispatch(row.workflowId);
  if (state !== "active") {
    console.debug(
      JSON.stringify({
        event: "dropbox.reconcile.dropped_inactive",
        workflowId: row.workflowId,
        state,
      }),
    );
    return 0;
  }

  // Row-scoped dedup key — NOT global per file, so two workflows watching
  // the same folder each fire. Fail-CLOSED on dedup outage.
  const dedupKey = `${row.id}:${entry.id ?? entry.path_lower ?? "unknown"}:${entry.rev ?? ""}`;
  let fresh = false;
  try {
    const r = await dedup.markSeen(PROVIDER, dedupKey);
    fresh = r.fresh;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "dropbox.reconcile.dedup_outage",
        triggerId: row.id,
        error: (err as Error).message,
      }),
    );
    return 0; // fail-closed
  }
  if (!fresh) return 0;

  const event = normalizeNewFile({ entry, providerAccountId });
  await enqueueRun({
    workflowId: row.workflowId,
    triggerNodeId: row.nodeId,
    event,
  });
  return 1;
}

/**
 * Defensive path scope check. The seeded cursor is already scoped to
 * `path`/`recursive`, so the delta should only carry in-scope entries —
 * this guards against any cross-scope leakage. Root (`""`) matches all.
 */
function isUnderConfiguredPath(
  entry: DropboxFileEntry,
  path: string,
): boolean {
  if (path === "") return true;
  const entryPath = (entry.path_lower ?? entry.path_display ?? "").toLowerCase();
  const base = path.toLowerCase();
  return entryPath === base || entryPath.startsWith(base.endsWith("/") ? base : `${base}/`);
}
