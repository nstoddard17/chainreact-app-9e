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
  campaignGet,
} from "@/integrations/_shared/mailchimp/api/campaigns";
import {
  reportOpenDetails,
  reportSummary,
} from "@/integrations/_shared/mailchimp/api/reports";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";
import { EmailOpenedConfigSchema } from "./schema";

/**
 * Mailchimp `email_opened` polling handler — Slice 14 Commit 5.
 *
 * Per-tick flow:
 *   1. Parse the row's config; skip if no snapshot (defensive).
 *   2. Resolve the campaign set:
 *      - `config.campaignId` set → watch that one.
 *      - Unset → re-list recent sent campaigns (Mailchimp may have
 *        sent new ones since activation; we expand the watch set to
 *        match the current state).
 *   3. For each campaign, fetch `reportSummary` and compare
 *      `opens.opens_total` against the snapshot's
 *      `totalOpens`. When current > snapshot:
 *      a. Fetch up to `delta` rows from `reportOpenDetails` (sorted
 *         DESC by timestamp). Mailchimp may return fewer than
 *         expected — that's tolerable.
 *      b. For each member, emit one event keyed by
 *         `${campaignId}:${email}`. Dedup via the local snapshot's
 *         `knownOpens` (fast-path) AND the global
 *         `webhook_event_dedup` table (cross-tick safety).
 *   4. Persist updated snapshot — new totals + new knownOpens
 *      additions + advance lastPolledAt.
 *
 * Dedup semantics: one event per (campaign, subscriber). A
 * subscriber that opens the same campaign multiple times only fires
 * the trigger ONCE per V2 contract. This mirrors V1
 * MailchimpTriggerLifecycle.ts:108-152's "fire up to delta members"
 * but de-dupes by (campaign, email) rather than open-count.
 */

const HANDLER_ID = "mailchimp/email_opened";

/** Per-tick safety belt on detail fetches. */
const MAX_DETAIL_FETCH = 100;

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = EmailOpenedConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "mailchimp.poll.email_opened.no_snapshot",
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
        event: "mailchimp.poll.email_opened.no_integration",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
      }),
    );
    return;
  }
  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    throw new MissingDataCenterError();
  }
  const accountId = integration.providerAccountId;

  // Resolve campaign watch set for this tick.
  let campaignIds: string[];
  if (config.campaignId) {
    campaignIds = [config.campaignId];
  } else {
    const campaigns = await refreshAndRetry({
      userId: trigger.userId,
      provider: "mailchimp",
      accountId,
      apiCall: (accessToken) =>
        campaignsList({
          accessToken,
          dc,
          status: "sent",
          sortField: "send_time",
          sortDir: "DESC",
          count: 10,
        }),
    });
    campaignIds = campaigns
      .map((c) => c.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  const updatedCampaigns: Record<string, { totalOpens: number }> = {
    ...config.snapshot.campaigns,
  };
  const updatedKnownOpens = new Set(config.snapshot.knownOpens);

  for (const campaignId of campaignIds) {
    try {
      await processOneCampaign({
        trigger,
        accountId,
        dc,
        campaignId,
        previousTotal: config.snapshot.campaigns[campaignId]?.totalOpens ?? 0,
        updatedCampaigns,
        updatedKnownOpens,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "mailchimp.poll.email_opened.campaign_failed",
          triggerId: trigger.id,
          campaignId,
          error: (err as Error).message,
        }),
      );
    }
  }

  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    snapshot: {
      campaigns: updatedCampaigns,
      knownOpens: Array.from(updatedKnownOpens).sort(),
      capturedAt: config.snapshot.capturedAt,
    },
    polling: { lastPolledAt: new Date(input.now).toISOString() },
  });
}

async function processOneCampaign(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  accountId: string;
  dc: string;
  campaignId: string;
  previousTotal: number;
  updatedCampaigns: Record<string, { totalOpens: number }>;
  updatedKnownOpens: Set<string>;
}): Promise<void> {
  const { trigger, accountId, dc, campaignId, previousTotal } = input;

  const summary = await refreshAndRetry({
    userId: trigger.userId,
    provider: "mailchimp",
    accountId,
    apiCall: (accessToken) =>
      reportSummary({ accessToken, dc, campaignId }),
  });
  const currentTotal = summary.opens?.opens_total ?? 0;
  input.updatedCampaigns[campaignId] = { totalOpens: currentTotal };

  if (currentTotal <= previousTotal) return;

  // Fetch enough detail rows to cover the delta — capped at
  // MAX_DETAIL_FETCH for safety. Sorted DESC by timestamp so the
  // most-recent opens come first.
  const delta = currentTotal - previousTotal;
  const fetchCount = Math.min(delta, MAX_DETAIL_FETCH);
  const members = await refreshAndRetry({
    userId: trigger.userId,
    provider: "mailchimp",
    accountId,
    apiCall: (accessToken) =>
      reportOpenDetails({
        accessToken,
        dc,
        campaignId,
        count: fetchCount,
      }),
  });

  // Resolve campaign title once for the payload (best-effort; if
  // the campaign fetch fails we still emit events without the title).
  let campaignTitle: string | null = null;
  let subjectLine: string | null = null;
  try {
    const campaign = await refreshAndRetry({
      userId: trigger.userId,
      provider: "mailchimp",
      accountId,
      apiCall: (accessToken) =>
        campaignGet({ accessToken, dc, campaignId }),
    });
    campaignTitle = campaign.settings?.title ?? null;
    subjectLine = campaign.settings?.subject_line ?? null;
  } catch {
    // best-effort
  }

  for (const member of members) {
    const email = member.email_address;
    if (!email) continue;
    const localKey = `${campaignId}:${email}`;
    if (input.updatedKnownOpens.has(localKey)) continue;

    const eventId = `email_opened:${campaignId}:${email}`;
    try {
      const result = await dedupRepo.markSeen("mailchimp", eventId);
      if (!result.fresh) {
        // Cross-tick dedup hit (snapshot lost track or run on
        // different worker). Add to local snapshot so we don't
        // re-check next tick.
        input.updatedKnownOpens.add(localKey);
        continue;
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "mailchimp.poll.email_opened.dedup_outage",
          triggerId: trigger.id,
          campaignId,
          error: (err as Error).message,
        }),
      );
      // Fail-CLOSED — skip this event this tick.
      continue;
    }

    // Most-recent open timestamp for this member; Mailchimp returns
    // up to 5 timestamps DESC.
    const openTime =
      member.opens?.[0]?.timestamp ?? new Date().toISOString();

    const event: TriggerEvent = {
      provider: "mailchimp",
      eventType: "email_opened",
      eventId,
      occurredAt: openTime,
      accountId,
      payload: {
        campaignId,
        campaignTitle,
        subjectLine,
        email,
        subscriberId: member.email_id ?? null,
        audienceId: member.list_id ?? null,
        openTime,
        opensCount: member.opens_count ?? null,
      },
    };

    await enqueueRun({
      workflowId: trigger.workflowId,
      triggerNodeId: trigger.nodeId,
      event,
    });
    input.updatedKnownOpens.add(localKey);
  }
}

export const mailchimpEmailOpenedPollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "mailchimp" && trigger.eventType === "email_opened",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};
