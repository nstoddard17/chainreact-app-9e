/**
 * Trigger-smoke harness — REAL Trello WEBHOOK deps (server-only test helper).
 *
 * Wires the injected `TrelloWebhookSmokeDeps` to the real V2 internals:
 *   - createActiveSmokeWorkflow → service-role INSERT into `workflows`
 *     (state="active" + draft_definition). Same pattern as the other webhook smokes.
 *   - seedTriggerResource → DIRECT `triggerResourcesRepo.upsert` of the minimum row
 *     the receive route + dispatcher look up (provider `trello`, eventType `<spec>`,
 *     keyed by workflowId+nodeId, config `{ callbackURL, eventType, boardId }`). The
 *     callbackURL is the KEY detail: Trello's HMAC is over `rawBody + callbackURL` and
 *     the route verifies against `config.callbackURL`, so we seed a known callbackURL
 *     and sign with that SAME string. This DELIBERATELY does NOT run
 *     `registerWorkflowTriggers`, whose Trello activation hook would call
 *     `POST /1/webhooks` to CREATE a real board webhook. NO Trello API is touched.
 *   - deliverSyntheticEvent → wraps the spec's Trello `action` in a `{ action, model }`
 *     board-webhook body, signs it with the REAL `TRELLO_CLIENT_SECRET`
 *     (`X-Trello-Webhook` = base64 HMAC-SHA1 over `rawBody + callbackURL`, production
 *     verification UNCHANGED), and POSTs it to the REAL
 *     `POST /api/webhooks/trello?workflowId=&nodeId=` route.
 *   - listRuns/readRun → service-role diagnostics readers (incl. non-terminal).
 *   - drainRun → the REAL durable-queue processQueuedRun.
 *   - cleanupWorkflow → DIRECT `triggerResourcesRepo.deleteByWorkflow` (NO
 *     deactivation hook → no Trello API) + a service-role soft-delete of the workflow.
 *   - cleanupDedup → service-role delete of the synthetic webhook_event_dedup row.
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
import { POST as trelloWebhookRoute } from "@/app/api/webhooks/trello/route";
import {
  type TrelloWebhookSmokeDeps,
  type TrelloWebhookSmokeIdentity,
  type TrelloWebhookSmokeRun,
} from "./trelloWebhookSmoke";

export interface RealTrelloWebhookSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
}

/**
 * The synthetic Trello callback URL — a FIXED synthetic base + the per-workflow
 * query params. The same string is seeded into the row config AND fed to the signer,
 * so verification passes without a real Trello-registered URL. It is NOT the route
 * request URL (which is localhost for in-process POST); Trello's verifier only uses
 * the stored callbackURL, never the request URL.
 */
function buildCallbackURL(workflowId: string, nodeId: string): string {
  const params = new URLSearchParams({ workflowId, nodeId });
  return `https://crsmoke.invalid/api/webhooks/trello?${params.toString()}`;
}

function mapStatus(s: string | null | undefined): TrelloWebhookSmokeRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

function toSmokeRun(rec: DiagnosticsRunRecord): TrelloWebhookSmokeRun {
  const event = rec.triggerEvent ?? null;
  return {
    runId: rec.id,
    status: mapStatus(rec.status),
    triggerPayload: (event?.payload as Record<string, unknown> | undefined) ?? null,
    eventId: event?.eventId ?? null,
    eventType: event?.eventType ?? null,
  };
}

function signTrelloBody(rawBody: string, callbackURL: string, secret: string): string {
  // base64( HMAC-SHA1( secret, rawBody + callbackURL ) ). Body first, URL second.
  return createHmac("sha1", secret)
    .update(rawBody, "utf8")
    .update(callbackURL, "utf8")
    .digest("base64");
}

export function makeRealTrelloWebhookSmokeDeps(
  config: RealTrelloWebhookSmokeDepsConfig,
): TrelloWebhookSmokeDeps {
  const { supabase, accountId, userId } = config;

  return {
    mintIdentity(): TrelloWebhookSmokeIdentity {
      const rand = randomUUID().slice(0, 8);
      return {
        actionId: randomUUID(),
        boardId: `crsmoke-board-${rand}`,
        cardId: `crsmoke-card-${rand}`,
        cardName: `crsmoke card ${rand}`,
        listId: `crsmoke-list-${rand}`,
        listFromId: `crsmoke-from-${rand}`,
        listToId: `crsmoke-to-${rand}`,
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
          `trello-webhook-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async seedTriggerResource({ workflowId, triggerNodeId, boardId, eventType }) {
      // DIRECT-SEED only — no activation hook, no Trello API, no real webhook. The
      // config carries the callbackURL the receive route verifies the HMAC against,
      // the eventType the receive route filters on, and the boardId for the route's
      // defensive board-match check (must equal the synthetic body's board id).
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: "trello",
        eventType,
        nodeId: triggerNodeId,
        config: {
          callbackURL: buildCallbackURL(workflowId, triggerNodeId),
          eventType,
          boardId,
        },
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ identity, action, workflowId, triggerNodeId }) {
      const secret = process.env.TRELLO_CLIENT_SECRET;
      if (!secret) {
        throw new Error("trello-webhook-smoke: TRELLO_CLIENT_SECRET is not set.");
      }
      const rawBody = JSON.stringify({
        action,
        model: { id: identity.boardId, name: "crsmoke-board" },
      });
      const callbackURL = buildCallbackURL(workflowId, triggerNodeId);
      const signature = signTrelloBody(rawBody, callbackURL, secret);
      const params = new URLSearchParams({ workflowId, nodeId: triggerNodeId });
      const request = new Request(
        `http://localhost/api/webhooks/trello?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-trello-webhook": signature,
          },
          body: rawBody,
        },
      );
      const res = await trelloWebhookRoute(request);
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
      // hook (which for Trello would attempt a Trello API webhook-delete). No
      // provider-side resource exists, so a direct delete is correct and safe.
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.trello-webhook.cleanup_failed",
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
        .eq("provider", "trello")
        .eq("event_id", eventId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.trello-webhook.dedup_cleanup_failed",
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
