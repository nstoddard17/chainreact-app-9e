import { randomBytes } from "node:crypto";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { createSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";

/**
 * Microsoft Outlook email_sent activation hook.
 *
 * Outlook Mail 2.3 Commit 3. Mirrors the new_email lifecycle exactly
 * except the subscription resource is the well-known SentItems mail
 * folder. Graph emits a `created` event on this folder each time an
 * outgoing message is committed (Outlook copies the sent message into
 * SentItems immediately after sendMail succeeds — this is how Graph
 * represents "an email was sent").
 *
 *   - resource:   /me/mailFolders/SentItems/messages
 *   - changeType: created
 *   - expiration: 4230 minutes (Outlook /me/messages max)
 *   - threshold:  1h (renewal)
 *   - scope:      Mail.Read (already in manifest from Slice 6 / 2.1)
 *
 * Per-workflow per-account subscription. No filter routing into the
 * resource path — `to` / `subject` filters are receive-time only
 * (the SentItems folder is the only resource scope V1 supports for
 * this trigger).
 */

const SUBSCRIPTION_TYPE = "subscription-watch";
const RESOURCE = "/me/mailFolders/SentItems/messages";
const CHANGE_TYPE = "created";
const EXPIRATION_MINUTES = 4230;

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

export const activate: ActivationFn = async ({ integration }) => {
  const clientState = generateClientState();
  const expiresAt = expirationFromNow();

  const result = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-outlook",
    providerAccountId: integration.providerAccountId,
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
