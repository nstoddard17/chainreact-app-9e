import { randomUUID } from "node:crypto";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";
import { changesGetStartPageToken } from "@/integrations/google-drive/api/changesGetStartPageToken";
import { filesWatch } from "@/integrations/google-drive/api/filesWatch";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import {
  NewDocumentInputConfigSchema,
  type NewDocumentInputConfig,
} from "./schema";

/**
 * Google Docs `new_document` activation hook — Slice 3.GDOCS-5.
 *
 * Pattern mirrors `google-sheets/triggers/newWorksheet/activate.ts` +
 * `google-drive/triggers/fileChanged/activate.ts`. Two steps:
 *   1. Capture baseline Drive cursor via `changes.getStartPageToken`
 *      so the first push notification has a defined `from` token.
 *      V1 "first-poll miss" applied to push-trigger model.
 *   2. Generate `chainreact-{nodeId}-{uuid}` channelId + HMAC token,
 *      register `files.watch` against the configured folder (or
 *      literal `"root"` for whole-drive watch).
 *
 * The returned config patch tags the row with
 * `type: "subscription-watch"` so the existing renewal cron
 * (`services/triggers/runRenewals.ts`) picks it up via the shared
 * subscription handler registered in `index.ts`.
 *
 * Filtering to Docs mimeType + `created` change-kind happens in
 * `normalize.ts` — the watch itself can't narrow by mimeType
 * (Drive's API doesn't accept a mimeType filter on `files.watch`),
 * so we filter the change stream post-fetch.
 */

const SUBSCRIPTION_TYPE = "subscription-watch";

function webhookAddress(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/google-docs`;
}

export const activate: ActivationFn = async ({ node, integration }) => {
  // 1. Parse + validate config (strict — rejects V1 polling chrome).
  const config: NewDocumentInputConfig = NewDocumentInputConfigSchema.parse(
    node.config ?? {},
  );
  // Watch the configured folder, or the user's whole drive when unset.
  // "root" is Drive's API-level alias for the user's root folder.
  const fileId = config.folderId ?? "root";

  // 2a. Capture baseline cursor.
  const baseline = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "google-docs",
    providerAccountId: integration.accountId,
    apiCall: (accessToken) => changesGetStartPageToken({ accessToken }),
  });
  const pageToken = baseline.startPageToken;
  if (!pageToken) {
    throw new Error(
      "google-docs new_document activate: changes.getStartPageToken returned no startPageToken.",
    );
  }

  // 2b. Register the Drive watch channel.
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
    // Preserve the workflow-author-supplied folderId so normalize can
    // re-filter (the watch may have been registered on "root" if
    // folderId was omitted, or on a specific folder id — either way
    // normalize uses this to drop unrelated documents).
    folderId: config.folderId,
    channelId,
    resourceId: watch.resourceId,
    pageToken,
    expiresAt,
  };
};
