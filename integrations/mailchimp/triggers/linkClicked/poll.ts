import type { TriggerEvent } from "@/contracts/triggerEvent";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { enqueueRun } from "@/services/execution/enqueue";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import * as dedupRepo from "@/repositories/webhookEventDedup";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import {
  campaignGet,
  campaignsList,
} from "@/integrations/_shared/mailchimp/api/campaigns";
import {
  reportClickDetailMembers,
  reportClickDetails,
  reportSummary,
} from "@/integrations/_shared/mailchimp/api/reports";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";
import { LinkClickedConfigSchema } from "./schema";

/**
 * Mailchimp `link_clicked` polling handler — Slice 14 Commit 5.
 *
 * Per-tick flow:
 *   1. Parse config; skip if no snapshot.
 *   2. Resolve campaign watch set (same rule as email_opened).
 *   3. For each campaign:
 *      a. Fetch reportSummary; compare totalClicks vs snapshot.
 *      b. If delta > 0, fetch reportClickDetails (the URLs clicked).
 *      c. For each URL (filtered by `config.url` if set), fetch
 *         reportClickDetailMembers — the subscribers who clicked it.
 *      d. For each (campaign, urlId, subscriber) tuple, dedup via
 *         local snapshot's knownClicks set + global
 *         webhook_event_dedup, then enqueue.
 *   4. Persist snapshot updates + lastPolledAt.
 *
 * Dedup semantics: one event per (campaign, URL, subscriber). The
 * same subscriber clicking the same URL twice only fires the
 * trigger once.
 */

const HANDLER_ID = "mailchimp/link_clicked";

const MAX_URLS_PER_CAMPAIGN = 50;
const MAX_MEMBERS_PER_URL = 50;

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = LinkClickedConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "mailchimp.poll.link_clicked.no_snapshot",
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
        event: "mailchimp.poll.link_clicked.no_integration",
        triggerId: trigger.id,
      }),
    );
    return;
  }
  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    throw new MissingDataCenterError();
  }
  const providerAccountId = integration.providerAccountId;

  let campaignIds: string[];
  if (config.campaignId) {
    campaignIds = [config.campaignId];
  } else {
    const campaigns = await refreshAndRetry({
      accountId: trigger.workflowAccountId!,
      provider: "mailchimp",
      providerAccountId,
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

  const updatedCampaigns: Record<string, { totalClicks: number }> = {
    ...config.snapshot.campaigns,
  };
  const updatedKnownClicks = new Set(config.snapshot.knownClicks);

  for (const campaignId of campaignIds) {
    try {
      await processOneCampaign({
        trigger,
        providerAccountId,
        dc,
        campaignId,
        urlFilter: config.url,
        previousTotal: config.snapshot.campaigns[campaignId]?.totalClicks ?? 0,
        updatedCampaigns,
        updatedKnownClicks,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "mailchimp.poll.link_clicked.campaign_failed",
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
      knownClicks: Array.from(updatedKnownClicks).sort(),
      capturedAt: config.snapshot.capturedAt,
    },
    polling: { lastPolledAt: new Date(input.now).toISOString() },
  });
}

async function processOneCampaign(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  providerAccountId: string;
  dc: string;
  campaignId: string;
  urlFilter: string | undefined;
  previousTotal: number;
  updatedCampaigns: Record<string, { totalClicks: number }>;
  updatedKnownClicks: Set<string>;
}): Promise<void> {
  const { trigger, providerAccountId, dc, campaignId, urlFilter, previousTotal } =
    input;

  const summary = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      reportSummary({ accessToken, dc, campaignId }),
  });
  const currentTotal = summary.clicks?.clicks_total ?? 0;
  input.updatedCampaigns[campaignId] = { totalClicks: currentTotal };

  if (currentTotal <= previousTotal) return;

  const urls = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      reportClickDetails({
        accessToken,
        dc,
        campaignId,
        count: MAX_URLS_PER_CAMPAIGN,
      }),
  });

  // Optionally filter by URL.
  const matchingUrls = urlFilter
    ? urls.filter((u) => u.url === urlFilter)
    : urls;

  // Best-effort campaign metadata fetch.
  let campaignTitle: string | null = null;
  let subjectLine: string | null = null;
  try {
    const campaign = await refreshAndRetry({
      accountId: trigger.workflowAccountId!,
      provider: "mailchimp",
      providerAccountId,
      apiCall: (accessToken) =>
        campaignGet({ accessToken, dc, campaignId }),
    });
    campaignTitle = campaign.settings?.title ?? null;
    subjectLine = campaign.settings?.subject_line ?? null;
  } catch {
    // best-effort
  }

  for (const urlInfo of matchingUrls) {
    const urlId = urlInfo.id;
    const url = urlInfo.url;
    if (!urlId || !url) continue;

    const members = await refreshAndRetry({
      accountId: trigger.workflowAccountId!,
      provider: "mailchimp",
      providerAccountId,
      apiCall: (accessToken) =>
        reportClickDetailMembers({
          accessToken,
          dc,
          campaignId,
          urlId,
          count: MAX_MEMBERS_PER_URL,
        }),
    });

    for (const member of members) {
      const email = member.email_address;
      if (!email) continue;
      const localKey = `${campaignId}:${urlId}:${email}`;
      if (input.updatedKnownClicks.has(localKey)) continue;

      const eventId = `link_clicked:${campaignId}:${urlId}:${email}`;
      try {
        const result = await dedupRepo.markSeen("mailchimp", eventId);
        if (!result.fresh) {
          input.updatedKnownClicks.add(localKey);
          continue;
        }
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "mailchimp.poll.link_clicked.dedup_outage",
            triggerId: trigger.id,
            campaignId,
            error: (err as Error).message,
          }),
        );
        continue;
      }

      const event: TriggerEvent = {
        provider: "mailchimp",
        eventType: "link_clicked",
        eventId,
        occurredAt: new Date().toISOString(),
        providerAccountId,
        payload: {
          campaignId,
          campaignTitle,
          subjectLine,
          email,
          subscriberId: member.email_id ?? null,
          audienceId: member.list_id ?? null,
          url,
          urlId,
          clicks: member.clicks ?? null,
        },
      };

      await enqueueRun({
        workflowId: trigger.workflowId,
        triggerNodeId: trigger.nodeId,
        event,
      });
      input.updatedKnownClicks.add(localKey);
    }
  }
}

export const mailchimpLinkClickedPollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "mailchimp" && trigger.eventType === "link_clicked",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};
