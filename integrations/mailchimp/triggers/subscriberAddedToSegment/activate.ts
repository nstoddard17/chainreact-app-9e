import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { segmentMembersList } from "@/integrations/_shared/mailchimp/api/segments";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

/**
 * Mailchimp `subscriber_added_to_segment` polling-trigger activation
 * hook — Mailchimp 2.1 Commit 3.
 *
 * Captures the baseline set of subscriber hashes currently in the
 * configured segment so the first poll after activation does NOT
 * emit historical events. V2 "first poll miss" rule: activation IS
 * the baseline boundary.
 *
 * Both `listId` and `segmentId` are required at this point (Zod
 * schema enforces); we read directly from `node.config`. Failures
 * during the baseline fetch propagate and prevent activation (the
 * trigger never registers).
 *
 * Page size 100 (wrapper cap). For segments with >100 members the
 * baseline captures the first page; subsequent polls follow the same
 * query so a new member is only fired when it appears in the same
 * first-100 window. This bounds the snapshot size; per-trigger
 * unbounded membership snapshots are explicitly out of scope for
 * Commit 3 (per audit §12 R3).
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

  const result = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "mailchimp",
    providerAccountId: integration.accountId,
    apiCall: (accessToken) =>
      segmentMembersList({
        accessToken,
        dc,
        audienceId: config.listId,
        segmentId: config.segmentId,
        count: 100,
      }),
  });

  // Stable sort for JSONB equality across snapshot writes.
  const knownSubscriberHashes = result.members
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .sort();

  return {
    pollingEnabled: true,
    snapshot: {
      knownSubscriberHashes,
      capturedAt: new Date().toISOString(),
    },
    // Echo the filter fields back so the poll handler sees them on
    // every tick.
    listId: config.listId,
    segmentId: config.segmentId,
  };
};
