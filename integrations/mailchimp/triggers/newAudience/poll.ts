import type { TriggerEvent } from "@/contracts/triggerEvent";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { enqueueRun } from "@/services/execution/enqueue";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import * as dedupRepo from "@/repositories/webhookEventDedup";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import {
  listsList,
  type MailchimpList,
} from "@/integrations/_shared/mailchimp/api/lists";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";
import { NewAudienceConfigSchema } from "./schema";

/**
 * Mailchimp `new_audience` polling handler — Mailchimp 2.1 Commit 3.
 *
 * Per-tick flow:
 *   1. Parse the row's config. Defensive: skip if `snapshot` missing.
 *   2. List the account's audiences (first 100).
 *   3. Diff against the snapshot — any id NOT in the snapshot is
 *      "new". One-way diff (we don't fire on removal).
 *   4. For each new audience, dedup by list id via
 *      `webhook_event_dedup` and enqueue a TriggerEvent.
 *   5. Persist UNION snapshot + advance lastPolledAt.
 *
 * Dedup key: the Mailchimp list id is opaque and stable for the life
 * of the audience; using it directly as the `webhook_event_dedup`
 * event_id means a crash between enqueue and snapshot persistence
 * won't re-fire.
 *
 * V2 "first poll miss" rule honored — baseline captured at activation.
 */

const HANDLER_ID = "mailchimp/new_audience";

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = NewAudienceConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "mailchimp.poll.new_audience.no_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
      }),
    );
    return;
  }

  const integration = await getActiveForExecution(trigger.workflowAccountId!,
    "mailchimp",
    null,
  );
  if (!integration) {
    console.warn(
      JSON.stringify({
        event: "mailchimp.poll.new_audience.no_integration",
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
  const providerAccountId = integration.providerAccountId;

  const result = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      listsList({
        accessToken,
        dc,
        count: 100,
      }),
  });

  const knownSet = new Set(config.snapshot.knownListIds);
  const newLists: MailchimpList[] = [];
  for (const l of result.lists) {
    if (!l.id) continue;
    if (!knownSet.has(l.id)) newLists.push(l);
  }

  for (const l of newLists) {
    try {
      await processOneList({ trigger, providerAccountId, list: l });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "mailchimp.poll.new_audience.enqueue_failed",
          triggerId: trigger.id,
          listId: l.id,
          error: (err as Error).message,
        }),
      );
    }
  }

  // Snapshot update — UNION old + observed. Stable-sort for JSONB
  // equality across writes.
  const updatedSet = new Set(config.snapshot.knownListIds);
  for (const l of result.lists) {
    if (l.id) updatedSet.add(l.id);
  }
  const updatedSnapshot = {
    knownListIds: Array.from(updatedSet).sort(),
    capturedAt: config.snapshot.capturedAt,
  };

  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    snapshot: updatedSnapshot,
    polling: { lastPolledAt: new Date(input.now).toISOString() },
  });
}

async function processOneList(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  providerAccountId: string;
  list: MailchimpList;
}): Promise<void> {
  const { trigger, providerAccountId, list } = input;
  if (!list.id) return;

  const eventId = `new_audience:${list.id}`;
  try {
    const result = await dedupRepo.markSeen("mailchimp", eventId);
    if (!result.fresh) return;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "mailchimp.poll.new_audience.dedup_outage",
        triggerId: trigger.id,
        listId: list.id,
        error: (err as Error).message,
      }),
    );
    return;
  }

  const event: TriggerEvent = {
    provider: "mailchimp",
    eventType: "new_audience",
    eventId,
    occurredAt: list.date_created ?? new Date().toISOString(),
    providerAccountId,
    payload: {
      listId: list.id,
      name: list.name ?? null,
      company: list.contact?.company ?? null,
      memberCount: list.stats?.member_count ?? 0,
      dateCreated: list.date_created ?? null,
    },
  };

  await enqueueRun({
    workflowId: trigger.workflowId,
    triggerNodeId: trigger.nodeId,
    event,
  });
}

export const mailchimpNewAudiencePollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "mailchimp" && trigger.eventType === "new_audience",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};
