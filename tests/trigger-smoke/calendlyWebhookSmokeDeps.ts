/**
 * Trigger-smoke harness — REAL Calendly WEBHOOK deps (server-only test helper).
 *
 * Wires the injected `CalendlyWebhookSmokeDeps` to the real V2 internals:
 *   - createActiveSmokeWorkflow -> service-role INSERT into `workflows`.
 *   - seedTriggerResource -> DIRECT `triggerResourcesRepo.upsert` of the
 *     POST-ACTIVATION row shape (provider `calendly`, eventType per spec, keyed
 *     by workflowId+nodeId, config `{ calendlyUserId, hookSecretEncrypted:
 *     encryptToken(<smoke key>), webhookEnabled: true, subscriptionUri }`).
 *     DELIBERATELY does NOT run the activation hook (which would call Calendly's
 *     POST /webhook_subscriptions). NO Calendly API is touched. Requires
 *     TOKEN_ENCRYPTION_KEY (the same key the receive route decrypts with).
 *   - deliverSyntheticEvent -> serializes the synthetic invitee envelope, signs
 *     the raw bytes with the SAME smoke key (`Calendly-Webhook-Signature` =
 *     t=<unix>,v1=<hex HMAC-SHA256 over "<t>.<raw body>" — the per-row secret
 *     model production uses, verification UNCHANGED), and POSTs it to the REAL
 *     `POST /api/webhooks/calendly?workflowId=&nodeId=` route.
 *   - listRuns/readRun -> service-role diagnostics readers (incl. non-terminal).
 *   - drainRun -> the REAL durable-queue processQueuedRun.
 *   - cleanupWorkflow -> DIRECT `triggerResourcesRepo.deleteByWorkflow` (NO
 *     deactivation hook -> no Calendly API) + a service-role soft-delete of the
 *     workflow.
 *   - cleanupDedup -> service-role delete of the synthetic webhook_event_dedup row.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptToken } from "@/core/encryption/tokens";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import {
  getByIdServiceRole,
  listByWorkflowServiceRole,
  type DiagnosticsRunRecord,
} from "@/repositories/workflowRunsDiagnostics";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import { POST as calendlyWebhookRoute } from "@/app/api/webhooks/calendly/route";
import {
  type CalendlyWebhookSmokeDeps,
  type CalendlyWebhookSmokeIdentity,
  type CalendlyWebhookSmokeRun,
} from "./calendlyWebhookSmoke";

export interface RealCalendlyWebhookSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
}

/** Deterministic synthetic timestamp — informational occurredAt only (NOT the dedup key). */
const SYNTHETIC_DATE = "2026-07-04T00:00:00.000Z";

function mapStatus(s: string | null | undefined): CalendlyWebhookSmokeRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

function toSmokeRun(rec: DiagnosticsRunRecord): CalendlyWebhookSmokeRun {
  const event = rec.triggerEvent ?? null;
  return {
    runId: rec.id,
    status: mapStatus(rec.status),
    triggerPayload: (event?.payload as Record<string, unknown> | undefined) ?? null,
    eventId: event?.eventId ?? null,
    eventType: event?.eventType ?? null,
  };
}

/** `Calendly-Webhook-Signature` = t=<unix>,v1=<hex HMAC-SHA256 over "<t>.<raw body>">. */
function signCalendlyBody(rawBody: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const hex = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`, "utf8")
    .digest("hex");
  return `t=${t},v1=${hex}`;
}

export function makeRealCalendlyWebhookSmokeDeps(
  config: RealCalendlyWebhookSmokeDepsConfig,
): CalendlyWebhookSmokeDeps {
  const { supabase, accountId, userId } = config;

  return {
    mintIdentity(): CalendlyWebhookSmokeIdentity {
      const rand = randomUUID().slice(0, 8);
      return {
        subscriberUserId: `crsmoke-user-${rand}`,
        eventUuid: `crsmoke-event-${rand}`,
        inviteeUuid: `crsmoke-invitee-${rand}`,
        hookSecret: `crsmoke-signing-key-${randomUUID()}`,
        createdAt: SYNTHETIC_DATE,
      };
    },

    async createActiveSmokeWorkflow(workflow) {
      const { data, error } = await supabase
        .from("workflows")
        .insert({
          account_id: accountId,
          created_by_user_id: userId,
          name: workflow.name,
          state: "active",
          draft_definition: workflow.definition,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) {
        throw new Error(
          `calendly-webhook-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async seedTriggerResource({
      workflowId,
      triggerNodeId,
      triggerType,
      subscriberUserId,
      hookSecret,
    }) {
      // DIRECT-SEED the POST-ACTIVATION row shape — the signing key is stored
      // ENCRYPTED exactly as the activation hook would store it, so the
      // receive route's decrypt + per-row verify path runs unmodified.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: "calendly",
        eventType: triggerType,
        nodeId: triggerNodeId,
        config: {
          calendlyUserId: subscriberUserId,
          hookSecretEncrypted: encryptToken(hookSecret),
          webhookEnabled: true,
          subscriptionUri:
            "https://api.calendly.com/webhook_subscriptions/crsmoke-subscription",
        },
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ body, hookSecret, workflowId, triggerNodeId }) {
      const rawBody = JSON.stringify(body);
      const signature = signCalendlyBody(rawBody, hookSecret);
      const params = new URLSearchParams({ workflowId, nodeId: triggerNodeId });
      const request = new Request(
        `http://localhost/api/webhooks/calendly?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "calendly-webhook-signature": signature,
          },
          body: rawBody,
        },
      );
      const res = await calendlyWebhookRoute(request);
      return { httpStatus: res.status };
    },

    async listRuns(workflowId) {
      const runs = await listByWorkflowServiceRole(workflowId, {
        includeRunning: true,
        limit: 50,
      });
      return runs.map(toSmokeRun);
    },

    async drainRun(runId) {
      await processQueuedRun(runId);
    },

    async readRun(runId) {
      const rec = await getByIdServiceRole(runId);
      return rec ? toSmokeRun(rec) : null;
    },

    async cleanupWorkflow(workflowId) {
      // Delete the direct-seeded trigger_resources row WITHOUT the deactivation
      // hook (which for Calendly would attempt DELETE /webhook_subscriptions/{uuid}
      // against a subscription that never existed). Only smoke-owned DB rows are touched.
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.calendly-webhook.cleanup_failed",
            workflowId,
            error: error.message,
          }),
        );
      }
    },

    async cleanupDedup(eventId) {
      const { error } = await supabase
        .from("webhook_event_dedup")
        .delete()
        .eq("provider", "calendly")
        .eq("event_id", eventId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.calendly-webhook.dedup_cleanup_failed",
            error: error.message,
          }),
        );
      }
    },

    async sleep(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}
