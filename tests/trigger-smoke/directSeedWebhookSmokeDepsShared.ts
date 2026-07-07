/**
 * Trigger-smoke — SHARED real-wiring pieces for the direct-seed webhook deps
 * (server-only test helper). The per-provider *WebhookSmokeDeps.ts files
 * implement mint/seed/deliver/cleanupRegistration and spread these common
 * implementations for the provider-agnostic touchpoints:
 *
 *   - createActiveSmokeWorkflow → service-role INSERT into `workflows`
 *     (state="active" + draft_definition; live runs fall back to the draft per
 *     services/workflows/activeRevision.ts). Test helpers are exempt from the
 *     "Supabase only in repositories/" rule (same pattern as every other
 *     trigger-smoke deps file).
 *   - listRuns/readRun → service-role diagnostics readers (incl. non-terminal),
 *     surfacing the persisted `trigger_event` so identity is verifiable.
 *   - drainRun → the REAL durable-queue processQueuedRun.
 *   - softDeleteWorkflow → service-role soft-delete.
 *   - cleanupDedup → service-role delete of the synthetic webhook_event_dedup
 *     row for the given provider.
 *
 * Imported ONLY by the gated dev integration test's deps. Never by app routes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getByIdServiceRole,
  listByWorkflowServiceRole,
  type DiagnosticsRunRecord,
} from "@/repositories/workflowRunsDiagnostics";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import type {
  DirectSeedSmokeRun,
  DirectSeedSmokeWorkflow,
} from "./directSeedWebhookSmoke";

export interface DirectSeedSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
}

function mapStatus(s: string | null | undefined): DirectSeedSmokeRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

export function toSmokeRun(rec: DiagnosticsRunRecord): DirectSeedSmokeRun {
  const event = rec.triggerEvent ?? null;
  return {
    runId: rec.id,
    status: mapStatus(rec.status),
    triggerPayload: (event?.payload as Record<string, unknown> | undefined) ?? null,
    eventId: event?.eventId ?? null,
    eventType: event?.eventType ?? null,
  };
}

export interface CommonDirectSeedDeps {
  createActiveSmokeWorkflow(
    workflow: DirectSeedSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  listRuns(workflowId: string): Promise<readonly DirectSeedSmokeRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<DirectSeedSmokeRun | null>;
  softDeleteWorkflow(workflowId: string): Promise<void>;
  cleanupDedup(eventId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export function makeCommonDirectSeedDeps(
  config: DirectSeedSmokeDepsConfig,
  provider: string,
): CommonDirectSeedDeps {
  const { supabase, accountId, userId } = config;

  return {
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
          `${provider}-webhook-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
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

    async softDeleteWorkflow(workflowId) {
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: `trigger-smoke.${provider}-webhook.cleanup_failed`,
            workflowId,
            error: error.message,
          }),
        );
      }
    },

    async cleanupDedup(eventId) {
      // The row is system bookkeeping (provider + synthetic event_id only —
      // no PII); the TTL cron would purge it anyway, but we clean it for a
      // clean 0-leak accounting.
      const { error } = await supabase
        .from("webhook_event_dedup")
        .delete()
        .eq("provider", provider)
        .eq("event_id", eventId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: `trigger-smoke.${provider}-webhook.dedup_cleanup_failed`,
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
