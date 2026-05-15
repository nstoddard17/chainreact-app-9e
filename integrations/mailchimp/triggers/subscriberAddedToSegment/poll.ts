import type { TriggerEvent } from "@/contracts/triggerEvent";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { enqueueRun } from "@/services/execution/enqueue";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import * as dedupRepo from "@/repositories/webhookEventDedup";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import {
  segmentMembersList,
  type MailchimpSegmentMember,
} from "@/integrations/_shared/mailchimp/api/segments";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";
import { SubscriberAddedToSegmentConfigSchema } from "./schema";

/**
 * Mailchimp `subscriber_added_to_segment` polling handler — Mailchimp
 * 2.1 Commit 3.
 *
 * Per-tick flow:
 *   1. Parse the row's config. Defensive: skip if `snapshot` missing.
 *   2. Read the current first page of segment members.
 *   3. Diff against the snapshot — any member id NOT in the snapshot
 *      is "new". One-way diff (we don't fire on removal).
 *   4. For each new member, dedup by (segmentId, subscriberHash) via
 *      `webhook_event_dedup` and enqueue a TriggerEvent.
 *   5. Persist UNION snapshot + advance lastPolledAt.
 *
 * Dedup key: `subscriber_added_to_segment:{segmentId}:{hash}`. The
 * Mailchimp member id is stable as long as the email doesn't change;
 * scoping by segmentId lets the same subscriber being added to
 * multiple segments fire each trigger correctly.
 *
 * V2 "first poll miss" rule honored — baseline is captured at
 * activation; the first poll after activation only fires on
 * members added AFTER activation.
 */

const HANDLER_ID = "mailchimp/subscriber_added_to_segment";

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = SubscriberAddedToSegmentConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "mailchimp.poll.subscriber_added_to_segment.no_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
      }),
    );
    return;
  }

  const integration = await getActiveForExecution(
    trigger.userId,
    "mailchimp",
    null,
  );
  if (!integration) {
    console.warn(
      JSON.stringify({
        event: "mailchimp.poll.subscriber_added_to_segment.no_integration",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        userId: trigger.userId,
      }),
    );
    return;
  }
  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    throw new MissingDataCenterError();
  }
  const accountId = integration.providerAccountId;

  const result = await refreshAndRetry({
    userId: trigger.userId,
    provider: "mailchimp",
    accountId,
    apiCall: (accessToken) =>
      segmentMembersList({
        accessToken,
        dc,
        audienceId: config.listId,
        segmentId: config.segmentId,
        count: 100,
      }),
  });

  const knownSet = new Set(config.snapshot.knownSubscriberHashes);
  const newMembers: MailchimpSegmentMember[] = [];
  for (const m of result.members) {
    if (!m.id) continue;
    if (!knownSet.has(m.id)) newMembers.push(m);
  }

  for (const m of newMembers) {
    try {
      await processOneMember({
        trigger,
        accountId,
        listId: config.listId,
        segmentId: config.segmentId,
        member: m,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "mailchimp.poll.subscriber_added_to_segment.enqueue_failed",
          triggerId: trigger.id,
          subscriberHash: m.id,
          error: (err as Error).message,
        }),
      );
    }
  }

  // Snapshot update — UNION old + observed. Stable-sort for JSONB
  // equality across writes.
  const updatedSet = new Set(config.snapshot.knownSubscriberHashes);
  for (const m of result.members) {
    if (m.id) updatedSet.add(m.id);
  }
  const updatedSnapshot = {
    knownSubscriberHashes: Array.from(updatedSet).sort(),
    capturedAt: config.snapshot.capturedAt,
  };

  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    snapshot: updatedSnapshot,
    polling: { lastPolledAt: new Date(input.now).toISOString() },
  });
}

async function processOneMember(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  accountId: string;
  listId: string;
  segmentId: string;
  member: MailchimpSegmentMember;
}): Promise<void> {
  const { trigger, accountId, listId, segmentId, member } = input;
  if (!member.id) return;

  const eventId = `subscriber_added_to_segment:${segmentId}:${member.id}`;
  try {
    const result = await dedupRepo.markSeen("mailchimp", eventId);
    if (!result.fresh) return;
  } catch (err) {
    // Fail-CLOSED on dedup outage: skip this member this tick.
    console.warn(
      JSON.stringify({
        event: "mailchimp.poll.subscriber_added_to_segment.dedup_outage",
        triggerId: trigger.id,
        subscriberHash: member.id,
        error: (err as Error).message,
      }),
    );
    return;
  }

  const event: TriggerEvent = {
    provider: "mailchimp",
    eventType: "subscriber_added_to_segment",
    eventId,
    occurredAt: member.last_changed ?? new Date().toISOString(),
    accountId,
    payload: {
      listId,
      segmentId,
      subscriberHash: member.id,
      emailAddress: member.email_address ?? null,
      status: member.status ?? null,
      lastChanged: member.last_changed ?? null,
    },
  };

  await enqueueRun({
    workflowId: trigger.workflowId,
    triggerNodeId: trigger.nodeId,
    event,
  });
}

export const mailchimpSubscriberAddedToSegmentPollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "mailchimp" &&
    trigger.eventType === "subscriber_added_to_segment",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};
