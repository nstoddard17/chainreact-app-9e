import { randomUUID } from "node:crypto";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";
import { changesGetStartPageToken } from "@/integrations/google-drive/api/changesGetStartPageToken";
import { filesWatch } from "@/integrations/google-drive/api/filesWatch";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { spreadsheetsGet } from "../../api/spreadsheetsGet";
import { buildWorksheetListSnapshot } from "../_shared/snapshot";
import {
  NewWorksheetInputConfigSchema,
  type NewWorksheetInputConfig,
} from "./schema";

/**
 * Google Sheets `new_worksheet` activation hook.
 *
 * Three steps:
 *   1. Parse + validate config via `NewWorksheetInputConfigSchema`.
 *      Strict — rejects V1 polling chrome + unknown fields.
 *   2. Seed the worksheet-name baseline via `spreadsheets.get`
 *      (`includeGridData=false`). The baseline becomes the "do not
 *      fire for these" set — only worksheets created AFTER
 *      activation generate events. Closes V1's "first poll miss"
 *      bug; throwing aborts the activate transition.
 *   3. Capture Drive `startPageToken` (persisted for future
 *      polling-mode parity; pull doesn't consume it) + create the
 *      Drive `files.watch` against the spreadsheet's fileId.
 *
 * Throwing aborts the activate transition
 * (TRIGGER_REGISTRATION_FAILED). The returned config patch tags the
 * row with `type: "subscription-watch"` so the existing renewal cron
 * picks it up.
 */

const SUBSCRIPTION_TYPE = "subscription-watch";

function webhookAddress(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/google-sheets`;
}

export const activate: ActivationFn = async ({ node, integration }) => {
  // 1. Parse + validate config.
  const config: NewWorksheetInputConfig = NewWorksheetInputConfigSchema.parse(
    node.config ?? {},
  );

  // 2. Seed worksheet-name baseline.
  const metadata = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "google-sheets",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      spreadsheetsGet({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        // Minimal fields — name list + sheetId for payload construction.
        fields: "sheets(properties(sheetId,title,index,sheetType))",
      }),
  });

  const names = (metadata.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  const worksheetSnapshot = buildWorksheetListSnapshot({ names });

  // 3a. Capture Drive baseline cursor (parity with row_changed; pull
  // doesn't consume it but renew + future polling-mode parity may).
  const pageBaseline = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "google-sheets",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) => changesGetStartPageToken({ accessToken }),
  });
  const pageToken = pageBaseline.startPageToken;
  if (!pageToken) {
    throw new Error(
      "google-sheets new_worksheet activate: changes.getStartPageToken returned no startPageToken.",
    );
  }

  // 3b. Register the Drive file-watch on the spreadsheet's fileId.
  const channelId = `chainreact-${node.id}-${randomUUID()}`;
  const channelToken = buildChannelToken({ channelId });

  const watch = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "google-sheets",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      filesWatch({
        accessToken,
        fileId: config.spreadsheetId,
        channelId,
        channelToken,
        webhookAddress: webhookAddress(),
      }),
  });

  const expiresAt = new Date(Number(watch.expiration)).toISOString();

  return {
    type: SUBSCRIPTION_TYPE,
    webhookEnabled: true,
    spreadsheetId: config.spreadsheetId,
    worksheetSnapshot,
    channelId,
    resourceId: watch.resourceId,
    pageToken,
    expiresAt,
  };
};
