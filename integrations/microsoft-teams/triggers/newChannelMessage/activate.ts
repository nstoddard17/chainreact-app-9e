import { randomBytes } from "node:crypto";
import { createSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { NewChannelMessageConfigSchema } from "./schema";

/**
 * Microsoft Teams `new_channel_message` activation hook.
 *
 * Mirrors slice 6 mail / slice 7 calendar / slice 8 OneDrive shape:
 *   1. Validate the node config (must carry teamId + channelId).
 *   2. Generate 32-byte hex clientState (closes V1 rot — V1 used
 *      `workflow_${workflowId}` which leaks the workflow id in the
 *      Graph subscription record).
 *   3. POST /v1.0/subscriptions on the channel-messages resource
 *      with `changeType: "created"` + `includeResourceData: false`.
 *      The shared wrapper performs the synchronous validation
 *      handshake against our notificationUrl before returning.
 *
 * `includeResourceData: false` keeps the certificate / encrypted-
 * notification plumbing out of Batch 1 — receive route does an
 * id-fetch GET to hydrate the message resource.
 *
 * Returns a config patch the lifecycle service merges into the
 * trigger_resources row. `type: "subscription-watch"` lets the
 * renewal cron find this row via JSONB containment.
 *
 * Throwing aborts the activate transition (TRIGGER_REGISTRATION_FAILED).
 */

const SUBSCRIPTION_TYPE = "subscription-watch";
const CHANGE_TYPE = "created" as const;

/**
 * Microsoft Graph max for `/teams/.../channels/.../messages` =
 * 4230 minutes (~70.5h). Same as slice 6/7/8 sibling providers.
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
 * The same MICROSOFT_GRAPH_WEBHOOK_URL env var is shared with sibling
 * Microsoft providers; users may set it to any provider's webhook path.
 * Strip whichever is longest first so a value pointing at the
 * calendar path doesn't degrade to "outlook" with "-calendar" dangling.
 * Same defensive ordering as Slice 7/8 activate hooks.
 */
function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  for (const marker of [
    "/api/webhooks/microsoft-outlook-calendar",
    "/api/webhooks/microsoft-outlook",
    "/api/webhooks/microsoft-onedrive",
    "/api/webhooks/microsoft-teams",
  ]) {
    const idx = trimmed.toLowerCase().indexOf(marker);
    if (idx !== -1) return trimmed.slice(0, idx);
  }
  return trimmed;
}

function notificationUrl(): string {
  return `${webhookBaseUrl()}/api/webhooks/microsoft-teams`;
}

function lifecycleNotificationUrl(): string {
  return `${webhookBaseUrl()}/api/webhooks/microsoft-teams/lifecycle`;
}

function generateClientState(): string {
  return randomBytes(32).toString("hex");
}

function expirationFromNow(now: Date = new Date()): string {
  const t = new Date(now.getTime() + EXPIRATION_MINUTES * 60 * 1000);
  return t.toISOString();
}

export const activate: ActivationFn = async ({ integration, node }) => {
  // Validate the user-supplied trigger config. The orchestrator hasn't
  // persisted the row yet, so we read teamId/channelId from node.config
  // directly. Lifecycle-managed fields are absent here — they get
  // populated by the returned config patch.
  const parsed = NewChannelMessageConfigSchema.parse({
    teamId: (node.config as { teamId?: string }).teamId,
    channelId: (node.config as { channelId?: string }).channelId,
  });

  const resource = `/teams/${parsed.teamId}/channels/${parsed.channelId}/messages`;
  const clientState = generateClientState();
  const expiresAt = expirationFromNow();

  // POST /v1.0/subscriptions — Graph performs the synchronous
  // validation handshake against our notificationUrl + lifecycle URL
  // before returning. Failure → throw → orchestrator records as
  // TRIGGER_REGISTRATION_FAILED.
  const result = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-teams",
    providerAccountId: integration.providerAccountId,
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

  // Graph's response is authoritative for `id` and `expirationDateTime`.
  // The shared wrapper does not set includeResourceData; the default
  // (false) is what we want — Batch 1 intentionally avoids encrypted
  // resource notifications and certificate plumbing.
  return {
    teamId: parsed.teamId,
    channelId: parsed.channelId,
    type: SUBSCRIPTION_TYPE,
    webhookEnabled: true,
    resource,
    changeType: CHANGE_TYPE,
    subscriptionId: result.id,
    clientState,
    expiresAt: result.expirationDateTime,
  };
};
