/**
 * Trigger-smoke — REAL Shopify WEBHOOK deps (server-only test helper).
 *
 *   - seedRegistration → DIRECT `triggerResourcesRepo.upsert` of the row the
 *     receive route + dispatcher look up (provider `shopify`, eventType
 *     `webhook_received`, config.topics = the activation-time allowlist the
 *     route checks the inbound X-Shopify-Topic against). Does NOT run the
 *     activation hook → NO Shopify API call, NO real webhook created.
 *   - deliverSyntheticEvent → signs the synthetic order snapshot with the REAL
 *     `SHOPIFY_CLIENT_SECRET` (`X-Shopify-Hmac-SHA256: <base64 HMAC over the
 *     raw body>` — Shopify's documented scheme, production verification
 *     UNCHANGED) and POSTs it to the REAL
 *     `POST /api/webhooks/shopify?workflowId=&nodeId=` route (receive →
 *     verify → topic allowlist → normalize → dispatchTriggerEvent → dedup →
 *     enqueue). Dedup keys on the per-delivery X-Shopify-Webhook-Id header.
 *   - cleanupRegistration → direct trigger_resources delete + workflow
 *     soft-delete (no deactivation hook → no Shopify API).
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { randomUUID } from "node:crypto";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { POST as shopifyWebhookRoute } from "@/app/api/webhooks/shopify/route";
import type { DirectSeedWebhookSmokeDeps } from "./directSeedWebhookSmoke";
import {
  makeCommonDirectSeedDeps,
  type DirectSeedSmokeDepsConfig,
} from "./directSeedWebhookSmokeDepsShared";
import {
  SHOPIFY_WEBHOOK_RECEIVED_EVENT_TYPE,
  SHOPIFY_SMOKE_TOPIC,
  buildShopifySmokeBody,
  signShopifySmokeBody,
  type ShopifyWebhookSmokeIdentity,
} from "./shopifyWebhookSmoke";

export function makeRealShopifyWebhookSmokeDeps(
  config: DirectSeedSmokeDepsConfig,
): DirectSeedWebhookSmokeDeps<ShopifyWebhookSmokeIdentity> {
  const common = makeCommonDirectSeedDeps(config, "shopify");
  const { userId } = config;

  return {
    mintIdentity(): ShopifyWebhookSmokeIdentity {
      const rand = randomUUID().replace(/-/g, "").slice(0, 12);
      return {
        eventId: `crsmoke-shopify-${randomUUID()}`,
        shopDomain: `crsmoke-${rand}.myshopify.com`,
        orderId: Date.now(),
        orderName: `#crsmoke-order-${rand}`,
        triggeredAt: new Date().toISOString(),
      };
    },

    createActiveSmokeWorkflow: common.createActiveSmokeWorkflow,

    async seedRegistration({ workflowId, triggerNodeId }) {
      // DIRECT-SEED only — no activation hook, no Shopify API, no real webhook.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: "shopify",
        eventType: SHOPIFY_WEBHOOK_RECEIVED_EVENT_TYPE,
        nodeId: triggerNodeId,
        config: { webhookEnabled: true, topics: [SHOPIFY_SMOKE_TOPIC] },
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(
        workflowId,
        triggerNodeId,
      );
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ identity, workflowId, triggerNodeId }) {
      const secret = process.env.SHOPIFY_CLIENT_SECRET;
      if (!secret) {
        throw new Error("shopify-webhook-smoke: SHOPIFY_CLIENT_SECRET is not set.");
      }
      const rawBody = buildShopifySmokeBody(identity);
      const signature = signShopifySmokeBody(rawBody, secret);
      const params = new URLSearchParams({ workflowId, nodeId: triggerNodeId });
      const request = new Request(
        `http://localhost/api/webhooks/shopify?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-shopify-hmac-sha256": signature,
            "x-shopify-topic": SHOPIFY_SMOKE_TOPIC,
            "x-shopify-shop-domain": identity.shopDomain,
            "x-shopify-webhook-id": identity.eventId,
            "x-shopify-triggered-at": identity.triggeredAt,
          },
          body: rawBody,
        },
      );
      const res = await shopifyWebhookRoute(request);
      return { httpStatus: res.status };
    },

    listRuns: common.listRuns,
    drainRun: common.drainRun,
    readRun: common.readRun,

    async cleanupRegistration(workflowId) {
      // Delete the direct-seeded trigger_resources row WITHOUT the deactivation
      // hook (which for Shopify would attempt webhook deletes via the Shopify
      // API). No provider-side resource exists — direct delete is correct.
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      await common.softDeleteWorkflow(workflowId);
    },

    cleanupDedup: common.cleanupDedup,
    sleep: common.sleep,
  };
}
