import { randomUUID } from "node:crypto";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { changesGetStartPageToken } from "../../api/changesGetStartPageToken";
import { filesWatch } from "../../api/filesWatch";

/**
 * Google Drive file_changed activation hook.
 *
 * Runs at workflow-activate time, BEFORE the trigger_resources row is
 * upserted. Throwing aborts the activate transition (the orchestrator
 * wraps with TRIGGER_REGISTRATION_FAILED — the user sees a clear
 * "we couldn't reach Google Drive right now" error).
 *
 * Two-step:
 *   1. Capture baseline cursor — `changes.getStartPageToken`. Without
 *      this, the first push notification arrives before we have a
 *      baseline and the first `pull` would have nothing to compare
 *      against. V1 lesson "first poll miss", applied to push triggers
 *      and to Drive's pageToken cursor model.
 *   2. Watch registration — generate a unique
 *      `chainreact-{nodeId}-{uuid}` channelId, sign it with HMAC, and
 *      call `files.watch` on the configured `fileId` (defaults to the
 *      literal string "root"). Returns `{ id, resourceId, expiration }`.
 *
 * Root-watch invariant: when the workflow doesn't pin a folder, we store
 * the literal string `"root"` as `fileId` so renewal can re-watch the
 * same target unambiguously. V1's `fileId || 'root'` collapse loses this
 * information and renewal couldn't tell "configured for root" from
 * "configured for some-now-deleted folder".
 *
 * The returned config patch tags the row with `type: "subscription-watch"`
 * so the renewal cron can find it.
 */

const SUBSCRIPTION_TYPE = "subscription-watch";

function webhookAddress(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/google-drive`;
}

export const activate: ActivationFn = async ({ node, integration }) => {
  // fileId — when unset, watch the entire user-owned drive ("root"). The
  // literal string "root" is Drive's API-level alias for the user's root
  // folder; we store it explicitly.
  const fileId =
    (node.config?.fileId as string | undefined)?.trim() || "root";

  // 1. Capture baseline cursor.
  const baseline = await refreshAndRetry({
    userId: integration.userId,
    provider: "google-drive",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) => changesGetStartPageToken({ accessToken }),
  });
  const pageToken = baseline.startPageToken;
  if (!pageToken) {
    throw new Error(
      "google-drive activate: changes.getStartPageToken returned no startPageToken.",
    );
  }

  // 2. Generate channel + token, register the watch.
  const channelId = `chainreact-${node.id}-${randomUUID()}`;
  const channelToken = buildChannelToken({ channelId });

  const watch = await refreshAndRetry({
    userId: integration.userId,
    provider: "google-drive",
    accountId: integration.providerAccountId,
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

  // ActivationFn returns a flat config patch that lifecycle.ts merges into
  // the node's existing config. `type: "subscription-watch"` is the
  // discriminator the renewal cron uses to find rows that need watch
  // renewal (config @> { type: "subscription-watch" }).
  return {
    type: SUBSCRIPTION_TYPE,
    webhookEnabled: true,
    fileId,
    channelId,
    resourceId: watch.resourceId,
    pageToken,
    expiresAt,
  };
};
