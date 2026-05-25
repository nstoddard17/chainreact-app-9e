import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { CalendarEventResource } from "../../api/eventsInsert";
import { SyncTokenExpiredError } from "../../api/errors";
import { eventsList } from "../../api/eventsList";
import { normalize } from "./normalize";

/**
 * Pull the delta for an inbound notification.
 *
 * Google's push notifications tell us that SOMETHING changed in the
 * watched calendar but don't include the changed event itself. We have to
 * call `events.list?syncToken=X` to fetch the delta since the last sync.
 *
 * 410 Gone → syncToken expired (Google rotates them after a few weeks).
 * We re-baseline by paginating a fresh full list to grab a new
 * `nextSyncToken` and persist it. We dispatch ZERO events for this
 * notification — the delta we missed is genuinely lost; the next
 * notification with a fresh syncToken will surface new events.
 */
export interface PullResult {
  events: TriggerEvent[];
  resyncRequired: boolean;
}

export async function pull(
  trigger: TriggerResourceRecord,
): Promise<PullResult> {
  const config = trigger.config as {
    calendarId?: string;
    syncToken?: string;
  };

  if (!config.syncToken || !config.calendarId) {
    return { events: [], resyncRequired: true };
  }

  const integration = await getActiveForExecution(
    trigger.userId,
    trigger.provider,
    trigger.accountId,
  );
  if (!integration) {
    return { events: [], resyncRequired: false };
  }

  // Fetch the delta. Paginate via nextPageToken; final page returns
  // nextSyncToken to persist for the next pull.
  const allEvents: CalendarEventResource[] = [];
  let nextSyncToken: string | undefined;
  let pageToken: string | undefined;
  let pages = 0;
  let resyncRequired = false;

  while (true) {
    if (++pages > 100) {
      throw new Error(
        "google-calendar pull: events.list paginated for too long.",
      );
    }
    try {
      const page = await refreshAndRetry({
        userId: integration.userId,
        provider: "google-calendar",
        accountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          eventsList({
            accessToken,
            calendarId: config.calendarId!,
            // syncToken is mutually exclusive with q/orderBy/timeMin/etc.
            ...(pageToken
              ? { pageToken }
              : { syncToken: config.syncToken }),
          }),
      });
      for (const item of page.items ?? []) allEvents.push(item);
      if (page.nextPageToken) {
        pageToken = page.nextPageToken;
        continue;
      }
      nextSyncToken = page.nextSyncToken;
      break;
    } catch (err) {
      if (err instanceof SyncTokenExpiredError) {
        resyncRequired = true;
        break;
      }
      throw err;
    }
  }

  if (resyncRequired) {
    // Re-baseline: paginate a fresh full list to grab a new syncToken.
    let basePageToken: string | undefined;
    let baseSyncToken: string | undefined;
    let basePages = 0;
    while (true) {
      if (++basePages > 100) {
        throw new Error(
          "google-calendar pull: re-baseline paginated for too long.",
        );
      }
      const page = await refreshAndRetry({
        userId: integration.userId,
        provider: "google-calendar",
        accountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          eventsList({
            accessToken,
            calendarId: config.calendarId!,
            singleEvents: true,
            pageToken: basePageToken,
          }),
      });
      if (page.nextSyncToken) {
        baseSyncToken = page.nextSyncToken;
        break;
      }
      if (!page.nextPageToken) break;
      basePageToken = page.nextPageToken;
    }
    if (baseSyncToken) {
      await triggerResourcesRepo.updateConfig(trigger.id, {
        ...config,
        syncToken: baseSyncToken,
      });
    }
    return { events: [], resyncRequired: true };
  }

  // Persist new syncToken if it advanced.
  if (nextSyncToken && nextSyncToken !== config.syncToken) {
    await triggerResourcesRepo.updateConfig(trigger.id, {
      ...config,
      syncToken: nextSyncToken,
    });
  }

  // Convert each delta event to a TriggerEvent.
  const events: TriggerEvent[] = allEvents.map((e) =>
    normalize(e, {
      accountId: integration.providerAccountId,
      calendarId: config.calendarId!,
    }),
  );

  return { events, resyncRequired: false };
}
