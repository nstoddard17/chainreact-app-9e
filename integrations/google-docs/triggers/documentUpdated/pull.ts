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
 * Google Docs `document_updated` pull — Slice 3.GDOCS-5.
 *
 * Twin of `newDocument/pull.ts` — same Drive `changes.list` shape,
 * same 410 / re-baseline handling, different normalize. The fields
 * mask requests `lastModifyingUser(emailAddress)` + `version` for the
 * payload's `updatedBy` + `revisionId`.
 */

const DOCS_CHANGES_FIELDS =
  "kind,nextPageToken,newStartPageToken,changes(kind,changeType,time,removed,fileId,file(id,name,mimeType,parents,createdTime,modifiedTime,webViewLink,trashed,version,lastModifyingUser(emailAddress)))";

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
    documentId?: string;
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

  const allChanges: DriveChangeEntry[] = [];
  let nextStartPageToken: string | undefined;
  let pageToken: string = config.pageToken;
  let pages = 0;
  let resyncRequired = false;

  while (true) {
    if (++pages > 100) {
      throw new Error(
        "google-docs document_updated pull: changes.list paginated for too long.",
      );
    }
    try {
      const page = await refreshAndRetry({
        userId: integration.userId,
        provider: "google-docs",
        accountId: integration.providerAccountId,
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
      userId: integration.userId,
      provider: "google-docs",
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

  if (nextStartPageToken && nextStartPageToken !== config.pageToken) {
    await triggerResourcesRepo.updateConfig(trigger.id, {
      ...config,
      pageToken: nextStartPageToken,
    });
  }

  const events: TriggerEvent[] = [];
  for (const change of allChanges) {
    const ev = normalize(change, {
      accountId: integration.providerAccountId,
      documentId: config.documentId,
      folderId: config.folderId,
    });
    if (ev) events.push(ev);
  }

  return { events, resyncRequired: false };
}
