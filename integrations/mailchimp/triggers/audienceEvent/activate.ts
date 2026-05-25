import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import {
  MAILCHIMP_WEBHOOK_EVENT_NAMES,
  type MailchimpWebhookEvents,
  type MailchimpWebhookSources,
  webhooksCreateOrAdopt,
} from "@/integrations/_shared/mailchimp/api/webhooks";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";
import {
  isAllowedMailchimpEventType,
  MAILCHIMP_ALLOWED_EVENT_TYPES,
  type MailchimpAllowedEventType,
} from "./allowedEventTypes";

/**
 * Mailchimp `audience_event` activation hook — Slice 14 Commit 4.
 *
 * Reads `node.config.audienceId` (REQUIRED, non-empty string) and
 * `node.config.eventTypes` (REQUIRED, non-empty array of allowlisted
 * event-type strings) and creates ONE webhook subscription on the
 * audience using the account's access token + integration metadata dc.
 *
 * **Single webhook with bitmap of events.** Unlike Shopify's
 * one-webhook-per-topic model, Mailchimp expresses subscribed events
 * as a 6-boolean map on a single webhook resource. The activation
 * sends the full map (true for selected, false for everything else).
 *
 * **Duplicate-URL recovery.** Mailchimp 400s with "can't set up
 * multiple WebHooks" when the same URL is already subscribed on the
 * list (typically: a previous activation that left an orphan webhook
 * after a partial failure). `webhooksCreateOrAdopt` detects this and
 * PATCHes the existing webhook to match the current event set instead
 * of failing. Activations should be effectively idempotent against
 * re-runs.
 *
 * Persists in `trigger_resources.config`:
 *   - `webhookEnabled: true` (parity with other V2 webhook triggers).
 *   - `audienceId` — the Mailchimp audience (list) id. Stored even
 *     though it's also derivable from the integration row because
 *     the deactivate hook reads it directly from `config` without
 *     extra lookup; the receive helper compares the inbound
 *     `data[list_id]` to this value to filter out cross-audience
 *     events that hit the same workflowId/nodeId URL.
 *   - `eventTypes: string[]` — activation-time event-type allowlist.
 *     Receive route uses this for filtering; events outside the list
 *     are 200-acked without dispatch.
 *   - `webhookId` — the Mailchimp webhook resource id (string UUID).
 *     Used by deactivation for the DELETE call.
 *   - `webhookUrl` — the callback URL we registered (for diagnostics).
 *   - `adopted: boolean` — true when activation found and adopted an
 *     existing webhook rather than creating a fresh one.
 *
 * **NO `type: "subscription-watch"` field.** Mailchimp webhooks don't
 * expire. The `runRenewals` cron filters on
 * `config.type === "subscription-watch"` — Mailchimp's activate
 * intentionally omits it so the renewal cron never picks up
 * Mailchimp rows. Same "permanent endpoint" pattern as Stripe /
 * Shopify / GitHub / HubSpot.
 *
 * **Notification URL** — `${BASE}/api/webhooks/mailchimp?workflowId=X&nodeId=Y`.
 * Mailchimp issues a GET to this URL immediately after webhook create
 * for handshake; the route returns 200 OK with no body. Subsequent
 * deliveries are POSTs to the same URL.
 *
 * Throws abort the activate transition (TRIGGER_REGISTRATION_FAILED).
 */

function webhookBaseUrl(): string {
  const explicit = process.env.MAILCHIMP_WEBHOOK_URL?.trim();
  if (explicit) return stripWebhookPath(explicit);
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const idx = trimmed.toLowerCase().indexOf("/api/webhooks/mailchimp");
  if (idx !== -1) return trimmed.slice(0, idx);
  return trimmed;
}

function notificationUrl(workflowId: string, nodeId: string): string {
  const params = new URLSearchParams({ workflowId, nodeId });
  return `${webhookBaseUrl()}/api/webhooks/mailchimp?${params.toString()}`;
}

/**
 * Build Mailchimp's full event bitmap from the workflow's selected
 * subset. Mailchimp REQUIRES every field to be explicitly true/false
 * (a missing field is ambiguous in Mailchimp's docs across API
 * versions — V1 ships the bitmap unconditionally for safety, V2
 * preserves).
 */
function buildEventBitmap(
  selected: readonly MailchimpAllowedEventType[],
): MailchimpWebhookEvents {
  const set = new Set(selected);
  const bitmap: Record<string, boolean> = {};
  for (const name of MAILCHIMP_WEBHOOK_EVENT_NAMES) {
    bitmap[name] = set.has(name);
  }
  return bitmap as MailchimpWebhookEvents;
}

/**
 * Sources: all three true so the trigger fires regardless of WHICH
 * actor causes the change. V1
 * [`MailchimpTriggerLifecycle.ts:208-212`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts#L208)
 * uses the same default. Workflow authors that want to filter by
 * source can branch on `payload.parsed.data` downstream — Mailchimp
 * doesn't expose the source on the inbound payload, so this would
 * actually require API enrichment; not a Batch 1 concern.
 */
const DEFAULT_SOURCES: MailchimpWebhookSources = {
  user: true,
  admin: true,
  api: true,
};

export const activate: ActivationFn = async ({
  node,
  integration,
  workflowId,
}) => {
  // Validate audienceId.
  const audienceId = node.config?.audienceId;
  if (typeof audienceId !== "string" || audienceId.length === 0) {
    throw new Error(
      "mailchimp audience_event activate: node.config.audienceId is required (non-empty string).",
    );
  }

  // Validate eventTypes.
  const rawEventTypes = node.config?.eventTypes;
  if (!Array.isArray(rawEventTypes) || rawEventTypes.length === 0) {
    throw new Error(
      "mailchimp audience_event activate: node.config.eventTypes is required (non-empty array of allowlisted event-type strings).",
    );
  }
  const eventTypes: MailchimpAllowedEventType[] = [];
  for (const v of rawEventTypes) {
    if (typeof v !== "string" || !isAllowedMailchimpEventType(v)) {
      throw new Error(
        `mailchimp audience_event activate: '${String(v)}' is not in the Slice 14 Batch 1 event-type allowlist. Allowed: ${MAILCHIMP_ALLOWED_EVENT_TYPES.join(", ")}.`,
      );
    }
    eventTypes.push(v);
  }
  // De-duplicate (workflow UI could theoretically submit the same
  // event type twice).
  const uniqueEventTypes = Array.from(new Set(eventTypes));

  // Read dc from the integration's accountMetadata.
  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    throw new MissingDataCenterError();
  }

  const accessToken = decryptToken(integration.accessTokenEncrypted);
  const url = notificationUrl(workflowId, node.id);
  const events = buildEventBitmap(uniqueEventTypes);

  const { webhook, adopted } = await webhooksCreateOrAdopt({
    accessToken,
    dc,
    audienceId,
    url,
    events,
    sources: DEFAULT_SOURCES,
  });

  return {
    webhookEnabled: true,
    audienceId,
    eventTypes: uniqueEventTypes,
    webhookId: webhook.id,
    webhookUrl: url,
    adopted,
  };
};
