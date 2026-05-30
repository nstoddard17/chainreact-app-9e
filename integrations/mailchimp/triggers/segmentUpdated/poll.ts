import type { TriggerEvent } from "@/contracts/triggerEvent";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { enqueueRun } from "@/services/execution/enqueue";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import * as dedupRepo from "@/repositories/webhookEventDedup";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import { segmentGet } from "@/integrations/_shared/mailchimp/api/segments";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";
import { SegmentUpdatedConfigSchema } from "./schema";

/**
 * Mailchimp `segment_updated` polling handler — Mailchimp 2.1 Commit 3.
 *
 * Per-tick flow:
 *   1. Parse the row's config. Defensive: skip if `snapshot` missing.
 *   2. GET the current segment record.
 *   3. Compare the four observable fields (name / memberCount /
 *      updatedAt / type) against the snapshot. If ANY differ → fire.
 *   4. Dedup by (segmentId, updatedAt) so the same Mailchimp-side
 *      update timestamp can't re-fire across ticks. When updatedAt
 *      is absent, fall back to a hash of the changed fields.
 *   5. Persist the new observed values + advance lastPolledAt.
 *
 * Dedup key: `segment_updated:{segmentId}:{updatedAt-or-hash}`.
 * Mailchimp's `updated_at` is the natural dedup discriminator — it
 * advances on every observable change. When Mailchimp omits it (rare
 * for active segments) we hash the (memberCount, name, type) tuple as
 * a fallback. Snapshot mismatch on equal hash means the workflow has
 * a stale cache; firing once is OK.
 *
 * V2 "first poll miss" rule honored — baseline captured at activation,
 * first poll only fires on observable changes after activation.
 */

const HANDLER_ID = "mailchimp/segment_updated";

interface ObservedState {
  name: string | null;
  memberCount: number | null;
  updatedAt: string | null;
  type: string | null;
}

function snapshotEquals(a: ObservedState, b: ObservedState): boolean {
  return (
    a.name === b.name &&
    a.memberCount === b.memberCount &&
    a.updatedAt === b.updatedAt &&
    a.type === b.type
  );
}

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = SegmentUpdatedConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "mailchimp.poll.segment_updated.no_snapshot",
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
        event: "mailchimp.poll.segment_updated.no_integration",
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

  const segment = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      segmentGet({
        accessToken,
        dc,
        audienceId: config.listId,
        segmentId: config.segmentId,
      }),
  });

  const observed: ObservedState = {
    name: segment.name ?? null,
    memberCount:
      typeof segment.member_count === "number" ? segment.member_count : null,
    updatedAt: segment.updated_at ?? null,
    type: segment.type ?? null,
  };

  const previousObserved: ObservedState = {
    name: config.snapshot.name,
    memberCount: config.snapshot.memberCount,
    updatedAt: config.snapshot.updatedAt,
    type: config.snapshot.type,
  };

  const changed = !snapshotEquals(observed, previousObserved);

  if (changed) {
    // Dedup discriminator: updatedAt when present; otherwise the
    // observed tuple as a fallback so identical no-updatedAt segments
    // can't double-fire within a tick window.
    const dedupKey =
      observed.updatedAt ??
      `mc:${observed.name ?? ""}:${observed.memberCount ?? ""}:${observed.type ?? ""}`;
    const eventId = `segment_updated:${config.segmentId}:${dedupKey}`;

    try {
      const result = await dedupRepo.markSeen("mailchimp", eventId);
      if (result.fresh) {
        const event: TriggerEvent = {
          provider: "mailchimp",
          eventType: "segment_updated",
          eventId,
          occurredAt: observed.updatedAt ?? new Date().toISOString(),
          providerAccountId,
          payload: {
            listId: config.listId,
            segmentId: config.segmentId,
            name: observed.name,
            memberCount: observed.memberCount,
            type: observed.type,
            updatedAt: observed.updatedAt,
          },
        };
        await enqueueRun({
          workflowId: trigger.workflowId,
          triggerNodeId: trigger.nodeId,
          event,
        });
      }
    } catch (err) {
      // Fail-CLOSED on dedup outage: skip this tick. Next tick retries.
      console.warn(
        JSON.stringify({
          event: "mailchimp.poll.segment_updated.dedup_outage",
          triggerId: trigger.id,
          segmentId: config.segmentId,
          error: (err as Error).message,
        }),
      );
    }
  }

  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    snapshot: {
      ...observed,
      capturedAt: config.snapshot.capturedAt,
    },
    polling: { lastPolledAt: new Date(input.now).toISOString() },
  });
}

export const mailchimpSegmentUpdatedPollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "mailchimp" && trigger.eventType === "segment_updated",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};
