/**
 * Trigger-smoke harness — REAL Typeform WEBHOOK deps (server-only test helper).
 *
 * Wires the injected `TypeformWebhookSmokeDeps` to the real V2 internals:
 *   - createActiveSmokeWorkflow -> service-role INSERT into `workflows`.
 *   - seedTriggerResource -> DIRECT `triggerResourcesRepo.upsert` of the
 *     POST-ACTIVATION row shape (provider `typeform`, eventType
 *     `new_response_in_form`, keyed by workflowId+nodeId, config `{ formId,
 *     webhookTag, hookSecretEncrypted: encryptToken(<smoke secret>),
 *     webhookEnabled: true }`). DELIBERATELY does NOT run the activation hook
 *     (which would call Typeform's PUT /forms/{id}/webhooks/{tag}). NO Typeform
 *     API is touched. Requires TOKEN_ENCRYPTION_KEY (the same key the receive
 *     route decrypts with).
 *   - deliverSyntheticEvent -> serializes the synthetic form_response body,
 *     signs the raw bytes with the SAME smoke secret (`Typeform-Signature` =
 *     sha256= + BASE64 HMAC-SHA256 — the per-row secret model production uses,
 *     verification UNCHANGED), and POSTs it to the REAL
 *     `POST /api/webhooks/typeform?workflowId=&nodeId=` route.
 *   - listRuns/readRun -> service-role diagnostics readers (incl. non-terminal).
 *   - drainRun -> the REAL durable-queue processQueuedRun.
 *   - cleanupWorkflow -> DIRECT `triggerResourcesRepo.deleteByWorkflow` (NO
 *     deactivation hook -> no Typeform API) + a service-role soft-delete of the
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
import { POST as typeformWebhookRoute } from "@/app/api/webhooks/typeform/route";
import {
  type TypeformWebhookSmokeDeps,
  type TypeformWebhookSmokeIdentity,
  type TypeformWebhookSmokeRun,
} from "./typeformWebhookSmoke";

export interface RealTypeformWebhookSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
}

/** Deterministic synthetic timestamp — informational occurredAt only (NOT the dedup key). */
const SYNTHETIC_DATE = "2026-07-04T00:00:00.000Z";

function mapStatus(s: string | null | undefined): TypeformWebhookSmokeRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

function toSmokeRun(rec: DiagnosticsRunRecord): TypeformWebhookSmokeRun {
  const event = rec.triggerEvent ?? null;
  return {
    runId: rec.id,
    status: mapStatus(rec.status),
    triggerPayload: (event?.payload as Record<string, unknown> | undefined) ?? null,
    eventId: event?.eventId ?? null,
    eventType: event?.eventType ?? null,
  };
}

/** `Typeform-Signature` = sha256= + BASE64 HMAC-SHA256 over the raw body. */
function signTypeformBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("base64")}`;
}

export function makeRealTypeformWebhookSmokeDeps(
  config: RealTypeformWebhookSmokeDepsConfig,
): TypeformWebhookSmokeDeps {
  const { supabase, accountId, userId } = config;

  return {
    mintIdentity(): TypeformWebhookSmokeIdentity {
      const rand = randomUUID().slice(0, 8);
      return {
        formId: `crsmoke-form-${rand}`,
        responseToken: `crsmoke-response-${rand}`,
        providerEventId: `crsmoke-event-${rand}`,
        hookSecret: `crsmoke-hook-secret-${randomUUID()}`,
        submittedAt: SYNTHETIC_DATE,
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
          `typeform-webhook-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async seedTriggerResource({ workflowId, triggerNodeId, formId, hookSecret }) {
      // DIRECT-SEED the POST-ACTIVATION row shape — the secret is stored
      // ENCRYPTED exactly as the activation hook would store it, so the
      // receive route's decrypt + per-row verify path runs unmodified.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: "typeform",
        eventType: "new_response_in_form",
        nodeId: triggerNodeId,
        config: {
          formId,
          webhookTag: "chainreact-smoke",
          hookSecretEncrypted: encryptToken(hookSecret),
          webhookEnabled: true,
        },
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ body, hookSecret, workflowId, triggerNodeId }) {
      const rawBody = JSON.stringify(body);
      const signature = signTypeformBody(rawBody, hookSecret);
      const params = new URLSearchParams({ workflowId, nodeId: triggerNodeId });
      const request = new Request(
        `http://localhost/api/webhooks/typeform?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "typeform-signature": signature,
          },
          body: rawBody,
        },
      );
      const res = await typeformWebhookRoute(request);
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
      // hook (which for Typeform would attempt DELETE /forms/{id}/webhooks/{tag}
      // against a webhook that never existed). Only smoke-owned DB rows are touched.
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.typeform-webhook.cleanup_failed",
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
        .eq("provider", "typeform")
        .eq("event_id", eventId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.typeform-webhook.dedup_cleanup_failed",
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
