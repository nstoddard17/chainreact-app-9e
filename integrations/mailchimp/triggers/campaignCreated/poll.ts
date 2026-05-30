import type { TriggerEvent } from "@/contracts/triggerEvent";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { enqueueRun } from "@/services/execution/enqueue";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import * as dedupRepo from "@/repositories/webhookEventDedup";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import {
  campaignsList,
  type MailchimpCampaign,
} from "@/integrations/_shared/mailchimp/api/campaigns";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";
import { CampaignCreatedConfigSchema } from "./schema";

/**
 * Mailchimp `campaign_created` polling handler — Slice 14 Commit 5.
 *
 * Per-tick flow:
 *   1. Parse the row's config through the schema. Defensive: skip if
 *      `snapshot.knownCampaignIds` is missing (activation populates
 *      it; absence means a corrupt row).
 *   2. List the latest 100 matching campaigns (sorted DESC by
 *      create_time).
 *   3. Diff against the snapshot — any id NOT in the snapshot is
 *      "new". The diff is one-way (we don't fire on removal).
 *   4. For each new campaign, dedup by campaign id via
 *      `webhook_event_dedup` and enqueue a TriggerEvent.
 *   5. Persist the updated snapshot — UNION of old + new ids — and
 *      advance `polling.lastPolledAt`.
 *
 * Dedup key: the Mailchimp campaign id is opaque and stable; using
 * it directly as the `webhook_event_dedup` event_id means even a
 * crash between enqueue and snapshot persistence won't re-fire.
 *
 * V2 "first poll miss" rule honored: the snapshot is captured at
 * activation, so the first poll after activation fires only on
 * campaigns created AFTER activation.
 *
 * Errors in any single campaign's enqueue are logged and skipped;
 * one bad event doesn't abort the tick.
 */

const HANDLER_ID = "mailchimp/campaign_created";

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = CampaignCreatedConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "mailchimp.poll.campaign_created.no_snapshot",
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
        event: "mailchimp.poll.campaign_created.no_integration",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        userId: trigger.userId,
      }),
    );
    return;
  }
  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    // Activation must have populated dc; absence here means the
    // integration was reconnected and lost it, or activation was
    // legacy. Fail loud so the user sees a "reconnect Mailchimp"
    // prompt.
    throw new MissingDataCenterError();
  }
  const providerAccountId = integration.providerAccountId;

  // Fetch the current campaign list using the same filter the
  // activation snapshot used.
  const campaigns = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      campaignsList({
        accessToken,
        dc,
        ...(config.status ? { status: config.status } : {}),
        ...(config.audienceId ? { listId: config.audienceId } : {}),
        sortField: "create_time",
        sortDir: "DESC",
        count: 100,
      }),
  });

  const knownSet = new Set(config.snapshot.knownCampaignIds);
  const newCampaigns: MailchimpCampaign[] = [];
  for (const c of campaigns) {
    if (!c.id) continue;
    if (!knownSet.has(c.id)) newCampaigns.push(c);
  }

  for (const c of newCampaigns) {
    try {
      await processOneCampaign({ trigger, providerAccountId, campaign: c });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "mailchimp.poll.campaign_created.enqueue_failed",
          triggerId: trigger.id,
          campaignId: c.id,
          error: (err as Error).message,
        }),
      );
    }
  }

  // Snapshot update — UNION old + observed. Stable-sort so JSONB
  // equality across writes is deterministic.
  const updatedSet = new Set(config.snapshot.knownCampaignIds);
  for (const c of campaigns) {
    if (c.id) updatedSet.add(c.id);
  }
  const updatedSnapshot = {
    knownCampaignIds: Array.from(updatedSet).sort(),
    capturedAt: config.snapshot.capturedAt,
  };

  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    snapshot: updatedSnapshot,
    polling: { lastPolledAt: new Date(input.now).toISOString() },
  });
}

async function processOneCampaign(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  providerAccountId: string;
  campaign: MailchimpCampaign;
}): Promise<void> {
  const { trigger, providerAccountId, campaign } = input;
  if (!campaign.id) return;

  // Dedup by campaign id — opaque + stable across the Mailchimp
  // account's lifetime. Same dedup table the webhook dispatcher uses
  // (provider, eventId).
  const eventId = `campaign_created:${campaign.id}`;
  try {
    const result = await dedupRepo.markSeen("mailchimp", eventId);
    if (!result.fresh) return; // already enqueued in a prior tick
  } catch (err) {
    // Fail-CLOSED on dedup outage: skip this campaign this tick.
    // The next tick will retry. Better delayed than double-fired.
    console.warn(
      JSON.stringify({
        event: "mailchimp.poll.campaign_created.dedup_outage",
        triggerId: trigger.id,
        campaignId: campaign.id,
        error: (err as Error).message,
      }),
    );
    return;
  }

  const event: TriggerEvent = {
    provider: "mailchimp",
    eventType: "campaign_created",
    eventId,
    occurredAt: campaign.create_time ?? new Date().toISOString(),
    providerAccountId,
    payload: {
      campaignId: campaign.id,
      type: campaign.type ?? null,
      status: campaign.status ?? null,
      title: campaign.settings?.title ?? null,
      subjectLine: campaign.settings?.subject_line ?? null,
      fromName: campaign.settings?.from_name ?? null,
      replyTo: campaign.settings?.reply_to ?? null,
      audienceId: campaign.recipients?.list_id ?? null,
      audienceName: campaign.recipients?.list_name ?? null,
      sendTime: campaign.send_time ?? null,
      createTime: campaign.create_time ?? null,
    },
  };

  await enqueueRun({
    workflowId: trigger.workflowId,
    triggerNodeId: trigger.nodeId,
    event,
  });
}

export const mailchimpCampaignCreatedPollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "mailchimp" &&
    trigger.eventType === "campaign_created",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};
