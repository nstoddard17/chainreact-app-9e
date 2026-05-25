import { randomUUID } from "node:crypto";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";
import { changesGetStartPageToken } from "@/integrations/google-drive/api/changesGetStartPageToken";
import { filesWatch } from "@/integrations/google-drive/api/filesWatch";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { valuesGet } from "../../api/valuesGet";
import {
  buildBoundedSnapshot,
  type BoundedSnapshot,
} from "../_shared/snapshot";
import {
  RowChangedInputConfigSchema,
  requiresExtendedSnapshot,
  type RowChangedInputConfig,
} from "./schema";

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
 * Five steps, in this order:
 *   1. Parse + validate config via `RowChangedInputConfigSchema`. Strict
 *      schema rejects V1 polling chrome (`hasHeaders`, `skipEmptyRows`,
 *      `requiredColumns`) + unknown fields at activate time.
 *   2. Snapshot initial state — `values.get` on the configured sheet's
 *      `<sheetName>!A:Z` range, store `lastRowCount = values.length`.
 *      Without this, the first push notification arrives and pull
 *      would backfill all existing rows as "added" events. V1's
 *      "first poll miss" lesson applied to Sheets.
 *   3. If `changeKinds` includes "updated" or "removed" — seed a
 *      bounded per-row snapshot via `buildBoundedSnapshot`. Strict
 *      reject if the sheet exceeds `snapshotRowLimit × 2` (per the
 *      D-OverflowAtActivate decision: fail loud, don't silently
 *      truncate, don't auto-raise). For `changeKinds = ["added"]`
 *      (the Slice 5 default), no snapshot is seeded — the existing
 *      count-delta fast path is preserved for backwards compat.
 *   4. Drive watch registration — capture `pageToken` (persisted for
 *      future polling-mode parity), generate channelId + HMAC token,
 *      call `files.watch` with `fileId = spreadsheetId`. Returns
 *      `{id, resourceId, expiration}`.
 *   5. Return the merged config patch. Lifecycle merges this with
 *      `node.config` to form the persisted `trigger_resources.config`.
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
  // 1. Parse + validate config. ZodError surfaces as TRIGGER_REGISTRATION_FAILED.
  const config: RowChangedInputConfig = RowChangedInputConfigSchema.parse(
    node.config ?? {},
  );

  // 2. Snapshot initial row count so the first notification doesn't backfill.
  const initialValues = await refreshAndRetry({
    userId: integration.userId,
    provider: "google-sheets",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      valuesGet({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!A:Z`,
      }),
  });
  const rows = (initialValues.values ?? []) as ReadonlyArray<
    ReadonlyArray<unknown>
  >;
  const lastRowCount = rows.length;

  // 3. Optionally seed the bounded snapshot. The schema's
  // `keyColumn requires headerRow: true` refine guards the keyColumn
  // precondition; `buildBoundedSnapshot` re-guards defensively and
  // surfaces overflow / missing-column errors as throws.
  let snapshot: BoundedSnapshot | null = null;
  if (requiresExtendedSnapshot(config)) {
    const result = buildBoundedSnapshot({
      rows,
      headerRow: config.headerRow,
      snapshotRowLimit: config.snapshotRowLimit,
      keyColumn: config.keyColumn,
    });
    snapshot = result.snapshot;
  }

  // 4. Capture Drive baseline cursor. Persisted for future polling-mode
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

  // 5. Register the Drive file-watch on the spreadsheet's fileId.
  const channelId = `chainreact-${node.id}-${randomUUID()}`;
  const channelToken = buildChannelToken({ channelId });

  const watch = await refreshAndRetry({
    userId: integration.userId,
    provider: "google-sheets",
    accountId: integration.providerAccountId,
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

  // Merged config patch. snapshot field is omitted entirely (not set
  // to null) for `changeKinds = ["added"]` so the persisted shape
  // matches Slice 5 byte-for-byte and the `hasExtendedChangeKinds`
  // predicate (Commit 3) can use absence as the fast-path signal.
  return {
    type: SUBSCRIPTION_TYPE,
    webhookEnabled: true,
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName,
    headerRow: config.headerRow,
    changeKinds: config.changeKinds,
    snapshotRowLimit: config.snapshotRowLimit,
    keyColumn: config.keyColumn,
    ...(snapshot !== null ? { snapshot } : {}),
    channelId,
    resourceId: watch.resourceId,
    pageToken,
    lastRowCount,
    expiresAt,
  };
};
