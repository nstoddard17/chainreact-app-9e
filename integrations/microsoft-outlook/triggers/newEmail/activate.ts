import { randomBytes } from "node:crypto";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { createSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";

/**
 * Microsoft Outlook new_email activation hook.
 *
 * Creates a Microsoft Graph subscription on `/me/messages` with
 * `changeType: "created"`. Returns a config patch the lifecycle service
 * merges into the trigger_resources row.
 *
 * Slice 6 plan §"Trigger algorithm" steps:
 *   1. Generate clientState BEFORE the API call. Persisting in the patch
 *      and sending in the body — store-of-record is what we put in the
 *      patch. If the API call retries (network blip), we'd register two
 *      Graph-side subscriptions with the same clientState; the
 *      deactivation hook still deletes both because Graph keys on
 *      subscriptionId, but we'd carry orphaned state. Generating outside
 *      the call site keeps this rare and recoverable. V1 generated
 *      inside `createSubscription` then propagated up — same race window
 *      we collapse here.
 *   2. POST /v1.0/subscriptions with expiration = now + 4230 minutes
 *      (Outlook /me/messages max). Graph posts validation handshake to
 *      `notificationUrl` synchronously; the call only returns after the
 *      handshake echoes our token back.
 *   3. Return config patch — `type: "subscription-watch"` (lets the
 *      renewal cron find this row via JSONB containment),
 *      `subscriptionId`, `clientState`, `resource`, `changeType`,
 *      `expiresAt` (read by runRenewals.ts:106 from config).
 *
 * Throwing aborts the activate transition (TRIGGER_REGISTRATION_FAILED).
 *
 * Slice 6 has no required config fields beyond the standard workflow
 * plumbing — no folder filtering, no sender filter, no subject filter.
 * Slice 6 plan §"Confirmed scope decisions" #3.
 */

const SUBSCRIPTION_TYPE = "subscription-watch";
const DEFAULT_RESOURCE = "/me/messages";
const CHANGE_TYPE = "created";

/**
 * Outlook Mail 2.3 D-OM3 — folder-scoped subscription routing.
 *
 * When `node.config.folder` is a non-empty string, the activation hook
 * subscribes to the folder-scoped resource instead of `/me/messages`.
 * Matches V1's MicrosoftGraphTriggerLifecycle line 531-537. Lower
 * bandwidth than receive-time folder filtering — Graph only emits
 * notifications for messages in the chosen folder.
 *
 * Folder ids may be well-known names (`inbox`, `sentitems`, etc.) OR
 * custom Graph folder ids; the activate hook passes them verbatim. The
 * receive route applies any additional non-folder filters (sender,
 * subject, hasAttachment, importance) at receive-time.
 */
function resolveResource(config: Readonly<Record<string, unknown>>): string {
  const folder = config.folder;
  if (typeof folder === "string" && folder.trim().length > 0) {
    return `/me/mailFolders/${folder.trim()}/messages`;
  }
  return DEFAULT_RESOURCE;
}

/**
 * Microsoft's max for Outlook /me/messages = 4230 minutes (~70.5h ≈
 * 2.94 days). NOT the rounded "3 days" some docs quote — see Slice 6
 * plan §"Risk callouts" #2.
 */
const EXPIRATION_MINUTES = 4230;

function webhookBaseUrl(): string {
  // Mirror Sheets / Drive / Calendar — read NEXT_PUBLIC_APP_URL with the
  // dev fallback. Real deployments may override via
  // MICROSOFT_GRAPH_WEBHOOK_URL (full URL); we honor both shapes.
  const explicit = process.env.MICROSOFT_GRAPH_WEBHOOK_URL?.trim();
  if (explicit) {
    // Strip a trailing slash and any /api/webhooks/microsoft-outlook
    // suffix; we always append the canonical path here.
    return stripWebhookPath(explicit);
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return baseUrl;
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const marker = "/api/webhooks/microsoft-outlook";
  const idx = trimmed.toLowerCase().indexOf(marker);
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

function notificationUrl(): string {
  return `${webhookBaseUrl()}/api/webhooks/microsoft-outlook`;
}

function lifecycleNotificationUrl(): string {
  return `${webhookBaseUrl()}/api/webhooks/microsoft-outlook/lifecycle`;
}

function generateClientState(): string {
  // 32 random bytes → 64 hex chars. Matches V1's
  // subscriptionManager.ts:519-521 entropy budget.
  return randomBytes(32).toString("hex");
}

function expirationFromNow(now: Date = new Date()): string {
  const t = new Date(now.getTime() + EXPIRATION_MINUTES * 60 * 1000);
  return t.toISOString();
}

export const activate: ActivationFn = async ({ integration, node }) => {
  const clientState = generateClientState();
  const expiresAt = expirationFromNow();
  const resource = resolveResource(node.config);

  const result = await refreshAndRetry({
    userId: integration.userId,
    provider: "microsoft-outlook",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      createSubscription({
        accessToken,
        resource,
        changeType: CHANGE_TYPE,
        notificationUrl: notificationUrl(),
        // Required for any subscription with expirationDateTime > 1h.
        // Slice 6 always uses 4230 minutes so this is always set.
        lifecycleNotificationUrl: lifecycleNotificationUrl(),
        expirationDateTime: expiresAt,
        clientState,
      }),
  });

  // Return value Graph echoes is authoritative for `id` and
  // `expirationDateTime`. Graph may round the expiration down — use
  // what Graph gave us, not what we requested. The resolved resource
  // is persisted so the renewal hook + receive-time logging can verify
  // it later.
  return {
    type: SUBSCRIPTION_TYPE,
    webhookEnabled: true,
    resource,
    changeType: CHANGE_TYPE,
    subscriptionId: result.id,
    clientState,
    expiresAt: result.expirationDateTime,
  };
};
