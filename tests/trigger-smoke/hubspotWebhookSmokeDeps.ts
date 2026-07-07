/**
 * Trigger-smoke — REAL HubSpot WEBHOOK deps (server-only test helper).
 *
 * HubSpot's registration lives in hubspot_app_subscriptions +
 * hubspot_subscription_refs (NOT trigger_resources) — the route routes each
 * event by payload portalId → app-sub (appId + eventType) → refs (hubId).
 *
 *   - seedRegistration → find-or-create the app-sub row for (REAL env
 *     `HUBSPOT_APP_ID`, `contact.creation`, propertyName null) with a
 *     smoke-minted hubspotSubscriptionId, then upsert a ref row binding the
 *     smoke workflow node to a SMOKE-MINTED portal id. NO HubSpot API call, NO
 *     real app-level subscription created. If the app-sub row already exists
 *     (a real deployment's row or a prior leak), it is REUSED and NOT deleted
 *     at cleanup — only a row this run created is deleted (the ref row is
 *     always ours and always deleted).
 *   - deliverSyntheticEvent → signs the one-event array with the REAL
 *     `HUBSPOT_CLIENT_SECRET` (V3 canonical string
 *     `${method}${requestUri}${rawBody}${timestampMs}`, base64 HMAC-SHA256 —
 *     production verification UNCHANGED; the requestUri mirrors the route's
 *     canonical-URL resolution) and POSTs it to the REAL
 *     `POST /api/webhooks/hubspot` route (verify → app-sub + ref routing →
 *     route-level dedup → per-ref enqueue).
 *   - cleanupRegistration → delete the ref row (+ the app-sub row iff this
 *     run created it) + workflow soft-delete. No deactivation hook → no
 *     HubSpot API.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { randomUUID } from "node:crypto";
import * as appSubsRepo from "@/repositories/hubspotAppSubscriptions";
import * as refsRepo from "@/repositories/hubspotSubscriptionRefs";
import { POST as hubspotWebhookRoute } from "@/app/api/webhooks/hubspot/route";
import type { DirectSeedWebhookSmokeDeps } from "./directSeedWebhookSmoke";
import {
  makeCommonDirectSeedDeps,
  type DirectSeedSmokeDepsConfig,
} from "./directSeedWebhookSmokeDepsShared";
import {
  HUBSPOT_WEBHOOK_RECEIVED_EVENT_TYPE,
  HUBSPOT_SMOKE_SUBSCRIPTION_TYPE,
  buildHubSpotSmokeBody,
  signHubSpotSmokeRequest,
  hubspotSmokeCanonicalRequestUri,
  type HubSpotWebhookSmokeIdentity,
} from "./hubspotWebhookSmoke";

function getAppId(): string {
  const appId = process.env.HUBSPOT_APP_ID?.trim();
  if (!appId) {
    throw new Error("hubspot-webhook-smoke: HUBSPOT_APP_ID is not set.");
  }
  return appId;
}

export function makeRealHubSpotWebhookSmokeDeps(
  config: DirectSeedSmokeDepsConfig,
): DirectSeedWebhookSmokeDeps<HubSpotWebhookSmokeIdentity> {
  const common = makeCommonDirectSeedDeps(config, "hubspot");
  const { supabase, userId } = config;
  // App-sub rows are SHARED across workflows by design. Track the id only when
  // THIS run created the row, so cleanup never deletes a pre-existing one.
  const createdAppSubIdByWorkflow = new Map<string, string>();

  return {
    mintIdentity(): HubSpotWebhookSmokeIdentity {
      const rand = randomUUID().replace(/-/g, "").slice(0, 12);
      return {
        eventId: `crsmoke-hs-${Date.now()}-${rand}`,
        portalId: `crsmoke-portal-${rand}`,
        objectId: `crsmoke-object-${rand}`,
        hubspotSubscriptionId: `crsmoke-hssub-${rand}`,
        occurredAtMs: Date.now(),
      };
    },

    createActiveSmokeWorkflow: common.createActiveSmokeWorkflow,

    async seedRegistration({ workflowId, triggerNodeId, identity }) {
      const appId = getAppId();
      // Reuse an existing app-sub row (shared model) or create one with a
      // smoke-minted hubspotSubscriptionId — NO HubSpot API call either way.
      let appSub = await appSubsRepo.find({
        appId,
        eventType: HUBSPOT_SMOKE_SUBSCRIPTION_TYPE,
        propertyName: null,
      });
      if (!appSub) {
        appSub = await appSubsRepo.create({
          appId,
          eventType: HUBSPOT_SMOKE_SUBSCRIPTION_TYPE,
          propertyName: null,
          hubspotSubscriptionId: identity.hubspotSubscriptionId,
        });
        createdAppSubIdByWorkflow.set(workflowId, appSub.id);
      }
      const ref = await refsRepo.upsert({
        appSubscriptionId: appSub.id,
        workflowId,
        userId,
        nodeId: triggerNodeId,
        hubId: identity.portalId,
        config: { eventType: HUBSPOT_SMOKE_SUBSCRIPTION_TYPE, propertyName: null },
      });
      // The registration is correct iff the app-sub row keys the subscription
      // type the delivery will carry AND the ref binds our node to the minted
      // portal. Return the canonical TriggerEvent eventType so the orchestrator
      // contract (seededEventType === expectedEventType) stays meaningful.
      const registrationCorrect =
        appSub.eventType === HUBSPOT_SMOKE_SUBSCRIPTION_TYPE &&
        ref.workflowId === workflowId &&
        ref.nodeId === triggerNodeId &&
        ref.hubId === identity.portalId;
      return {
        seededEventType: registrationCorrect
          ? HUBSPOT_WEBHOOK_RECEIVED_EVENT_TYPE
          : null,
      };
    },

    async deliverSyntheticEvent({ identity }) {
      const secret = process.env.HUBSPOT_CLIENT_SECRET;
      if (!secret) {
        throw new Error("hubspot-webhook-smoke: HUBSPOT_CLIENT_SECRET is not set.");
      }
      const appId = getAppId();
      const rawBody = buildHubSpotSmokeBody(identity, appId);
      const timestampMs = Date.now();
      const requestUri = hubspotSmokeCanonicalRequestUri();
      const signature = signHubSpotSmokeRequest({
        method: "POST",
        requestUri,
        rawBody,
        timestampMs,
        secret,
      });
      // The route ignores request.url for verification (canonical URI comes
      // from env) and HubSpot has no query params — any local URL works.
      const request = new Request("http://localhost/api/webhooks/hubspot", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hubspot-signature-v3": signature,
          "x-hubspot-request-timestamp": String(timestampMs),
        },
        body: rawBody,
      });
      const res = await hubspotWebhookRoute(request);
      return { httpStatus: res.status };
    },

    listRuns: common.listRuns,
    drainRun: common.drainRun,
    readRun: common.readRun,

    async cleanupRegistration(workflowId) {
      // The ref row is always smoke-owned — delete by workflow id.
      const { error: refError } = await supabase
        .from("hubspot_subscription_refs")
        .delete()
        .eq("workflow_id", workflowId);
      if (refError) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.hubspot-webhook.ref_cleanup_failed",
            workflowId,
            error: refError.message,
          }),
        );
      }
      // The app-sub row is shared — delete ONLY when this run created it.
      const createdAppSubId = createdAppSubIdByWorkflow.get(workflowId);
      if (createdAppSubId) {
        createdAppSubIdByWorkflow.delete(workflowId);
        await appSubsRepo.deleteById(createdAppSubId).catch((err) => {
          console.warn(
            JSON.stringify({
              event: "trigger-smoke.hubspot-webhook.appsub_cleanup_failed",
              error: (err as Error).message,
            }),
          );
        });
      }
      await common.softDeleteWorkflow(workflowId);
    },

    cleanupDedup: common.cleanupDedup,
    sleep: common.sleep,
  };
}
