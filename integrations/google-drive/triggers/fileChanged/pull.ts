import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { changesGetStartPageToken } from "../../api/changesGetStartPageToken";
import {
  changesList,
  type DriveChangeEntry,
} from "../../api/changesList";
import { PageTokenExpiredError } from "../../api/errors";
import { normalize } from "./normalize";

/**
 * Pull the delta for an inbound notification.
 *
 * Drive's push notifications tell us SOMETHING changed in the watched
 * resource but don't include the changed file itself. We have to call
 * `changes.list?pageToken=X` to fetch the delta since the last cursor.
 *
 * Pagination contract (different from Calendar's syncToken):
 *   - `nextPageToken` present → MORE pages remain. Loop with that token.
 *   - `newStartPageToken` present → terminal page reached. Persist as
 *     the next baseline cursor.
 *
 * 410 Gone (`PageTokenExpiredError`) → page token expired (Drive rotates
 * after ~30 days). Re-baseline via `changes.getStartPageToken`, persist,
 * emit zero events for this notification, return `resyncRequired: true`.
 * The next notification with a fresh token will surface real events.
 *
 * folderId filtering: when `config.folderId` is set, `normalize.ts`
 * filters changes to those whose `parents` includes the folder. Drive's
 * `changes.list` returns the user's WHOLE drive — folder filter is
 * post-fetch.
 */
export interface PullResult {
  events: TriggerEvent[];
  resyncRequired: boolean;
}

export async function pull(
  trigger: TriggerResourceRecord,
): Promise<PullResult> {
  const config = trigger.config as {
    pageToken?: string;
    fileId?: string;
    folderId?: string;
  };

  if (!config.pageToken) {
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

  // Paginate via nextPageToken; final page returns newStartPageToken to
  // persist for the next pull.
  const allChanges: DriveChangeEntry[] = [];
  let nextStartPageToken: string | undefined;
  let pageToken: string = config.pageToken;
  let pages = 0;
  let resyncRequired = false;

  while (true) {
    if (++pages > 100) {
      throw new Error(
        "google-drive pull: changes.list paginated for too long.",
      );
    }
    try {
      const page = await refreshAndRetry({
        userId: integration.userId,
        provider: "google-drive",
        accountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          changesList({ accessToken, pageToken }),
      });
      for (const c of page.changes ?? []) allChanges.push(c);
      if (page.nextPageToken) {
        pageToken = page.nextPageToken;
        continue;
      }
      // Terminal page. newStartPageToken is the new baseline cursor.
      nextStartPageToken = page.newStartPageToken;
      break;
    } catch (err) {
      if (err instanceof PageTokenExpiredError) {
        resyncRequired = true;
        break;
      }
      throw err;
    }
  }

  if (resyncRequired) {
    // Re-baseline via changes.getStartPageToken — emit zero events, log
    // the recovery via the persisted token, and let the next notification
    // surface real changes.
    const baseline = await refreshAndRetry({
      userId: integration.userId,
      provider: "google-drive",
      accountId: integration.providerAccountId,
      apiCall: (accessToken) => changesGetStartPageToken({ accessToken }),
    });
    if (baseline.startPageToken) {
      await triggerResourcesRepo.updateConfig(trigger.id, {
        ...config,
        pageToken: baseline.startPageToken,
      });
    }
    return { events: [], resyncRequired: true };
  }

  // Persist new pageToken if it advanced.
  if (nextStartPageToken && nextStartPageToken !== config.pageToken) {
    await triggerResourcesRepo.updateConfig(trigger.id, {
      ...config,
      pageToken: nextStartPageToken,
    });
  }

  // Convert each change to a TriggerEvent.
  const events: TriggerEvent[] = [];
  for (const change of allChanges) {
    const ev = normalize(change, {
      accountId: integration.providerAccountId,
      folderId: config.folderId,
    });
    if (ev) events.push(ev);
  }

  return { events, resyncRequired: false };
}
