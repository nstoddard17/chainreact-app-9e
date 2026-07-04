import { calendlyRequest, calendlyRequestVoid } from "./_request";

/**
 * Typed Calendly webhook-subscription lifecycle wrappers — Slice
 * 5.CALENDLY-1.
 *
 * `POST /webhook_subscriptions` and
 * `DELETE /webhook_subscriptions/{uuid}` (both scope `webhooks:write`).
 *
 * Creation semantics (research.md "Webhook subscriptions API"): NO
 * handshake — V2 mints the HMAC `signing_key` itself and sends it in the
 * POST body (Typeform caller-minted-secret posture). `scope: "user"`
 * only this slice (personal credential class); the body carries BOTH the
 * `organization` URI and the `user` URI for user scope (n8n /
 * Activepieces convergent shape; the official example shows org scope).
 *
 * One subscription per V2 trigger node, `events` = exactly one provider
 * event — the per-node `?workflowId=&nodeId=` URL makes each
 * subscription unique, so duplicate-409s are reachable only via orphaned
 * subscriptions (activate.ts humanizes that case).
 *
 * PLAN GATE: webhook subscriptions require the connecting user's
 * Calendly account to be on a paid plan; free-plan creation fails
 * 403-family (mapped to InsufficientScopeError by `_request`;
 * activate.ts humanizes).
 */

export type CalendlyWebhookEvent = "invitee.created" | "invitee.canceled";

export interface CalendlyWebhookSubscription {
  uri?: string;
  callback_url?: string;
  events?: string[];
  scope?: string;
  state?: string;
}

interface SubscriptionEnvelope {
  resource?: CalendlyWebhookSubscription | null;
}

export interface WebhookSubscriptionCreateInput {
  accessToken: string;
  /** The notification URL (carries ?workflowId=&nodeId= for strict lookup). */
  url: string;
  /** Exactly one provider event per V2 trigger node. */
  events: readonly CalendlyWebhookEvent[];
  /** The connected user's organization URI (always required). */
  organizationUri: string;
  /** The connected user's URI (required for scope "user"). */
  userUri: string;
  /** V2-minted HMAC-SHA256 signing key (Calendly-Webhook-Signature). */
  signingKey: string;
}

export async function webhookSubscriptionCreate(
  input: WebhookSubscriptionCreateInput,
): Promise<CalendlyWebhookSubscription> {
  const envelope = await calendlyRequest<SubscriptionEnvelope>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/webhook_subscriptions",
    data: {
      url: input.url,
      events: [...input.events],
      organization: input.organizationUri,
      user: input.userUri,
      scope: "user",
      signing_key: input.signingKey,
    },
    resourceForNotFound: "webhook subscriptions",
  });
  return envelope.resource ?? {};
}

export interface WebhookSubscriptionDeleteInput {
  accessToken: string;
  /** UUID (last URI segment) of the subscription to delete. */
  subscriptionUuid: string;
}

export async function webhookSubscriptionDelete(
  input: WebhookSubscriptionDeleteInput,
): Promise<void> {
  await calendlyRequestVoid({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/webhook_subscriptions/${encodeURIComponent(input.subscriptionUuid)}`,
    resourceForNotFound: `webhook subscription ${input.subscriptionUuid}`,
  });
}
