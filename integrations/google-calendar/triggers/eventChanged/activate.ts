import { randomUUID } from "node:crypto";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { eventsList } from "../../api/eventsList";
import { eventsWatch } from "../../api/eventsWatch";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";

/**
 * Google Calendar event_changed activation hook.
 *
 * Runs at workflow-activate time, BEFORE the trigger_resources row is
 * upserted. Throwing aborts the activate transition (the orchestrator
 * wraps with TRIGGER_REGISTRATION_FAILED — the user sees a clear "we
 * couldn't reach Google Calendar right now" error).
 *
 * Two-step:
 *   1. Initial sync — paginate `events.list` to capture the baseline
 *      `nextSyncToken`. Without this, the first push notification arrives
 *      before we have a baseline and we can't fetch a delta — V1 CLAUDE.md
 *      "first poll miss" lesson, applied to push triggers.
 *   2. Watch registration — generate a unique `chainreact-{nodeId}-{uuid}`
 *      channelId, sign it with HMAC, and call `events.watch`. Returns
 *      `{ id, resourceId, expiration }`.
 *
 * The returned config patch tags the row with `type: "subscription-watch"`
 * so the renewal cron can find it.
 */

const SUBSCRIPTION_TYPE = "subscription-watch";

function webhookAddress(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/google-calendar`;
}

export const activate: ActivationFn = async ({ node, integration }) => {
  const calendarId =
    (node.config?.calendarId as string | undefined)?.trim() || "primary";

  // 1. Initial sync — paginate until we get a nextSyncToken. The first call
  //    with no syncToken/pageToken gets the first page; subsequent pages
  //    walk via nextPageToken until Google returns nextSyncToken.
  let syncToken: string | undefined;
  let pageToken: string | undefined;
  let pages = 0;
  while (true) {
    if (++pages > 100) {
      throw new Error(
        "google-calendar activate: events.list paginated for too long without producing a syncToken.",
      );
    }
    const page = await refreshAndRetry({
      userId: integration.userId,
      provider: "google-calendar",
      accountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        eventsList({
          accessToken,
          calendarId,
          singleEvents: true,
          maxResults: 250,
          pageToken,
        }),
    });
    if (page.nextSyncToken) {
      syncToken = page.nextSyncToken;
      break;
    }
    if (!page.nextPageToken) {
      // No nextPageToken AND no nextSyncToken — can't proceed.
      throw new Error(
        "google-calendar activate: events.list returned neither nextPageToken nor nextSyncToken.",
      );
    }
    pageToken = page.nextPageToken;
  }

  // 2. Generate channel + token, register the watch.
  const channelId = `chainreact-${node.id}-${randomUUID()}`;
  const channelToken = buildChannelToken({ channelId });

  const watch = await refreshAndRetry({
    userId: integration.userId,
    provider: "google-calendar",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      eventsWatch({
        accessToken,
        calendarId,
        channelId,
        channelToken,
        webhookAddress: webhookAddress(),
      }),
  });

  const expiresAt = new Date(Number(watch.expiration)).toISOString();

  // ActivationFn returns a flat config patch that lifecycle.ts merges into
  // the node's existing config. `type: "subscription-watch"` is the
  // discriminator the renewal cron uses to find rows that need watch
  // renewal (config @> { type: "subscription-watch" }).
  return {
    type: SUBSCRIPTION_TYPE,
    webhookEnabled: true,
    calendarId,
    channelId,
    resourceId: watch.resourceId,
    syncToken,
    expiresAt,
  };
};
