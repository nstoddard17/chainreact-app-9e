import { stripeRequest } from "@/integrations/stripe/api/_request";
import { STRIPE_API_VERSION } from "./_base";

/**
 * Stripe `/v1/webhook_endpoints` API wrappers — Slice 11 Commit 4.
 *
 * Used by the `event_received` trigger's activate / deactivate hooks
 * to manage the platform's Connect-mode webhook endpoint.
 *
 * Critical wiring distinction vs the action wrappers
 * (`integrations/stripe/api/customers.ts`, `paymentIntents.ts`, etc.):
 *
 *   - The action wrappers receive a **merchant** OAuth access token
 *     via `refreshAndRetry`. The token talks to one connected
 *     account's resources.
 *   - These webhook-endpoint wrappers receive the **platform** secret
 *     (`STRIPE_CLIENT_SECRET` env). Stripe Connect's webhook endpoint
 *     management lives on the platform Stripe account, not on
 *     individual merchant accounts. A platform-owned endpoint with
 *     `connect: true` receives events from every connected merchant.
 *
 *   - The platform secret never expires, so we DO NOT route through
 *     `refreshAndRetry`. Direct `stripeRequest` calls only.
 *
 *   - The platform secret env is the same `STRIPE_CLIENT_SECRET` used
 *     for OAuth body-auth (Slice 11 Commit 2). Stripe Connect
 *     platforms have one secret key serving both purposes.
 *
 * Two endpoints in Slice 11 Batch 1: create + delete. List / retrieve /
 * update deferred — orphan-endpoint cleanup is explicitly NOT shipped
 * (per Slice 11 plan §"V1 patterns to skip").
 */

// ─── Wire-format response ───────────────────────────────────────────────────

/**
 * Stripe webhook endpoint resource shape (current docs, cross-checked
 * against V1's `StripeTriggerLifecycle.ts:108-113` create call).
 *
 * `secret` is ONLY returned at create time — Stripe never echoes it
 * on subsequent retrieval / list calls. The receive path verifies
 * Stripe-Signature against this secret, so persistence at activation
 * time is load-bearing.
 */
export interface StripeWebhookEndpoint {
  id: string;
  object: "webhook_endpoint";
  url: string;
  enabled_events: string[];
  status: string;
  livemode: boolean;
  created: number;
  api_version: string | null;
  description: string | null;
  /** ONLY present on the create response. */
  secret?: string;
}

// ─── webhookEndpointsCreate ─────────────────────────────────────────────────

export interface WebhookEndpointsCreateInput {
  /**
   * Platform secret (Stripe Connect platform's `sk_xxx`). NOT a
   * merchant OAuth access token — see file header. Read from
   * `STRIPE_CLIENT_SECRET` env at the call site.
   */
  platformSecret: string;
  /** Notification URL Stripe will POST events to. */
  url: string;
  /**
   * Curated list of Stripe event-type strings (e.g.
   * `["payment_intent.succeeded", "charge.refunded"]`). Caller is
   * responsible for validating against the Slice 11 allowlist before
   * passing in.
   */
  enabled_events: ReadonlyArray<string>;
  /**
   * Connect-mode flag. When true, the endpoint receives events from
   * every connected merchant account on the platform. When false /
   * omitted, Stripe ships only events from the platform's own
   * account. Slice 11 always sets `true`.
   */
  connect?: boolean;
  description?: string;
  /** Stripe API version pin (defaults to the manifest pin). */
  api_version?: string;
}

export async function webhookEndpointsCreate(
  input: WebhookEndpointsCreateInput,
): Promise<StripeWebhookEndpoint> {
  const body: Record<string, unknown> = {
    url: input.url,
    enabled_events: input.enabled_events,
    api_version: input.api_version ?? STRIPE_API_VERSION,
  };
  if (input.connect !== undefined) body.connect = input.connect;
  if (input.description !== undefined) body.description = input.description;

  return stripeRequest<StripeWebhookEndpoint>({
    accessToken: input.platformSecret,
    method: "POST",
    path: "/v1/webhook_endpoints",
    body,
    resourceForNotFound: "webhook_endpoint (create)",
  });
}

// ─── webhookEndpointsDelete ─────────────────────────────────────────────────

export interface WebhookEndpointsDeleteInput {
  platformSecret: string;
  /** Stripe webhook endpoint id (`we_xxx`). */
  id: string;
}

export interface WebhookEndpointsDeleteResponse {
  id: string;
  deleted: true;
  object: "webhook_endpoint";
}

export async function webhookEndpointsDelete(
  input: WebhookEndpointsDeleteInput,
): Promise<WebhookEndpointsDeleteResponse> {
  return stripeRequest<WebhookEndpointsDeleteResponse>({
    accessToken: input.platformSecret,
    method: "DELETE",
    path: `/v1/webhook_endpoints/${encodeURIComponent(input.id)}`,
    resourceForNotFound: `webhook_endpoint ${input.id}`,
  });
}
