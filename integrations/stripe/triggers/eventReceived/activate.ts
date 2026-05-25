import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { webhookEndpointsCreate } from "@/integrations/_shared/stripe/api/webhookEndpoints";
import {
  isAllowedStripeEventType,
  STRIPE_ALLOWED_EVENT_TYPES,
} from "./allowedEventTypes";

/**
 * Stripe `event_received` activation hook — Slice 11 Commit 4.
 *
 * Reads `node.config.enabledEvents` (REQUIRED, non-empty array of
 * allowlisted Stripe event-type strings) and creates a Connect-mode
 * webhook endpoint on the platform's Stripe account. The
 * platform secret (`STRIPE_CLIENT_SECRET` env) is the auth principal
 * — NOT the merchant's OAuth-issued access token. See
 * `_shared/stripe/api/webhookEndpoints.ts` file header for the
 * platform-vs-merchant boundary explanation.
 *
 * Persists the response in `trigger_resources.config`:
 *   - `webhookEnabled: true` (parity with other V2 webhook triggers).
 *   - `endpointId`, `endpointSecret`, `enabledEvents`, `notificationUrl`.
 *
 * **NO `type: "subscription-watch"` field set.** Stripe webhook
 * endpoints don't expire — there's no renewal needed. The
 * `runRenewals` cron filters on `config.type === "subscription-watch"`
 * (`services/triggers/runRenewals.ts:34-36`) and intentionally skips
 * Stripe rows because the marker is absent. This is V2's idiomatic
 * way to opt out of renewals — no permanent-handler stub, no
 * `Number.POSITIVE_INFINITY` threshold, no special subtype.
 *
 * Notification URL: `${V2_BASE_URL}/api/webhooks/stripe?workflowId=X&nodeId=Y`.
 * The query params drive the receive route's strict-direct-lookup
 * (`findByWorkflowAndNode`) — Stripe events carry no endpoint
 * identifier in the body, so the URL is the only stable signal.
 *
 * Throwing aborts the activate transition (TRIGGER_REGISTRATION_FAILED).
 *
 * Activation flow vs Airtable / Microsoft / Google:
 *   - NO validation handshake. Stripe endpoints become active
 *     immediately at create-time.
 *   - NO baseline cursor walk. Stripe events stream live; no
 *     historical replay at activation.
 */

function webhookBaseUrl(): string {
  const explicit = process.env.STRIPE_WEBHOOK_URL?.trim();
  if (explicit) return stripWebhookPath(explicit);
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const idx = trimmed.toLowerCase().indexOf("/api/webhooks/stripe");
  if (idx !== -1) return trimmed.slice(0, idx);
  return trimmed;
}

function notificationUrl(workflowId: string, nodeId: string): string {
  const params = new URLSearchParams({ workflowId, nodeId });
  return `${webhookBaseUrl()}/api/webhooks/stripe?${params.toString()}`;
}

function getPlatformSecret(): string {
  const secret = process.env.STRIPE_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "stripe event_received activate: STRIPE_CLIENT_SECRET env var is not set (required for webhook endpoint management on the platform Stripe account).",
    );
  }
  return secret;
}

export const activate: ActivationFn = async ({ node, workflowId }) => {
  // Validate enabledEvents shape and contents at the schema layer
  // (Q11 — fail loud at design time). The orchestrator runs this
  // BEFORE any Stripe round trip, so misconfigurations don't leak
  // half-created endpoints.
  const raw = node.config?.enabledEvents;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      "stripe event_received activate: node.config.enabledEvents is required (non-empty array of allowlisted Stripe event types).",
    );
  }
  const enabledEvents: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !isAllowedStripeEventType(v)) {
      throw new Error(
        `stripe event_received activate: '${String(v)}' is not in the Slice 11 Batch 1 allowlist. Allowed: ${STRIPE_ALLOWED_EVENT_TYPES.join(", ")}.`,
      );
    }
    enabledEvents.push(v);
  }

  const url = notificationUrl(workflowId, node.id);

  const description = `ChainReact workflow ${workflowId} node ${node.id}`;

  const endpoint = await webhookEndpointsCreate({
    platformSecret: getPlatformSecret(),
    url,
    enabled_events: enabledEvents,
    connect: true,
    description,
  });

  if (!endpoint.secret) {
    // Stripe always returns the signing secret on create-response;
    // missing it means the response shape changed (or this isn't the
    // create endpoint). Fail loud — without the secret the receive
    // route can't verify signatures.
    throw new Error(
      "stripe event_received activate: webhook endpoint create response missing 'secret' (signing secret is only returned at creation time).",
    );
  }

  return {
    webhookEnabled: true,
    endpointId: endpoint.id,
    endpointSecret: endpoint.secret,
    enabledEvents,
    notificationUrl: url,
  };
};
