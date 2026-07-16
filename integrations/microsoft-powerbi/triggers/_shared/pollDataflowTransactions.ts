import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  dataflowTransactionsList,
  type PowerBiDataflowTransaction,
} from "../../api/dataflows/dataflowTransactionsList";
import { mergeSeenIds } from "./snapshot";
import { PowerBiDataflowRefreshCompletedConfigSchema } from "../dataflowRefreshCompleted/schema";
import { PowerBiDataflowRefreshFailedConfigSchema } from "../dataflowRefreshFailed/schema";
import { PowerBiDataflowRefreshCanceledConfigSchema } from "../dataflowRefreshCanceled/schema";
import {
  emitEvent,
  persistSnapshot,
  statusEquals,
  warnMissingSnapshot,
  type PowerBiPollInput,
} from "./pollShared";

/**
 * The dataflow-transaction domain: the three `dataflow_refresh_*` triggers'
 * status predicate and their single poll function.
 *
 * `matchingTransactions` is exported because activation and polling MUST
 * agree on what "matches this trigger" means — `activate.ts` seeds the
 * snapshot with exactly the transaction ids this poll function would emit
 * for, so a divergence would either replay history on the first tick or
 * swallow it.
 *
 * Diff shape and snapshot contract mirror the sibling job-lifecycle
 * modules (see `pollSemanticModelRefreshes.ts` for the full rationale):
 * only ids that ALREADY matched the terminal status enter the snapshot, so
 * an in-flight transaction still fires when it settles.
 */

/** Dataflow transactions have no server-side paging; this is a client slice. */
const DATAFLOW_TRANSACTIONS_TOP = 20;

export type DataflowRefreshEventType =
  | "dataflow_refresh_completed"
  | "dataflow_refresh_failed"
  | "dataflow_refresh_canceled";

/**
 * Terminal `DataflowTransaction.status` each dataflow trigger watches for.
 *
 * NOTE: research.md §5.5 flags this enum as UNVERIFIED — the reference
 * types `status` as a plain string and never enumerates its values. These
 * are the observed/documented values (`Success` / `Failed`, plus the
 * in-flight `InProgress`); `Cancelled` is inferred from the Cancel
 * Dataflow Transaction endpoint's existence and is NOT confirmed on a
 * fetched Learn page. Matching is case-insensitive so a casing change on
 * the provider side can't silently break the trigger.
 */
const DATAFLOW_TARGET_STATUS: Record<DataflowRefreshEventType, string> = {
  dataflow_refresh_completed: "Success",
  dataflow_refresh_failed: "Failed",
  dataflow_refresh_canceled: "Cancelled",
};

/** Dataflow transactions in this trigger's terminal status, newest first. */
export function matchingTransactions(
  transactions: readonly PowerBiDataflowTransaction[],
  eventType: DataflowRefreshEventType,
): PowerBiDataflowTransaction[] {
  const target = DATAFLOW_TARGET_STATUS[eventType];
  return transactions.filter((t) => statusEquals(t.status, target));
}

const DATAFLOW_SCHEMAS = {
  dataflow_refresh_completed: PowerBiDataflowRefreshCompletedConfigSchema,
  dataflow_refresh_failed: PowerBiDataflowRefreshFailedConfigSchema,
  dataflow_refresh_canceled: PowerBiDataflowRefreshCanceledConfigSchema,
} as const;

export async function pollDataflowTransactions(
  input: PowerBiPollInput & { eventType: DataflowRefreshEventType },
): Promise<void> {
  const { trigger, providerAccountId, now, eventType } = input;
  const config = DATAFLOW_SCHEMAS[eventType].parse(trigger.config);

  if (!config.snapshot) {
    warnMissingSnapshot(trigger, eventType);
    return;
  }

  const { transactions } = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      dataflowTransactionsList({
        accessToken,
        groupId: config.workspaceId,
        dataflowId: config.dataflowId,
        top: DATAFLOW_TRANSACTIONS_TOP,
      }),
  });

  const matching = matchingTransactions(transactions, eventType);
  const seen = new Set(config.snapshot.seenTransactionIds);

  for (const transaction of matching) {
    if (seen.has(transaction.id)) continue;
    seen.add(transaction.id);

    await emitEvent({
      trigger,
      providerAccountId,
      eventType,
      key: transaction.id,
      payload: {
        workspaceId: config.workspaceId,
        dataflowId: config.dataflowId,
        transactionId: transaction.id,
        status: transaction.status,
        startTime: transaction.startTime,
        endTime: transaction.endTime,
        refreshType: transaction.refreshType,
      },
    });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: {
      seenTransactionIds: mergeSeenIds(
        config.snapshot.seenTransactionIds,
        matching.map((t) => t.id),
      ),
      updatedAt: new Date().toISOString(),
    },
    now,
  });
}
