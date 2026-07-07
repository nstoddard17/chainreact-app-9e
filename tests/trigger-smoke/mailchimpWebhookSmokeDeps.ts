/**
 * Trigger-smoke — REAL Mailchimp WEBHOOK deps (server-only test helper).
 *
 *   - mintIdentity → builds the form-encoded body DETERMINISTICALLY at mint
 *     time and hashes it: Mailchimp's dedup key is sha256(rawBody), so the
 *     identity carries the exact bytes to (re-)send and their hash is the
 *     eventId the fired run + dedup row must show.
 *   - seedRegistration → DIRECT `triggerResourcesRepo.upsert` of the row the
 *     receive route + dispatcher look up (provider `mailchimp`, eventType
 *     `audience_event`, config.audienceId + eventTypes = the gates the route
 *     checks the inbound form body against; providerAccountId smoke-minted).
 *     Does NOT run the activation hook → NO Mailchimp API call, NO real
 *     webhook created.
 *   - deliverSyntheticEvent → POSTs the form-encoded body to the REAL
 *     `POST /api/webhooks/mailchimp?workflowId=&nodeId=` route. Mailchimp has
 *     NO signature scheme — the production authenticity model (URL secrecy +
 *     audience match + event-type allowlist + content-hash dedup) is exactly
 *     what runs.
 *   - cleanupRegistration → direct trigger_resources delete + workflow
 *     soft-delete (no deactivation hook → no Mailchimp API).
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { randomUUID } from "node:crypto";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { POST as mailchimpWebhookRoute } from "@/app/api/webhooks/mailchimp/route";
import type { DirectSeedWebhookSmokeDeps } from "./directSeedWebhookSmoke";
import {
  makeCommonDirectSeedDeps,
  type DirectSeedSmokeDepsConfig,
} from "./directSeedWebhookSmokeDepsShared";
import {
  MAILCHIMP_AUDIENCE_EVENT_EVENT_TYPE,
  MAILCHIMP_SMOKE_EVENT_NAME,
  buildMailchimpSmokeBody,
  mailchimpSmokeDedupKey,
  type MailchimpWebhookSmokeIdentity,
} from "./mailchimpWebhookSmoke";

export function makeRealMailchimpWebhookSmokeDeps(
  config: DirectSeedSmokeDepsConfig,
): DirectSeedWebhookSmokeDeps<MailchimpWebhookSmokeIdentity> {
  const common = makeCommonDirectSeedDeps(config, "mailchimp");
  const { userId } = config;

  return {
    mintIdentity(): MailchimpWebhookSmokeIdentity {
      const rand = randomUUID().replace(/-/g, "").slice(0, 12);
      const seed = {
        audienceId: `crsmokelist${rand}`,
        // Reserved .invalid TLD — never deliverable, no real subscriber.
        email: `crsmoke-${rand}@example.invalid`,
        subscriberHash: `crsmokehash${rand}`,
        firedAt: new Date().toISOString(),
      };
      const rawBody = buildMailchimpSmokeBody(seed);
      return {
        ...seed,
        rawBody,
        // Content-hash dedup: eventId = sha256(rawBody), matching production's
        // mailchimpDedupKey over the same bytes.
        eventId: mailchimpSmokeDedupKey(rawBody),
        providerAccountId: `crsmoke-mc-account-${rand}`,
      };
    },

    createActiveSmokeWorkflow: common.createActiveSmokeWorkflow,

    async seedRegistration({ workflowId, triggerNodeId, identity }) {
      // DIRECT-SEED only — no activation hook, no Mailchimp API, no webhook.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: "mailchimp",
        eventType: MAILCHIMP_AUDIENCE_EVENT_EVENT_TYPE,
        nodeId: triggerNodeId,
        providerAccountId: identity.providerAccountId,
        config: {
          webhookEnabled: true,
          audienceId: identity.audienceId,
          eventTypes: [MAILCHIMP_SMOKE_EVENT_NAME],
        },
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(
        workflowId,
        triggerNodeId,
      );
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ identity, workflowId, triggerNodeId }) {
      const params = new URLSearchParams({ workflowId, nodeId: triggerNodeId });
      const request = new Request(
        `http://localhost/api/webhooks/mailchimp?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          // The EXACT minted bytes — the content hash is the dedup identity.
          body: identity.rawBody,
        },
      );
      const res = await mailchimpWebhookRoute(request);
      return { httpStatus: res.status };
    },

    listRuns: common.listRuns,
    drainRun: common.drainRun,
    readRun: common.readRun,

    async cleanupRegistration(workflowId) {
      // No deactivation hook (which for Mailchimp would attempt a webhook
      // delete via the Mailchimp API). Direct delete is correct.
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      await common.softDeleteWorkflow(workflowId);
    },

    cleanupDedup: common.cleanupDedup,
    sleep: common.sleep,
  };
}
