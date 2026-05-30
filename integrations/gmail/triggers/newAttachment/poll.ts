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
import { checkAndMarkSeenAttachment } from "./dedup";
import { buildAttachmentTriggerEvent } from "./messageHydration";
import { extractAttachmentMetadata } from "./extractAttachmentMetadata";
import { GmailNewAttachmentConfigSchema } from "./schema";

/**
 * Gmail new_attachment polling handler.
 *
 * Gmail 2.3 Commit 4. Same per-tick scaffolding as the new_email +
 * new_labeled_email polling handlers (snapshot read → history pages
 * walk → stale-cursor re-snapshot → per-message hydration + enqueue
 * → checkpoint persist). Three material differences:
 *
 *   1. **Filter to messagesAdded events only** — a label change is
 *      NOT a "new attachment" event. `labelsAdded` + defensive
 *      `messages` entries are dropped. Mirrors Gmail 2.3 plan §6
 *      "Event source".
 *
 *   2. **Hydrate with `format="full"`** to enumerate attachment
 *      metadata at the trigger boundary. `format=metadata` omits
 *      `payload.parts`, which `extractAttachmentMetadata` needs to
 *      walk the MIME tree.
 *
 *   3. **Per-trigger dedup key** via `checkAndMarkSeenAttachment`
 *      (prefix `attachment:`) — keeps the same Gmail message id from
 *      colliding with `new_email`'s bare key or
 *      `new_labeled_email`'s `labeled:` key, so all three triggers
 *      can fire independently on the same message.
 *
 * Attachment-less messages do NOT fire the trigger. Per Gmail 2.3
 * plan §6 "Walk function for attachments": if
 * `extractAttachmentMetadata` returns `[]`, we skip enqueue (inline
 * images don't count — the filename check filters them out).
 *
 * Errors from any one message are logged and skipped; one bad message
 * does not abort the tick.
 */

const HANDLER_ID = "gmail/new_attachment";

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = GmailNewAttachmentConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "gmail.poll.no_snapshot",
        trigger: "new_attachment",
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
        trigger: "new_attachment",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        userId: trigger.userId,
      }),
    );
    return;
  }
  const providerAccountId = integration.providerAccountId;

  let cursor = config.snapshot.historyId;

  // Walk all pages. Filter to messagesAdded events only.
  const collectedMessageIds: string[] = [];
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
            trigger: "new_attachment",
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
      if (matchesAttachmentSource(ev)) {
        collectedMessageIds.push(ev.id);
      }
    }

    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  // Collapse duplicates within this tick (a message can be referenced
  // by messagesAdded multiple times across overlapping history pages
  // in edge cases). The hydrate + dedup steps below handle cross-tick
  // dedup via `webhook_event_dedup`.
  const uniqueIds = Array.from(new Set(collectedMessageIds));

  if (!cursorReset) {
    for (const messageId of uniqueIds) {
      try {
        await processOneMessage({ trigger, providerAccountId, messageId });
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "gmail.poll.message_failed",
            trigger: "new_attachment",
            triggerId: trigger.id,
            messageId,
            error: (err as Error).message,
          }),
        );
      }
    }
  }

  // Persist updated config. advanceCheckpoint() takes the larger of
  // stored vs api historyId — same semantics as new_email and
  // new_labeled_email.
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

function matchesAttachmentSource(ev: MessageEvent): boolean {
  return ev.source === "messagesAdded";
}

async function processOneMessage(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  providerAccountId: string;
  messageId: string;
}): Promise<void> {
  const { trigger, providerAccountId, messageId } = input;

  const dedupOutcome = await checkAndMarkSeenAttachment(messageId);
  if (dedupOutcome.outage) return; // fail-closed (see dedup.ts)
  if (!dedupOutcome.fresh) return; // already processed in a prior tick

  // format=full required for attachment metadata enumeration —
  // metadata responses omit payload.parts.
  const message = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "gmail",
    providerAccountId,
    apiCall: async (accessToken) =>
      usersMessagesGet({ accessToken, messageId, format: "full" }),
  });

  const attachments = extractAttachmentMetadata(message);
  if (attachments.length === 0) return; // no real attachments — skip enqueue

  const event = buildAttachmentTriggerEvent({
    emailAddress: providerAccountId,
    message,
    attachments,
  });

  await enqueueRun({
    workflowId: trigger.workflowId,
    triggerNodeId: trigger.nodeId,
    event,
  });
}

export const gmailNewAttachmentPollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "gmail" && trigger.eventType === "new_attachment",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};

// Internal exports for tests
export { matchesAttachmentSource };
