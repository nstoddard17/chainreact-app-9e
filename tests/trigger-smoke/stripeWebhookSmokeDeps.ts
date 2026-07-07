/**
 * Trigger-smoke — REAL Stripe WEBHOOK deps (server-only test helper).
 *
 *   - seedRegistration → DIRECT `triggerResourcesRepo.upsert` of the row the
 *     receive route + dispatcher look up (provider `stripe`, eventType
 *     `event_received`) with the identity's SMOKE-MINTED `endpointSecret` in
 *     config — Stripe's per-row whsec model means no env secret is needed.
 *     Does NOT run the activation hook → NO Stripe API call, NO real endpoint.
 *   - deliverSyntheticEvent → signs the synthetic allowlisted event with the
 *     seeded endpointSecret (`Stripe-Signature: t=<unix>,v1=<hex>` — Stripe's
 *     documented contract, production verification UNCHANGED) and POSTs it to
 *     the REAL `POST /api/webhooks/stripe?workflowId=&nodeId=` route
 *     (receive → verify → allowlist → normalize → dispatchTriggerEvent →
 *     dedup → enqueue).
 *   - cleanupRegistration → direct trigger_resources delete + workflow
 *     soft-delete (no deactivation hook → no Stripe API).
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { randomUUID } from "node:crypto";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { POST as stripeWebhookRoute } from "@/app/api/webhooks/stripe/route";
import type { DirectSeedWebhookSmokeDeps } from "./directSeedWebhookSmoke";
import {
  makeCommonDirectSeedDeps,
  type DirectSeedSmokeDepsConfig,
} from "./directSeedWebhookSmokeDepsShared";
import {
  STRIPE_EVENT_RECEIVED_EVENT_TYPE,
  buildStripeSmokeBody,
  signStripeSmokeBody,
  type StripeWebhookSmokeIdentity,
} from "./stripeWebhookSmoke";

export function makeRealStripeWebhookSmokeDeps(
  config: DirectSeedSmokeDepsConfig,
): DirectSeedWebhookSmokeDeps<StripeWebhookSmokeIdentity> {
  const common = makeCommonDirectSeedDeps(config, "stripe");
  const { userId } = config;

  return {
    mintIdentity(): StripeWebhookSmokeIdentity {
      const rand = randomUUID().replace(/-/g, "").slice(0, 12);
      return {
        eventId: `evt_crsmoke_${Date.now()}_${rand}`,
        // Smoke-minted per-row signing secret (whsec-style). Never a real
        // Stripe secret; it exists only on the seeded row for this run.
        endpointSecret: `whsec_crsmoke${rand}`,
        objectId: `cs_crsmoke_${rand}`,
        createdUnix: Math.floor(Date.now() / 1000),
      };
    },

    createActiveSmokeWorkflow: common.createActiveSmokeWorkflow,

    async seedRegistration({ workflowId, triggerNodeId, identity }) {
      // DIRECT-SEED only — no activation hook, no Stripe API, no real endpoint.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: "stripe",
        eventType: STRIPE_EVENT_RECEIVED_EVENT_TYPE,
        nodeId: triggerNodeId,
        config: { webhookEnabled: true, endpointSecret: identity.endpointSecret },
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(
        workflowId,
        triggerNodeId,
      );
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ identity, workflowId, triggerNodeId }) {
      const rawBody = buildStripeSmokeBody(identity);
      const ts = Math.floor(Date.now() / 1000);
      const signature = signStripeSmokeBody(ts, rawBody, identity.endpointSecret);
      const params = new URLSearchParams({ workflowId, nodeId: triggerNodeId });
      const request = new Request(
        `http://localhost/api/webhooks/stripe?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "stripe-signature": signature,
          },
          body: rawBody,
        },
      );
      const res = await stripeWebhookRoute(request);
      return { httpStatus: res.status };
    },

    listRuns: common.listRuns,
    drainRun: common.drainRun,
    readRun: common.readRun,

    async cleanupRegistration(workflowId) {
      // Delete the direct-seeded trigger_resources row WITHOUT the deactivation
      // hook (which for Stripe would attempt an endpoint delete via the Stripe
      // API). No provider-side resource exists — direct delete is correct.
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      await common.softDeleteWorkflow(workflowId);
    },

    cleanupDedup: common.cleanupDedup,
    sleep: common.sleep,
  };
}
