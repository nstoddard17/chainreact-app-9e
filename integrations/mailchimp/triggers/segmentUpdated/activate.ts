import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { segmentGet } from "@/integrations/_shared/mailchimp/api/segments";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

/**
 * Mailchimp `segment_updated` polling-trigger activation hook —
 * Mailchimp 2.1 Commit 3.
 *
 * Captures the baseline observable state of the configured segment
 * (name / memberCount / updatedAt / type) at activation time. The
 * poll handler compares subsequent reads against this snapshot and
 * fires only on observable change.
 *
 * V2 "first poll miss" rule: activation IS the baseline boundary; if
 * the baseline fetch fails, activation throws and the trigger never
 * registers.
 */
export const activate: ActivationFn = async ({ node, integration }) => {
  const config = node.config as {
    listId: string;
    segmentId: string;
  };

  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    throw new MissingDataCenterError();
  }

  const segment = await refreshAndRetry({
    userId: integration.userId,
    provider: "mailchimp",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      segmentGet({
        accessToken,
        dc,
        audienceId: config.listId,
        segmentId: config.segmentId,
      }),
  });

  return {
    pollingEnabled: true,
    snapshot: {
      name: segment.name ?? null,
      memberCount:
        typeof segment.member_count === "number"
          ? segment.member_count
          : null,
      updatedAt: segment.updated_at ?? null,
      type: segment.type ?? null,
      capturedAt: new Date().toISOString(),
    },
    listId: config.listId,
    segmentId: config.segmentId,
  };
};
