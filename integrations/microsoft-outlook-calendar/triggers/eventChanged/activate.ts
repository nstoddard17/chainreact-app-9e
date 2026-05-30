import { randomBytes } from "node:crypto";
import { createSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";

/**
 * Microsoft Outlook Calendar `event_changed` activation hook.
 *
 * Creates a Microsoft Graph subscription on `/me/events` with
 * `changeType: "created,updated,deleted"`. Returns a config patch the
 * lifecycle service merges into the trigger_resources row.
 *
 * Slice 7 plan §"`event_changed` trigger algorithm":
 *   1. Generate clientState BEFORE the API call (V1 rot fix #2 — same as
 *      Slice 6 mail). The patch is the store-of-record. Network retry on
 *      the wrapper would register two Graph-side subscriptions but
 *      deactivation by subscriptionId still cleans both.
 *   2. POST /v1.0/subscriptions with expiration = now + 4230 minutes
 *      (Outlook /me/events max — same as /me/messages). Graph posts the
 *      validation handshake to `notificationUrl` synchronously; the call
 *      only returns once our webhook route echoes the token back.
 *   3. Return config patch — `type: "subscription-watch"` lets the
 *      renewal cron find this row via JSONB containment, plus
 *      `subscriptionId`, `clientState`, `resource`, `changeType`, and
 *      `expiresAt` (Graph's authoritative value, may be rounded).
 *
 * Throwing aborts the activate transition (TRIGGER_REGISTRATION_FAILED).
 *
 * Slice 7 has no required config fields — emits one event per
 * notification, no per-trigger filtering. Slice 7 plan §"Confirmed scope
 * decisions" #3.
 */

const SUBSCRIPTION_TYPE = "subscription-watch";
const RESOURCE = "/me/events";
const CHANGE_TYPE = "created,updated,deleted";

/**
 * Microsoft's max for Outlook /me/events = 4230 minutes (~70.5h ≈
 * 2.94 days), matching /me/messages. NOT the rounded "3 days" some docs
 * quote.
 */
const EXPIRATION_MINUTES = 4230;

function webhookBaseUrl(): string {
  // Mirror Slice 6 mail — read NEXT_PUBLIC_APP_URL with the dev
  // fallback. Real deployments may override via
  // MICROSOFT_GRAPH_WEBHOOK_URL (full URL); we honor both shapes.
  const explicit = process.env.MICROSOFT_GRAPH_WEBHOOK_URL?.trim();
  if (explicit) {
    // Strip a trailing slash and any /api/webhooks/microsoft-outlook[-calendar]
    // suffix; we always append the canonical path here.
    return stripWebhookPath(explicit);
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return baseUrl;
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  // Match the longer path first so "/api/webhooks/microsoft-outlook-calendar"
  // doesn't degrade to "/api/webhooks/microsoft-outlook" with "-calendar"
  // dangling.
  for (const marker of [
    "/api/webhooks/microsoft-outlook-calendar",
    "/api/webhooks/microsoft-outlook",
  ]) {
    const idx = trimmed.toLowerCase().indexOf(marker);
    if (idx !== -1) return trimmed.slice(0, idx);
  }
  return trimmed;
}

function notificationUrl(): string {
  return `${webhookBaseUrl()}/api/webhooks/microsoft-outlook-calendar`;
}

function lifecycleNotificationUrl(): string {
  return `${webhookBaseUrl()}/api/webhooks/microsoft-outlook-calendar/lifecycle`;
}

function generateClientState(): string {
  // 32 random bytes → 64 hex chars. Matches Slice 6 entropy.
  return randomBytes(32).toString("hex");
}

function expirationFromNow(now: Date = new Date()): string {
  const t = new Date(now.getTime() + EXPIRATION_MINUTES * 60 * 1000);
  return t.toISOString();
}

export const activate: ActivationFn = async ({ integration }) => {
  const clientState = generateClientState();
  const expiresAt = expirationFromNow();

  const result = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-outlook-calendar",
    providerAccountId: integration.accountId,
    apiCall: (accessToken) =>
      createSubscription({
        accessToken,
        resource: RESOURCE,
        changeType: CHANGE_TYPE,
        notificationUrl: notificationUrl(),
        // Required for any subscription with expirationDateTime > 1h.
        // Slice 7 always uses 4230 minutes so this is always set.
        lifecycleNotificationUrl: lifecycleNotificationUrl(),
        expirationDateTime: expiresAt,
        clientState,
      }),
  });

  // Graph's response is authoritative for `id` and `expirationDateTime`.
  // Graph may round the expiration down — use what Graph gave us, not
  // what we requested.
  return {
    type: SUBSCRIPTION_TYPE,
    webhookEnabled: true,
    resource: RESOURCE,
    changeType: CHANGE_TYPE,
    subscriptionId: result.id,
    clientState,
    expiresAt: result.expirationDateTime,
  };
};
