/**
 * Trigger-smoke harness — REAL Slack WEBHOOK deps (server-only test helper).
 *
 * Wires the injected `SlackWebhookSmokeDeps` to the real V2 internals:
 *   - createActiveSmokeWorkflow → service-role INSERT into `workflows` with
 *     state="active" + draft_definition (live runs fall back to the draft per
 *     services/workflows/activeRevision.ts). The activation API's preconditions /
 *     billing / revision-snapshot are NOT part of the webhook-DISPATCH surface
 *     under test, so the state flip is set directly; the trigger ARMING uses the
 *     real lifecycle (below). Test helpers are exempt from the "Supabase only in
 *     repositories/" rule (same pattern as scheduledSmokeDeps.ts).
 *   - armWebhookTrigger → the REAL `registerWorkflowTriggers`. For Slack this is a
 *     pure `trigger_resources` upsert — Slack's Events API uses one global webhook
 *     URL per app, so there is NO provider-side subscription and NO integration is
 *     required (no activation hook is registered for slack). We then read the row
 *     back and return its stored event_type so the smoke proves it equals the
 *     canonical dispatch key `slack.channel_created`.
 *   - deliverSyntheticEvent → builds a synthetic Slack `event_callback`, signs it
 *     with the REAL `SLACK_SIGNING_SECRET` using Slack's documented
 *     `v0:${ts}:${rawBody}` HMAC-SHA256 contract (production verification runs
 *     UNCHANGED), and POSTs it to the REAL `POST /api/webhooks/slack` route
 *     (receive → normalize → dispatchTriggerEvent → dedup → enqueue).
 *   - listRuns/readRun → service-role diagnostics readers (incl. non-terminal),
 *     surfacing the persisted `trigger_event` so identity is verifiable.
 *   - drainRun → the REAL durable-queue processQueuedRun.
 *   - cleanupWorkflow → unregisterWorkflowTriggers + a service-role soft-delete.
 *   - cleanupDedup → service-role delete of the synthetic webhook_event_dedup row.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowRecord } from "@/repositories/workflows";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import {
  getByIdServiceRole,
  listByWorkflowServiceRole,
  type DiagnosticsRunRecord,
} from "@/repositories/workflowRunsDiagnostics";
import {
  registerWorkflowTriggers,
  unregisterWorkflowTriggers,
} from "@/services/triggers/lifecycle";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import { POST as slackWebhookRoute } from "@/app/api/webhooks/slack/route";
import {
  buildSlackChannelCreatedSmokeWorkflow,
  type SlackWebhookSmokeDeps,
  type SlackWebhookSmokeIdentity,
  type SlackWebhookSmokeRun,
  type SlackWebhookSmokeWorkflow,
} from "./slackWebhookSmoke";

export interface RealSlackWebhookSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
}

function minimalWorkflowRecord(
  workflowId: string,
  accountId: string,
  userId: string,
  workflow: SlackWebhookSmokeWorkflow,
): WorkflowRecord {
  return {
    id: workflowId,
    accountId,
    createdByUserId: userId,
    draftDefinition: workflow.definition,
  } as unknown as WorkflowRecord;
}

function mapStatus(s: string | null | undefined): SlackWebhookSmokeRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

function toSmokeRun(rec: DiagnosticsRunRecord): SlackWebhookSmokeRun {
  const event = rec.triggerEvent ?? null;
  return {
    runId: rec.id,
    status: mapStatus(rec.status),
    triggerPayload: (event?.payload as Record<string, unknown> | undefined) ?? null,
    eventId: event?.eventId ?? null,
    eventType: event?.eventType ?? null,
  };
}

function buildSyntheticEventBody(identity: SlackWebhookSmokeIdentity): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    type: "event_callback",
    team_id: identity.teamId,
    event_id: identity.eventId,
    event_time: nowSeconds,
    event: {
      type: "channel_created",
      channel: {
        id: identity.channelId,
        name: identity.channelName,
        created: nowSeconds,
        // Synthetic creator — not a real Slack user; no PII.
        creator: "U-CRSMOKE-SYNTHETIC",
        is_channel: true,
        is_private: false,
      },
      event_ts: `${nowSeconds}.000000`,
    },
  });
}

function signSlackBody(ts: string, rawBody: string, signingSecret: string): string {
  const hex = createHmac("sha256", signingSecret)
    .update(`v0:${ts}:${rawBody}`)
    .digest("hex");
  return `v0=${hex}`;
}

export function makeRealSlackWebhookSmokeDeps(
  config: RealSlackWebhookSmokeDepsConfig,
): SlackWebhookSmokeDeps {
  const { supabase, accountId, userId } = config;

  return {
    mintIdentity(): SlackWebhookSmokeIdentity {
      const rand = randomUUID().slice(0, 8);
      const stamp = Date.now();
      return {
        eventId: `Ev-crsmoke-${stamp}-${rand}`,
        channelId: `C-CRSMOKE-${rand.toUpperCase()}`,
        channelName: `crsmoke-chan-${rand}`,
        teamId: `T-CRSMOKE-${rand.toUpperCase()}`,
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
          `slack-webhook-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async armWebhookTrigger({ workflowId, triggerNodeId }) {
      const workflow = buildSlackChannelCreatedSmokeWorkflow();
      const record = minimalWorkflowRecord(workflowId, accountId, userId, workflow);
      // REAL lifecycle: Slack has no activation hook, so this is a pure
      // trigger_resources upsert (no integration lookup, no provider call).
      await registerWorkflowTriggers(record, workflow.definition);

      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      return { registeredEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ identity }) {
      const signingSecret = process.env.SLACK_SIGNING_SECRET;
      if (!signingSecret) {
        throw new Error("slack-webhook-smoke: SLACK_SIGNING_SECRET is not set.");
      }
      const rawBody = buildSyntheticEventBody(identity);
      const ts = Math.floor(Date.now() / 1000).toString();
      const signature = signSlackBody(ts, rawBody, signingSecret);
      const request = new Request("http://localhost/api/webhooks/slack", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-request-timestamp": ts,
          "x-slack-signature": signature,
        },
        body: rawBody,
      });
      const res = await slackWebhookRoute(request);
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
      const workflow = buildSlackChannelCreatedSmokeWorkflow();
      const record = minimalWorkflowRecord(workflowId, accountId, userId, workflow);
      // Real lifecycle teardown: deletes the trigger_resources row (Slack has no
      // provider-side subscription to cancel).
      await unregisterWorkflowTriggers(record).catch(() => {});
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.slack-webhook.cleanup_failed",
            workflowId,
            error: error.message,
          }),
        );
      }
    },

    async cleanupDedup(eventId) {
      // Delete the synthetic dedup row so the smoke leaves nothing behind. The
      // row is system bookkeeping (provider + synthetic event_id only — no PII);
      // the TTL cron would purge it anyway, but we clean it for a clean 0-leak.
      const { error } = await supabase
        .from("webhook_event_dedup")
        .delete()
        .eq("provider", "slack")
        .eq("event_id", eventId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.slack-webhook.dedup_cleanup_failed",
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
