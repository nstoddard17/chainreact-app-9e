import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  refreshesList,
  type PowerBiRefreshHistoryEntry,
} from "../../api/datasets/refreshesList";
import { mergeSeenIds } from "./snapshot";
import { PowerBiSemanticModelRefreshCompletedConfigSchema } from "../semanticModelRefreshCompleted/schema";
import { PowerBiSemanticModelRefreshFailedConfigSchema } from "../semanticModelRefreshFailed/schema";
import { PowerBiSemanticModelRefreshCanceledConfigSchema } from "../semanticModelRefreshCanceled/schema";
import {
  emitEvent,
  persistSnapshot,
  statusEquals,
  warnMissingSnapshot,
  type PowerBiPollInput,
} from "./pollShared";

/**
 * The semantic-model refresh domain: the three `semantic_model_refresh_*`
 * triggers' status predicates and their single poll function.
 *
 * The predicates are exported because activation and polling MUST agree on
 * what "matches this trigger" means — `activate.ts` seeds the snapshot with
 * exactly the keys `pollSemanticModelRefreshes` would emit for, so a
 * divergence would either replay history on the first tick or swallow it.
 *
 * Shape (mirrored by the sibling job-lifecycle modules):
 *   1. Parse the trigger row's config through the event-type's schema.
 *   2. Guard on the seeded snapshot (activation seeded it; a missing
 *      snapshot means activation failed without aborting — log + skip
 *      rather than silently re-seed, which would swallow every refresh that
 *      completed in the gap).
 *   3. Read the provider's bounded refresh history.
 *   4. Keep only the entries whose status equals THIS trigger's terminal
 *      status, and emit for the ones whose durable provider id isn't in
 *      the seen list yet.
 *   5. Merge the matching ids into the snapshot and persist.
 *
 * Why the snapshot stores only ids that already MATCHED the target status:
 * an in-flight refresh must still fire when it finishes, so it must not be
 * seeded as "seen" while its status is `Unknown`. Entries that settle on a
 * DIFFERENT terminal status simply never enter this trigger's snapshot —
 * they can't ever match, and they age out of the provider's own history
 * window.
 */

/** Refresh history page size — Power BI retains ≤60 entries / 7 days. */
const REFRESH_HISTORY_TOP = 20;

export type SemanticModelRefreshEventType =
  | "semantic_model_refresh_completed"
  | "semantic_model_refresh_failed"
  | "semantic_model_refresh_canceled";

/**
 * Terminal `Refresh.status` each refresh trigger watches for
 * (research.md §2.1).
 *
 * NOTE: the provider spells the cancelled state `Cancelled` (British)
 * while the product event type is `semantic_model_refresh_canceled`
 * (American). The mismatch is intentional — the event type is a V2
 * product identifier and must stay stable, so the spelling is reconciled
 * here rather than by renaming either side.
 */
const REFRESH_TARGET_STATUS: Record<SemanticModelRefreshEventType, string> = {
  semantic_model_refresh_completed: "Completed",
  semantic_model_refresh_failed: "Failed",
  semantic_model_refresh_canceled: "Cancelled",
};

/**
 * Durable dedup key for a refresh-history entry.
 *
 * `requestId` is the stable provider id (research.md §3.6) and is used
 * whenever present. Rare portal/scheduled refreshes come back WITHOUT a
 * requestId; those fall back to `${startTime}|${refreshType}`, which is
 * durable for a given history entry (both values are fixed once the entry
 * exists). This stays dedup-safe because the diff is a set-difference
 * against the snapshot — the key is never compared to "now", so it is not
 * a volatile timestamp key.
 */
function refreshEntryKey(entry: PowerBiRefreshHistoryEntry): string {
  if (entry.refreshRequestId) return entry.refreshRequestId;
  return `${entry.startTime ?? "unknown"}|${entry.refreshType}`;
}

/** Refresh-history entries in this trigger's terminal status, newest first. */
export function matchingRefreshEntries(
  entries: readonly PowerBiRefreshHistoryEntry[],
  eventType: SemanticModelRefreshEventType,
): PowerBiRefreshHistoryEntry[] {
  const target = REFRESH_TARGET_STATUS[eventType];
  return entries.filter((e) => statusEquals(e.status, target));
}

/** Dedup keys for the refresh entries in this trigger's terminal status. */
export function matchingRefreshKeys(
  entries: readonly PowerBiRefreshHistoryEntry[],
  eventType: SemanticModelRefreshEventType,
): string[] {
  return matchingRefreshEntries(entries, eventType).map(refreshEntryKey);
}

const REFRESH_SCHEMAS = {
  semantic_model_refresh_completed:
    PowerBiSemanticModelRefreshCompletedConfigSchema,
  semantic_model_refresh_failed: PowerBiSemanticModelRefreshFailedConfigSchema,
  semantic_model_refresh_canceled:
    PowerBiSemanticModelRefreshCanceledConfigSchema,
} as const;

export async function pollSemanticModelRefreshes(
  input: PowerBiPollInput & { eventType: SemanticModelRefreshEventType },
): Promise<void> {
  const { trigger, providerAccountId, now, eventType } = input;
  const config = REFRESH_SCHEMAS[eventType].parse(trigger.config);

  if (!config.snapshot) {
    warnMissingSnapshot(trigger, eventType);
    return;
  }

  const { refreshes } = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      refreshesList({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        top: REFRESH_HISTORY_TOP,
      }),
  });

  const matching = matchingRefreshEntries(refreshes, eventType);
  const seen = new Set(config.snapshot.seenRequestIds);

  for (const entry of matching) {
    const key = refreshEntryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);

    const payload: Record<string, unknown> = {
      workspaceId: config.workspaceId,
      semanticModelId: config.semanticModelId,
      refreshRequestId: entry.refreshRequestId,
      refreshType: entry.refreshType,
      status: entry.status,
      startTime: entry.startTime,
      endTime: entry.endTime,
    };
    // Only the failure trigger surfaces the error code. It comes from the
    // wrapper's parse of `serviceExceptionJson` — the raw blob (provider
    // internals) never reaches the payload.
    if (eventType === "semantic_model_refresh_failed") {
      payload.errorCode = entry.errorCode;
    }

    await emitEvent({ trigger, providerAccountId, eventType, key, payload });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: {
      seenRequestIds: mergeSeenIds(
        config.snapshot.seenRequestIds,
        matching.map(refreshEntryKey),
      ),
      updatedAt: new Date().toISOString(),
    },
    now,
  });
}
