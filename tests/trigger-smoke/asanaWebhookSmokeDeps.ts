/**
 * Trigger-smoke harness — REAL Asana WEBHOOK deps (server-only test helper).
 *
 * Wires the injected `AsanaWebhookSmokeDeps` to the real V2 internals:
 *   - createActiveSmokeWorkflow -> service-role INSERT into `workflows`.
 *   - seedTriggerResource -> DIRECT `triggerResourcesRepo.upsert` of the
 *     POST-ACTIVATION row shape (provider `asana`, eventType `<spec>`, keyed by
 *     workflowId+nodeId, config `{ projectId, hookSecretEncrypted:
 *     encryptToken(<smoke secret>), webhookEnabled: true, handshakePending:
 *     false }`). DELIBERATELY does NOT run the activation hook (which would call
 *     Asana's POST /webhooks + depend on the live handshake). NO Asana API is
 *     touched. Requires TOKEN_ENCRYPTION_KEY (the same key the receive route
 *     decrypts with).
 *   - deliverSyntheticEvent -> wraps the spec's event in `{ events: [event] }`,
 *     signs the raw bytes with the SAME smoke secret (`X-Hook-Signature` =
 *     lowercase-hex HMAC-SHA256 — the per-row secret model production uses,
 *     verification UNCHANGED), and POSTs it to the REAL
 *     `POST /api/webhooks/asana?workflowId=&nodeId=` route.
 *   - listRuns/readRun -> service-role diagnostics readers (incl. non-terminal).
 *   - drainRun -> the REAL durable-queue processQueuedRun.
 *   - cleanupWorkflow -> DIRECT `triggerResourcesRepo.deleteByWorkflow` (NO
 *     deactivation hook -> no Asana API) + a service-role soft-delete of the
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
import { POST as asanaWebhookRoute } from "@/app/api/webhooks/asana/route";
import {
  type AsanaWebhookSmokeDeps,
  type AsanaWebhookSmokeIdentity,
  type AsanaWebhookSmokeRun,
} from "./asanaWebhookSmoke";

export interface RealAsanaWebhookSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
}

/** Deterministic synthetic timestamp — part of every dedup key. */
const SYNTHETIC_DATE = "2026-07-04T00:00:00.000Z";

function mapStatus(s: string | null | undefined): AsanaWebhookSmokeRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

function toSmokeRun(rec: DiagnosticsRunRecord): AsanaWebhookSmokeRun {
  const event = rec.triggerEvent ?? null;
  return {
    runId: rec.id,
    status: mapStatus(rec.status),
    triggerPayload: (event?.payload as Record<string, unknown> | undefined) ?? null,
    eventId: event?.eventId ?? null,
    eventType: event?.eventType ?? null,
  };
}

/** Asana `X-Hook-Signature` = lowercase-hex HMAC-SHA256 over the raw body. */
function signAsanaBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function makeRealAsanaWebhookSmokeDeps(
  config: RealAsanaWebhookSmokeDepsConfig,
): AsanaWebhookSmokeDeps {
  const { supabase, accountId, userId } = config;

  return {
    mintIdentity(): AsanaWebhookSmokeIdentity {
      const rand = randomUUID().slice(0, 8);
      return {
        projectId: `crsmoke-project-${rand}`,
        taskGid: `crsmoke-task-${rand}`,
        actorGid: `crsmoke-actor-${rand}`,
        hookSecret: `crsmoke-hook-secret-${randomUUID()}`,
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
          `asana-webhook-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async seedTriggerResource({ workflowId, triggerNodeId, projectId, hookSecret, eventType }) {
      // DIRECT-SEED the POST-ACTIVATION row shape — the secret is stored
      // ENCRYPTED exactly as the handshake path would store it, so the
      // receive route's decrypt + per-row verify path runs unmodified.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: "asana",
        eventType,
        nodeId: triggerNodeId,
        config: {
          projectId,
          hookSecretEncrypted: encryptToken(hookSecret),
          webhookEnabled: true,
          handshakePending: false,
        },
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ event, hookSecret, workflowId, triggerNodeId }) {
      const rawBody = JSON.stringify({ events: [event] });
      const signature = signAsanaBody(rawBody, hookSecret);
      const params = new URLSearchParams({ workflowId, nodeId: triggerNodeId });
      const request = new Request(
        `http://localhost/api/webhooks/asana?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-hook-signature": signature,
          },
          body: rawBody,
        },
      );
      const res = await asanaWebhookRoute(request);
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
      // hook (which for Asana would attempt DELETE /webhooks against a webhook
      // that never existed). Only smoke-owned DB rows are touched.
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.asana-webhook.cleanup_failed",
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
        .eq("provider", "asana")
        .eq("event_id", eventId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.asana-webhook.dedup_cleanup_failed",
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
