import { randomBytes } from "node:crypto";
import { createSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { driveRootDelta } from "../../api/driveRootDelta";

/**
 * Microsoft OneDrive `file_changed` activation hook.
 *
 * Three-step:
 *   1. Generate clientState (32-byte hex, persisted before the API call —
 *      V1 rot fix #2 from Slice 6/7).
 *   2. Capture initial delta cursor — `driveRootDelta()` with no
 *      nextLink walks /me/drive/root/delta?$top=1 to the terminal
 *      `@odata.deltaLink`. Persist as `deltaToken` so the receive
 *      path's delta-fallback branch has a baseline. Without this, the
 *      first delta-fallback notification would re-emit every file in
 *      the drive (Slice 8 plan §"file_changed trigger algorithm" —
 *      activate step 3).
 *   3. POST /v1.0/subscriptions on /me/drive/root with
 *      `changeType: "updated"` (the only changeType Graph supports for
 *      drive subscriptions). Wraps in `refreshAndRetry`.
 *
 * Returns a config patch the lifecycle service merges into the
 * trigger_resources row. `type: "subscription-watch"` lets the renewal
 * cron find this row via JSONB containment.
 *
 * Throwing aborts the activate transition (TRIGGER_REGISTRATION_FAILED).
 *
 * Slice 8 has no required config fields — the trigger emits one event
 * per detected change, no per-trigger filtering. Per-folder /
 * per-kind / per-mimeType filters deferred per Slice 8 plan
 * §"Out-of-scope".
 */

const SUBSCRIPTION_TYPE = "subscription-watch";
const RESOURCE = "/me/drive/root";
/**
 * Microsoft Graph supports ONLY `updated` for drive-root subscriptions.
 * Newly-created items surface as updates to the parent folder; the
 * receive path's delta-fallback branch recovers the actual new child.
 * Slice 8 plan §"Risk callouts" #2.
 */
const CHANGE_TYPE = "updated";

/**
 * Microsoft's max for `/me/drive/root` = 4230 minutes (~70.5h, same as
 * `/me/messages` and `/me/events`). Hardened in Slice 6/7.
 */
const EXPIRATION_MINUTES = 4230;

function webhookBaseUrl(): string {
  const explicit = process.env.MICROSOFT_GRAPH_WEBHOOK_URL?.trim();
  if (explicit) {
    return stripWebhookPath(explicit);
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return baseUrl;
}

/**
 * The same MICROSOFT_GRAPH_WEBHOOK_URL env var is shared with Slice 6
 * mail and Slice 7 calendar; users may set it to any of the three
 * webhook paths. We strip whichever is longest first so a value
 * pointing at the calendar path doesn't degrade to "outlook" with
 * "-calendar" dangling. Same defensive ordering as Slice 7's activate.
 */
function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  for (const marker of [
    "/api/webhooks/microsoft-outlook-calendar",
    "/api/webhooks/microsoft-outlook",
    "/api/webhooks/microsoft-onedrive",
  ]) {
    const idx = trimmed.toLowerCase().indexOf(marker);
    if (idx !== -1) return trimmed.slice(0, idx);
  }
  return trimmed;
}

function notificationUrl(): string {
  return `${webhookBaseUrl()}/api/webhooks/microsoft-onedrive`;
}

function lifecycleNotificationUrl(): string {
  return `${webhookBaseUrl()}/api/webhooks/microsoft-onedrive/lifecycle`;
}

function generateClientState(): string {
  return randomBytes(32).toString("hex");
}

function expirationFromNow(now: Date = new Date()): string {
  const t = new Date(now.getTime() + EXPIRATION_MINUTES * 60 * 1000);
  return t.toISOString();
}

export const activate: ActivationFn = async ({ integration }) => {
  const clientState = generateClientState();
  const expiresAt = expirationFromNow();

  // 1. Capture initial delta cursor via baseline walk. This MUST happen
  //    BEFORE the subscription is created — the first notification can
  //    arrive within seconds of subscription creation; without a
  //    baseline cursor the delta-fallback would re-emit every file.
  const baseline = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-onedrive",
    providerAccountId: integration.accountId,
    apiCall: (accessToken) => driveRootDelta({ accessToken }),
  });
  const deltaToken = baseline.deltaLink;

  // 2. Create the Graph subscription. Graph synchronously POSTs the
  //    validation handshake to our notificationUrl; the call only
  //    returns after our route echoes the token back as text/plain.
  const result = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-onedrive",
    providerAccountId: integration.accountId,
    apiCall: (accessToken) =>
      createSubscription({
        accessToken,
        resource: RESOURCE,
        changeType: CHANGE_TYPE,
        notificationUrl: notificationUrl(),
        lifecycleNotificationUrl: lifecycleNotificationUrl(),
        expirationDateTime: expiresAt,
        clientState,
      }),
  });

  // Graph's response is authoritative for `id` and `expirationDateTime`.
  return {
    type: SUBSCRIPTION_TYPE,
    webhookEnabled: true,
    resource: RESOURCE,
    changeType: CHANGE_TYPE,
    subscriptionId: result.id,
    clientState,
    deltaToken,
    expiresAt: result.expirationDateTime,
  };
};
