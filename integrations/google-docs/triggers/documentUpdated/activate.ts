import { randomUUID } from "node:crypto";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";
import { changesGetStartPageToken } from "@/integrations/google-drive/api/changesGetStartPageToken";
import { filesWatch } from "@/integrations/google-drive/api/filesWatch";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import {
  DocumentUpdatedInputConfigSchema,
  type DocumentUpdatedInputConfig,
} from "./schema";

/**
 * Google Docs `document_updated` activation hook — Slice 3.GDOCS-5.
 *
 * Mirrors `newDocument/activate.ts`. fileId resolution priority:
 *   1. `documentId` (most specific — per-file Drive watch).
 *   2. `folderId` (per-folder watch).
 *   3. Fallback to `"root"` (whole-drive watch).
 *
 * `normalize` re-filters by `documentId` / `folderId` post-fetch so the
 * trigger only emits events for in-scope Docs, even on the per-file
 * watch path (defense in depth — `changes.list` returns the whole
 * drive regardless of the watch scope).
 */

const SUBSCRIPTION_TYPE = "subscription-watch";

function webhookAddress(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/google-docs`;
}

export const activate: ActivationFn = async ({ node, integration }) => {
  const config: DocumentUpdatedInputConfig =
    DocumentUpdatedInputConfigSchema.parse(node.config ?? {});
  const fileId = config.documentId ?? config.folderId ?? "root";

  const baseline = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "google-docs",
    providerAccountId: integration.accountId,
    apiCall: (accessToken) => changesGetStartPageToken({ accessToken }),
  });
  const pageToken = baseline.startPageToken;
  if (!pageToken) {
    throw new Error(
      "google-docs document_updated activate: changes.getStartPageToken returned no startPageToken.",
    );
  }

  const channelId = `chainreact-${node.id}-${randomUUID()}`;
  const channelToken = buildChannelToken({ channelId });

  const watch = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "google-docs",
    providerAccountId: integration.accountId,
    apiCall: (accessToken) =>
      filesWatch({
        accessToken,
        fileId,
        channelId,
        channelToken,
        webhookAddress: webhookAddress(),
      }),
  });

  const expiresAt = new Date(Number(watch.expiration)).toISOString();

  return {
    type: SUBSCRIPTION_TYPE,
    webhookEnabled: true,
    fileId,
    documentId: config.documentId,
    folderId: config.folderId,
    channelId,
    resourceId: watch.resourceId,
    pageToken,
    expiresAt,
  };
};
