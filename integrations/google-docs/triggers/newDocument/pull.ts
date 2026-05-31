import type { TriggerEvent } from "@/contracts/triggerEvent";
import { changesGetStartPageToken } from "@/integrations/google-drive/api/changesGetStartPageToken";
import {
  changesList,
  type DriveChangeEntry,
} from "@/integrations/google-drive/api/changesList";
import { PageTokenExpiredError } from "@/integrations/google-drive/api/errors";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { normalize } from "./normalize";

/**
 * Google Docs `new_document` pull — Slice 3.GDOCS-5.
 *
 * Mirrors `google-drive/triggers/fileChanged/pull.ts` with two
 * Docs-specific changes:
 *   1. Provider is `google-docs` (different integration record, same
 *      Drive scope — the Google Docs manifest declares the `drive`
 *      scope alongside `documents`).
 *   2. `normalize` filters to Docs mimeType + `created` change-kind +
 *      configured folder, so the trigger only emits events for new
 *      Google Docs documents.
 *
 * Drive `changes.list` pagination contract:
 *   - `nextPageToken` present → more pages; loop.
 *   - `newStartPageToken` present → terminal page; persist as next
 *     baseline cursor.
 *   - 410 Gone → page token expired (Drive rotates ~30 days);
 *     re-baseline via `changes.getStartPageToken`, emit zero events
 *     this notification, return `resyncRequired: true`.
 *
 * The pull requests `owners(emailAddress)` in the fields mask so
 * `normalize` can surface `createdBy`. Default Drive fields mask
 * omits owners; the trigger pays the extra-bytes cost in exchange
 * for the sensitive-marked payload field.
 */

const DOCS_CHANGES_FIELDS =
  "kind,nextPageToken,newStartPageToken,changes(kind,changeType,time,removed,fileId,file(id,name,mimeType,parents,createdTime,modifiedTime,webViewLink,trashed,owners(emailAddress)))";

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

  const integration = await getActiveForExecution(trigger.workflowAccountId!,
    trigger.provider,
    trigger.providerAccountId,
  );
  if (!integration) {
    return { events: [], resyncRequired: false };
  }

  const allChanges: DriveChangeEntry[] = [];
  let nextStartPageToken: string | undefined;
  let pageToken: string = config.pageToken;
  let pages = 0;
  let resyncRequired = false;

  while (true) {
    if (++pages > 100) {
      throw new Error(
        "google-docs new_document pull: changes.list paginated for too long.",
      );
    }
    try {
      const page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "google-docs",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          changesList({
            accessToken,
            pageToken,
            fields: DOCS_CHANGES_FIELDS,
          }),
      });
      for (const c of page.changes ?? []) allChanges.push(c);
      if (page.nextPageToken) {
        pageToken = page.nextPageToken;
        continue;
      }
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
    const baseline = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "google-docs",
      providerAccountId: integration.providerAccountId,
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

  if (nextStartPageToken && nextStartPageToken !== config.pageToken) {
    await triggerResourcesRepo.updateConfig(trigger.id, {
      ...config,
      pageToken: nextStartPageToken,
    });
  }

  const events: TriggerEvent[] = [];
  for (const change of allChanges) {
    const ev = normalize(change, {
      providerAccountId: integration.providerAccountId,
      folderId: config.folderId,
    });
    if (ev) events.push(ev);
  }

  return { events, resyncRequired: false };
}
