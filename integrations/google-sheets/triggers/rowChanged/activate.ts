import { randomUUID } from "node:crypto";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";
import { changesGetStartPageToken } from "@/integrations/google-drive/api/changesGetStartPageToken";
import { filesWatch } from "@/integrations/google-drive/api/filesWatch";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { valuesGet } from "../../api/valuesGet";

/**
 * Google Sheets row_changed activation hook.
 *
 * Sheets has no native push notifications. V1 confirmed (and V2 reuses)
 * that the only viable real-time mechanic is to register a Drive
 * `files.watch` against the spreadsheet's fileId. So this activate hook
 * imports Drive's wrappers directly:
 *   - `changesGetStartPageToken` for the Drive cursor (kept for future
 *     polling-mode parity; not used in pull's current implementation).
 *   - `filesWatch` for the actual subscription registration.
 *
 * The Slice 5 plan doc records this cross-provider import as deliberate
 * (Sheets rides Drive's watch transport) and defers extraction to
 * `_shared/google/driveApi/` until a third Google product needs the
 * same wrappers.
 *
 * Three steps, in this order:
 *   1. Validate config — `spreadsheetId` and `sheetName` are required for
 *      Slice 5 Batch 1. V1 supports omitting sheetName ("watch all
 *      sheets"); V2 narrows scope.
 *   2. Snapshot initial state — `values.get` on the configured sheet's
 *      A:Z range, store `lastRowCount = values.length`. Without this,
 *      the first push notification arrives and pull would backfill all
 *      existing rows as "added" events. V1's "first poll miss" lesson
 *      applied to Sheets.
 *   3. Drive watch registration — capture `pageToken` (currently unused
 *      by pull; persisted for future polling-mode use), generate
 *      channelId + HMAC token, call `files.watch` with `fileId =
 *      spreadsheetId`. Returns `{id, resourceId, expiration}`.
 *
 * Throwing aborts the activate transition (TRIGGER_REGISTRATION_FAILED).
 * The returned config patch tags the row with
 * `type: "subscription-watch"` so the renewal cron can find it.
 */

const SUBSCRIPTION_TYPE = "subscription-watch";

function webhookAddress(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/google-sheets`;
}

export const activate: ActivationFn = async ({ node, integration }) => {
  const spreadsheetId = (node.config?.spreadsheetId as string | undefined)?.trim();
  const sheetName = (node.config?.sheetName as string | undefined)?.trim();
  if (!spreadsheetId) {
    throw new Error(
      "google-sheets activate: trigger config requires spreadsheetId.",
    );
  }
  if (!sheetName) {
    throw new Error(
      "google-sheets activate: trigger config requires sheetName (Slice 5 Batch 1; multi-sheet support deferred).",
    );
  }
  // Optional Boolean — defaults to false (no header treatment).
  const headerRow = node.config?.headerRow === true;

  // 1. Snapshot initial row count so the first notification doesn't backfill.
  const initialValues = await refreshAndRetry({
    userId: integration.userId,
    provider: "google-sheets",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      valuesGet({
        accessToken,
        spreadsheetId,
        range: `${sheetName}!A:Z`,
      }),
  });
  const lastRowCount = (initialValues.values ?? []).length;

  // 2. Capture Drive baseline cursor. Persisted for future polling-mode
  //    parity; pull does NOT consume this in Slice 5 Batch 1 (it reads
  //    values.get directly, which is cheaper than walking changes.list).
  const pageBaseline = await refreshAndRetry({
    userId: integration.userId,
    provider: "google-sheets",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) => changesGetStartPageToken({ accessToken }),
  });
  const pageToken = pageBaseline.startPageToken;
  if (!pageToken) {
    throw new Error(
      "google-sheets activate: changes.getStartPageToken returned no startPageToken.",
    );
  }

  // 3. Register the Drive file-watch on the spreadsheet's fileId.
  const channelId = `chainreact-${node.id}-${randomUUID()}`;
  const channelToken = buildChannelToken({ channelId });

  const watch = await refreshAndRetry({
    userId: integration.userId,
    provider: "google-sheets",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      filesWatch({
        accessToken,
        fileId: spreadsheetId,
        channelId,
        channelToken,
        webhookAddress: webhookAddress(),
      }),
  });

  const expiresAt = new Date(Number(watch.expiration)).toISOString();

  return {
    type: SUBSCRIPTION_TYPE,
    webhookEnabled: true,
    spreadsheetId,
    sheetName,
    headerRow,
    channelId,
    resourceId: watch.resourceId,
    pageToken,
    lastRowCount,
    expiresAt,
  };
};
