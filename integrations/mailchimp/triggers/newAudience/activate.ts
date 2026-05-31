import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listsList } from "@/integrations/_shared/mailchimp/api/lists";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

/**
 * Mailchimp `new_audience` polling-trigger activation hook — Mailchimp
 * 2.1 Commit 3.
 *
 * Captures the baseline set of audience (list) ids at activation
 * time so the first poll after activation does NOT emit historical
 * events. V2 "first poll miss" rule: activation IS the baseline
 * boundary; if the baseline fetch fails, activation throws and the
 * trigger never registers.
 *
 * Page size 100 (wrapper cap). Mailchimp accounts typically have a
 * handful of audiences; 100 is a generous upper bound. Audiences
 * past page 1 are not tracked — if a user has more than 100
 * audiences, the trigger captures the first-100 set. This is a
 * deliberate bound on the snapshot per audit §12 R3.
 */
export const activate: ActivationFn = async ({ integration }) => {
  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    throw new MissingDataCenterError();
  }

  const result = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "mailchimp",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      listsList({
        accessToken,
        dc,
        count: 100,
      }),
  });

  const knownListIds = result.lists
    .map((l) => l.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .sort();

  return {
    pollingEnabled: true,
    snapshot: {
      knownListIds,
      capturedAt: new Date().toISOString(),
    },
  };
};
