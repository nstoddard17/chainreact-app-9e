import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { verifyShopifySignature } from "@/integrations/_shared/shopify/webhooks/signature";
import { isAllowedShopifyTopic } from "./allowedTopics";
import { normalizeShopifyEvent, type ShopifyHeaders } from "./normalize";

/**
 * Verify and parse an inbound Shopify webhook delivery — Slice 12 Commit 4.
 *
 * Strict-direct-lookup pattern (per Slice 11 / Stripe shape):
 *   - Reads `workflowId` + `nodeId` from URL query params (set by
 *     activate at webhook-create time).
 *   - Calls `findByWorkflowAndNode` (service-role) for the single
 *     matching trigger row.
 *   - Verifies `X-Shopify-Hmac-SHA256` against `SHOPIFY_CLIENT_SECRET`
 *     — single global app secret (NOT a per-trigger-row secret like
 *     Stripe). NO multi-secret fallback.
 *
 * Outcomes:
 *   - `unknown_workflow`: query params missing OR no matching row.
 *     Route maps to a 200 quiet ack — Shopify retries on non-2xx for
 *     up to 48 hours, and in-flight events for a deleted workflow
 *     shouldn't trigger that storm.
 *   - `unsupported_topic`: signature OK + trigger found, but the
 *     received topic is NOT in the trigger's activation-time
 *     allowlist (defense-in-depth — dashboard re-config could
 *     subscribe extra topics out-of-band, or Shopify could ship a
 *     legacy delivery for a topic the workflow author since
 *     deselected). Route 200-acks without dispatch.
 *   - `events`: signature verified + topic allowed. Route dispatches.
 *
 * Throws (route maps to 401):
 *   - `InvalidSignatureError` for missing header / malformed-base64 /
 *     length-mismatch / signature mismatch / missing
 *     `SHOPIFY_CLIENT_SECRET` env.
 *
 * Throws (route maps to 500):
 *   - any unexpected error from JSON parse / repo lookup.
 */

export type ReceiveResult =
  | { kind: "unknown_workflow" }
  | { kind: "unsupported_topic"; topic: string }
  | { kind: "events"; events: TriggerEvent[] };

const SIGNATURE_HEADER = "x-shopify-hmac-sha256";
const TOPIC_HEADER = "x-shopify-topic";
const SHOP_DOMAIN_HEADER = "x-shopify-shop-domain";
const WEBHOOK_ID_HEADER = "x-shopify-webhook-id";
const TRIGGERED_AT_HEADER = "x-shopify-triggered-at";

interface QueryDescriptor {
  workflowId: string;
  nodeId: string;
}

function parseQuery(url: string): QueryDescriptor | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const workflowId = parsed.searchParams.get("workflowId");
  const nodeId = parsed.searchParams.get("nodeId");
  if (!workflowId || !nodeId) return null;
  return { workflowId, nodeId };
}

function getAppSecret(): string {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    throw new InvalidSignatureError(
      "Shopify webhook: SHOPIFY_CLIENT_SECRET env var is not set — refusing to accept unsigned-equivalent traffic.",
    );
  }
  return secret;
}

export async function receiveShopifyWebhook(
  request: Request,
): Promise<ReceiveResult> {
  // 1. Parse strict-direct-lookup query params. Missing → 200 quiet
  //    ack (in-flight delivery for deleted workflow).
  const query = parseQuery(request.url);
  if (!query) return { kind: "unknown_workflow" };

  // 2. Read raw body BEFORE parse — signature is over these bytes.
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    throw new InvalidSignatureError("Shopify webhook: empty body.");
  }

  // 3. Verify signature against the global app secret.
  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const verifyResult = verifyShopifySignature(
    rawBody,
    signatureHeader,
    getAppSecret(),
  );
  if (!verifyResult.valid) {
    throw new InvalidSignatureError(
      `Shopify webhook: signature verification failed (${verifyResult.reason}).`,
    );
  }

  // 4. Look up the trigger row. Missing topic header → reject as
  //    invalid signature (Shopify always sends X-Shopify-Topic; absence
  //    means a malformed delivery that already passed signature). Missing
  //    shop-domain header → same rejection.
  const topic = request.headers.get(TOPIC_HEADER);
  const shopDomain = request.headers.get(SHOP_DOMAIN_HEADER);
  if (!topic || !shopDomain) {
    throw new InvalidSignatureError(
      "Shopify webhook: required X-Shopify-Topic / X-Shopify-Shop-Domain header missing despite verified signature.",
    );
  }

  const trigger = await triggerResourcesRepo.findByWorkflowAndNode(
    query.workflowId,
    query.nodeId,
  );
  if (
    !trigger ||
    trigger.provider !== "shopify" ||
    trigger.eventType !== "webhook_received"
  ) {
    return { kind: "unknown_workflow" };
  }

  // 5. Topic allowlist filter: receive route only dispatches topics
  //    the trigger explicitly subscribed to AT activation time. Plus
  //    a defense-in-depth check against the global Slice 12 Batch 1
  //    allowlist (covers cases where a corrupted trigger row carries
  //    a topic V2 doesn't intend to handle).
  const triggerConfig = trigger.config as { topics?: ReadonlyArray<string> };
  const subscribedTopics = triggerConfig.topics ?? [];
  if (!subscribedTopics.includes(topic) || !isAllowedShopifyTopic(topic)) {
    return { kind: "unsupported_topic", topic };
  }

  // 6. Parse JSON body. Shopify always sends well-formed JSON; a
  //    parse error after a verified signature means upstream
  //    re-encoded the body — fail loud.
  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new InvalidSignatureError(
      "Shopify webhook: body is not valid JSON despite a verified signature.",
    );
  }

  // 7. Normalize to canonical TriggerEvent.
  const headers: ShopifyHeaders = {
    topic,
    shopDomain,
    webhookId: request.headers.get(WEBHOOK_ID_HEADER),
    triggeredAt: request.headers.get(TRIGGERED_AT_HEADER),
  };
  const normalized = normalizeShopifyEvent({ headers, body: parsedBody });
  return { kind: "events", events: [normalized] };
}
