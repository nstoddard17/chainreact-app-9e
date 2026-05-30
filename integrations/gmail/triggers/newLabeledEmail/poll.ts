import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { enqueueRun } from "@/services/execution/enqueue";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import {
  HistoryListStaleCursorError,
  usersHistoryList,
} from "../../api/usersHistoryList";
import { usersGetProfile } from "../../api/usersGetProfile";
import { usersMessagesGet } from "../../api/usersMessagesGet";
import { advanceCheckpoint } from "../newEmail/historyState";
import {
  extractMessageEvents,
  type MessageEvent,
} from "../newEmail/extractMessageEvents";
import { checkAndMarkSeenLabeled } from "./dedup";
import { buildLabeledTriggerEvent } from "./messageHydration";
import { GmailNewLabeledEmailConfigSchema } from "./schema";

/**
 * Gmail new_labeled_email polling handler.
 *
 * Gmail 2.3 Commit 3. Same per-tick scaffolding as the new_email
 * polling handler (snapshot read → history pages walk →
 * stale-cursor re-snapshot → per-message hydration + enqueue →
 * checkpoint persist). Two material differences:
 *
 *   1. **Filter to labelsAdded events** whose `addedLabelIds`
 *      include `config.labelId`. `messagesAdded` + defensive
 *      `messages` entries are dropped (those are `new_email`'s
 *      sources).
 *
 *   2. **Per-trigger dedup key** via `checkAndMarkSeenLabeled`
 *      (prefix `labeled:`) — keeps the same Gmail message id from
 *      colliding with `new_email`'s dedup entry, so both triggers
 *      can fire independently on the same message.
 *
 * The hydration step uses `buildLabeledTriggerEvent` (mirror of
 * new_email's builder + two label-specific payload fields:
 * `labelAppliedId` echoes the workflow's configured label;
 * `labelsAdded` preserves the FULL set of labels added in the
 * originating history entry).
 *
 * Errors from any one message are logged and skipped; one bad
 * message does not abort the tick.
 */

const HANDLER_ID = "gmail/new_labeled_email";

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = GmailNewLabeledEmailConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "gmail.poll.no_snapshot",
        trigger: "new_labeled_email",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
      }),
    );
    return;
  }

  const integration = await getActiveForExecution(trigger.workflowAccountId!,
    "gmail",
    null,
  );
  if (!integration) {
    console.warn(
      JSON.stringify({
        event: "gmail.poll.no_integration",
        trigger: "new_labeled_email",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        userId: trigger.userId,
      }),
    );
    return;
  }
  const providerAccountId = integration.providerAccountId;

  let cursor = config.snapshot.historyId;

  // Walk all pages. Filter labelsAdded events whose addedLabelIds
  // include the configured labelId. Preserve the matching
  // addedLabelIds per event so hydration can echo them.
  const collected: Array<{ id: string; labelsAdded: readonly string[] }> = [];
  let pageToken: string | undefined;
  let latestApiHistoryId = cursor;
  let cursorReset = false;

  while (true) {
    let page;
    try {
      page = await refreshAndRetry({
        accountId: trigger.workflowAccountId!,
        provider: "gmail",
        providerAccountId,
        apiCall: async (accessToken) =>
          usersHistoryList({
            accessToken,
            startHistoryId: cursor,
            pageToken,
          }),
      });
    } catch (err) {
      if (err instanceof HistoryListStaleCursorError) {
        const profile = await refreshAndRetry({
          accountId: trigger.workflowAccountId!,
          provider: "gmail",
          providerAccountId,
          apiCall: async (accessToken) => usersGetProfile({ accessToken }),
        });
        console.warn(
          JSON.stringify({
            event: "gmail.poll.stale_cursor_resnapshot",
            trigger: "new_labeled_email",
            triggerId: trigger.id,
            workflowId: trigger.workflowId,
            previousHistoryId: cursor,
            newHistoryId: profile.historyId,
          }),
        );
        latestApiHistoryId = profile.historyId;
        cursorReset = true;
        break;
      }
      throw err;
    }

    latestApiHistoryId = page.historyId;
    for (const ev of extractMessageEvents(page.history)) {
      if (matchesLabel(ev, config.labelId)) {
        collected.push({
          id: ev.id,
          labelsAdded: ev.addedLabelIds ?? [],
        });
      }
    }

    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  // Collapse duplicates within this tick. When a message gets the
  // configured label applied multiple times in the same history
  // window (rare), we only fire once. Keep the first occurrence's
  // labelsAdded list — the per-history-entry semantics are the
  // workflow author's contract.
  const seenIds = new Set<string>();
  const uniqueCollected: Array<{ id: string; labelsAdded: readonly string[] }> =
    [];
  for (const c of collected) {
    if (!seenIds.has(c.id)) {
      seenIds.add(c.id);
      uniqueCollected.push(c);
    }
  }

  if (!cursorReset) {
    for (const entry of uniqueCollected) {
      try {
        await processOneMessage({
          trigger,
          providerAccountId,
          messageId: entry.id,
          labelAppliedId: config.labelId,
          labelsAdded: entry.labelsAdded,
        });
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "gmail.poll.message_failed",
            trigger: "new_labeled_email",
            triggerId: trigger.id,
            messageId: entry.id,
            error: (err as Error).message,
          }),
        );
      }
    }
  }

  // Persist updated config. Cursor advancement mirrors new_email —
  // advanceCheckpoint() takes the larger of stored vs api historyId.
  const newCursor = advanceCheckpoint({
    startHistoryId: cursor,
    apiHistoryId: latestApiHistoryId,
  });
  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    snapshot: {
      historyId: newCursor,
      capturedAt: cursorReset
        ? new Date().toISOString()
        : (config.snapshot?.capturedAt ?? new Date().toISOString()),
    },
    polling: {
      lastPolledAt: new Date(input.now).toISOString(),
    },
  });
}

function matchesLabel(ev: MessageEvent, configuredLabelId: string): boolean {
  if (ev.source !== "labelsAdded") return false;
  if (!ev.addedLabelIds) return false;
  return ev.addedLabelIds.includes(configuredLabelId);
}

async function processOneMessage(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  providerAccountId: string;
  messageId: string;
  labelAppliedId: string;
  labelsAdded: readonly string[];
}): Promise<void> {
  const { trigger, providerAccountId, messageId, labelAppliedId, labelsAdded } =
    input;

  const dedupOutcome = await checkAndMarkSeenLabeled(messageId);
  if (dedupOutcome.outage) return; // fail-closed (see dedup.ts)
  if (!dedupOutcome.fresh) return; // already processed in a prior tick

  const message = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "gmail",
    providerAccountId,
    apiCall: async (accessToken) => usersMessagesGet({ accessToken, messageId }),
  });

  const event = buildLabeledTriggerEvent({
    emailAddress: providerAccountId,
    message,
    labelAppliedId,
    labelsAdded,
  });

  await enqueueRun({
    workflowId: trigger.workflowId,
    triggerNodeId: trigger.nodeId,
    event,
  });
}

export const gmailNewLabeledEmailPollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "gmail" && trigger.eventType === "new_labeled_email",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};

// Internal exports for tests
export { matchesLabel };
