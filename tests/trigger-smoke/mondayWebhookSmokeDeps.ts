/**
 * Trigger-smoke harness — REAL Monday WEBHOOK deps (server-only test helper).
 *
 * Wires the injected `MondayWebhookSmokeDeps` to the real V2 internals:
 *   - createActiveSmokeWorkflow -> service-role INSERT into `workflows`
 *     (state="active" + draft_definition). Same pattern as the other webhook smokes.
 *   - seedTriggerResource -> DIRECT `triggerResourcesRepo.upsert` of the minimum row
 *     the receive route + dispatcher look up (provider `monday`, eventType `<spec>`,
 *     keyed by workflowId+nodeId, config `{ eventType, boardId }`). This DELIBERATELY
 *     does NOT run the activation hook, whose Monday hook would call the
 *     `create_webhook` GraphQL mutation to SUBSCRIBE a real board. NO Monday API is
 *     touched.
 *   - deliverSyntheticEvent -> wraps the spec's Monday `event` object in a `{ event }`
 *     body, signs it with the REAL `MONDAY_SIGNING_SECRET` (`x-monday-signature` =
 *     lowercase-hex HMAC-SHA256 over the raw body, production verification UNCHANGED),
 *     and POSTs it to the REAL `POST /api/webhooks/monday?workflowId=&nodeId=` route.
 *   - listRuns/readRun -> service-role diagnostics readers (incl. non-terminal).
 *   - drainRun -> the REAL durable-queue processQueuedRun.
 *   - cleanupWorkflow -> DIRECT `triggerResourcesRepo.deleteByWorkflow` (NO
 *     deactivation hook -> no Monday API) + a service-role soft-delete of the workflow.
 *   - cleanupDedup -> service-role delete of the synthetic webhook_event_dedup row.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import {
  getByIdServiceRole,
  listByWorkflowServiceRole,
  type DiagnosticsRunRecord,
} from "@/repositories/workflowRunsDiagnostics";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import { POST as mondayWebhookRoute } from "@/app/api/webhooks/monday/route";
import {
  type MondayWebhookSmokeDeps,
  type MondayWebhookSmokeIdentity,
  type MondayWebhookSmokeRun,
} from "./mondayWebhookSmoke";

export interface RealMondayWebhookSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
}

/** Deterministic synthetic timestamp — part of every dedup key. */
const SYNTHETIC_DATE = "2026-06-30T00:00:00.000Z";

function mapStatus(s: string | null | undefined): MondayWebhookSmokeRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

function toSmokeRun(rec: DiagnosticsRunRecord): MondayWebhookSmokeRun {
  const event = rec.triggerEvent ?? null;
  return {
    runId: rec.id,
    status: mapStatus(rec.status),
    triggerPayload: (event?.payload as Record<string, unknown> | undefined) ?? null,
    eventId: event?.eventId ?? null,
    eventType: event?.eventType ?? null,
  };
}

/** Monday `x-monday-signature` = lowercase-hex HMAC-SHA256 over the raw body. */
function signMondayBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function makeRealMondayWebhookSmokeDeps(
  config: RealMondayWebhookSmokeDepsConfig,
): MondayWebhookSmokeDeps {
  const { supabase, accountId, userId } = config;

  return {
    mintIdentity(): MondayWebhookSmokeIdentity {
      const rand = randomUUID().slice(0, 8);
      return {
        boardId: `crsmoke-board-${rand}`,
        itemId: `crsmoke-item-${rand}`,
        itemName: `crsmoke item ${rand}`,
        groupId: `crsmoke-group-${rand}`,
        sourceGroupId: `crsmoke-src-${rand}`,
        subitemId: `crsmoke-subitem-${rand}`,
        subitemName: `crsmoke subitem ${rand}`,
        parentItemId: `crsmoke-parent-${rand}`,
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
          `monday-webhook-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async seedTriggerResource({ workflowId, triggerNodeId, boardId, eventType }) {
      // DIRECT-SEED only — no activation hook, no Monday API, no real webhook. The
      // config carries the eventType the receive route filters on and the boardId for
      // realism; Monday signs the raw body only (no callbackURL binding), so no
      // callback URL is needed for verification.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: "monday",
        eventType,
        nodeId: triggerNodeId,
        config: { eventType, boardId },
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ event, workflowId, triggerNodeId }) {
      const secret = process.env.MONDAY_SIGNING_SECRET;
      if (!secret) {
        throw new Error("monday-webhook-smoke: MONDAY_SIGNING_SECRET is not set.");
      }
      const rawBody = JSON.stringify({ event });
      const signature = signMondayBody(rawBody, secret);
      const params = new URLSearchParams({ workflowId, nodeId: triggerNodeId });
      const request = new Request(
        `http://localhost/api/webhooks/monday?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-monday-signature": signature,
          },
          body: rawBody,
        },
      );
      const res = await mondayWebhookRoute(request);
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
      // Delete the direct-seeded trigger_resources row WITHOUT the deactivation hook
      // (which for Monday would attempt a Monday API webhook-delete). No provider-side
      // resource exists, so a direct delete is correct and safe.
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.monday-webhook.cleanup_failed",
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
        .eq("provider", "monday")
        .eq("event_id", eventId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.monday-webhook.dedup_cleanup_failed",
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
