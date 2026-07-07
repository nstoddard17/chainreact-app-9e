/**
 * Trigger-smoke — REAL Facebook WEBHOOK deps (server-only test helper).
 *
 * Wires the generic direct-seed orchestrator to the real V2 internals:
 *
 *   - seedRegistration → DIRECT `triggerResourcesRepo.upsert` of the
 *     `(facebook, new_post|new_comment)` row the dispatcher looks up, with
 *     `config.pageId` = the identity's smoke-minted Page id (so the
 *     registered per-trigger filter positively matches inside real dispatch).
 *     NO Facebook API call, NO Page subscription created.
 *   - deliverSyntheticEvent → builds the synthetic Page feed change (all ids
 *     + message smoke-minted crsmoke markers), signs it per Facebook's
 *     documented scheme (`sha256=` + HMAC-SHA256-hex over the raw body keyed
 *     FACEBOOK_CLIENT_SECRET — production verification UNWEAKENED), and
 *     POSTs it through the REAL /api/webhooks/facebook route (verify →
 *     classify → normalize → dispatchTriggerEvent → filter → dedup →
 *     enqueue). The dedup re-send POSTs the IDENTICAL body — same
 *     normalize eventId → dropped by the dispatcher's markSeen.
 *   - cleanupRegistration → direct trigger_resources delete + workflow
 *     soft-delete (no provider-side resource exists).
 *   - cleanupDedup → exact `(facebook, eventId)` delete — the dedup key is
 *     fully known at mint (the shared common implementation).
 *
 * `probeFacebookVerifyHandshakeRejects` exercises the GET hub.challenge
 * branch's FAIL-CLOSED path (mismatched/unset verify token → 403, challenge
 * never echoed) — the local env does not carry FACEBOOK_WEBHOOK_VERIFY_TOKEN,
 * so the positive echo is not probeable here (documented env-name drift:
 * .env.local carries FACEBOOK_PAGES_VERIFY_TOKEN / FACEBOOK_USER_VERIFY_TOKEN).
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { createHmac, randomUUID } from "node:crypto";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { GET as facebookGet, POST as facebookRoute } from "@/app/api/webhooks/facebook/route";
import type { DirectSeedWebhookSmokeDeps } from "./directSeedWebhookSmoke";
import {
  makeCommonDirectSeedDeps,
  type DirectSeedSmokeDepsConfig,
} from "./directSeedWebhookSmokeDepsShared";
import {
  buildFacebookFeedChangeBody,
  type FacebookSpec,
  type FacebookSmokeIdentity,
} from "./facebookWebhookSmoke";

const PROVIDER = "facebook";

/** Probe the GET hub.challenge branch's fail-closed path (wrong token → 403). */
export async function probeFacebookVerifyHandshakeRejects(): Promise<{
  status: number;
  body: string;
}> {
  const challenge = `crsmoke-challenge-${randomUUID().slice(0, 8)}`;
  const res = await facebookGet(
    new Request(
      `http://localhost/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=crsmoke-wrong-token&hub.challenge=${encodeURIComponent(challenge)}`,
      { method: "GET" },
    ),
  );
  return { status: res.status, body: await res.text() };
}

export function makeRealFacebookWebhookSmokeDeps(
  config: DirectSeedSmokeDepsConfig,
  spec: FacebookSpec,
): DirectSeedWebhookSmokeDeps<FacebookSmokeIdentity> {
  const common = makeCommonDirectSeedDeps(config, PROVIDER);
  const { userId } = config;
  // Fixed per identity so both deliveries share the exact same signed bytes.
  const createdAtByEventId = new Map<string, number>();

  function requireSecret(): string {
    const secret = process.env.FACEBOOK_CLIENT_SECRET;
    if (!secret) {
      throw new Error("facebook-webhook-smoke: FACEBOOK_CLIENT_SECRET not set.");
    }
    return secret;
  }

  return {
    mintIdentity(): FacebookSmokeIdentity {
      const rand = randomUUID().replace(/-/g, "").slice(0, 10);
      const pageId = `crsmokepage${rand}`;
      const postId = `${pageId}_post${rand}`;
      const commentId = `${pageId}_comment${rand}`;
      const kind = spec.expectedEventType as "new_post" | "new_comment";
      const eventId =
        kind === "new_post"
          ? `new_post:${pageId}:${postId}`
          : `new_comment:${pageId}:${commentId}`;
      return {
        eventId,
        pageId,
        postId,
        commentId,
        marker: `crsmoke-${kind.replace(/_/g, "")}-${rand}`,
      };
    },

    createActiveSmokeWorkflow: common.createActiveSmokeWorkflow,

    async seedRegistration({ workflowId, triggerNodeId, identity }) {
      // DIRECT-SEED only — no activation hook, no Page subscription created.
      // config.pageId must equal the synthetic entry's pageId so the
      // registered filter's Zod parse + positive match run in real dispatch.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: PROVIDER,
        eventType: spec.expectedEventType,
        nodeId: triggerNodeId,
        config: { webhookEnabled: true, pageId: identity.pageId },
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(
        workflowId,
        triggerNodeId,
      );
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ identity }) {
      let createdAt = createdAtByEventId.get(identity.eventId);
      if (createdAt === undefined) {
        createdAt = Math.floor(Date.now() / 1000);
        createdAtByEventId.set(identity.eventId, createdAt);
      }
      const rawBody = buildFacebookFeedChangeBody(
        identity,
        spec.expectedEventType as "new_post" | "new_comment",
        createdAt,
      );
      const signature = `sha256=${createHmac("sha256", requireSecret())
        .update(rawBody)
        .digest("hex")}`;
      const res = await facebookRoute(
        new Request("http://localhost/api/webhooks/facebook", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-hub-signature-256": signature,
          },
          body: rawBody,
        }),
      );
      return { httpStatus: res.status };
    },

    listRuns: common.listRuns,
    drainRun: common.drainRun,
    readRun: common.readRun,

    async cleanupRegistration(workflowId, identity) {
      createdAtByEventId.delete(identity.eventId);
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      await common.softDeleteWorkflow(workflowId);
    },

    cleanupDedup: common.cleanupDedup,
    sleep: common.sleep,
  };
}
