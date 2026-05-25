import { randomBytes } from "node:crypto";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { createSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";

/**
 * Microsoft Outlook email_flagged activation hook.
 *
 * Outlook Mail 2.3 Commit 3. Mirrors the new_email lifecycle, with two
 * key differences:
 *   - changeType is `updated` (flag changes are message updates;
 *     Graph has no dedicated "flagged" event type).
 *   - resource respects optional `node.config.folder` like new_email —
 *     when set, /me/mailFolders/{folder}/messages; otherwise
 *     /me/messages.
 *
 *   - expiration: 4230 minutes (Outlook max).
 *   - threshold:  1h (renewal).
 *   - scope:      Mail.Read (already in manifest).
 *
 * V1-parity over-fire (D-OM4): the receive route applies a
 * `flag.flagStatus === "flagged"` check after fetching the message,
 * but does NOT track prior state. ANY update that leaves the message
 * flagged will fire the trigger. Subject edits, body updates, and
 * re-flags all dispatch.
 */

const SUBSCRIPTION_TYPE = "subscription-watch";
const DEFAULT_RESOURCE = "/me/messages";
const CHANGE_TYPE = "updated";
const EXPIRATION_MINUTES = 4230;

function resolveResource(config: Readonly<Record<string, unknown>>): string {
  const folder = config.folder;
  if (typeof folder === "string" && folder.trim().length > 0) {
    return `/me/mailFolders/${folder.trim()}/messages`;
  }
  return DEFAULT_RESOURCE;
}

function webhookBaseUrl(): string {
  const explicit = process.env.MICROSOFT_GRAPH_WEBHOOK_URL?.trim();
  if (explicit) {
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
        lifecycleNotificationUrl: lifecycleNotificationUrl(),
        expirationDateTime: expiresAt,
        clientState,
      }),
  });

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
