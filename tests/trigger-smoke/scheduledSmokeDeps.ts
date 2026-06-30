/**
 * Trigger-smoke harness — REAL scheduled-trigger deps (server-only test helper).
 *
 * Wires the injected `ScheduledSmokeDeps` to the real V2 internals:
 *   - createActiveSmokeWorkflow → service-role INSERT into `workflows` with
 *     state="active" + draft_definition + NULL active_revision_id (live runs fall
 *     back to the draft, per services/workflows/activeRevision.ts). The activation
 *     API's preconditions / billing / revision-snapshot are NOT part of the
 *     scheduled-DISPATCH surface under test, so the state flip is set directly;
 *     the trigger ARMING uses the real lifecycle (below). Test helpers are exempt
 *     from the "Supabase only in repositories/" rule (same pattern as
 *     workflowRunDeps.ts).
 *   - armScheduledTrigger → the REAL registerWorkflowTriggers (runs the native
 *     scheduled activation hook → computes the first nextFireAt → upserts
 *     trigger_resources), then reads nextFireAt back from the persisted row.
 *   - countOtherDueScheduled → trigger_resources.listForDispatch + state gate +
 *     nextFireAt parse, so the global orchestrator is only driven when this
 *     smoke's row is the sole due row (blast radius 0).
 *   - runOrchestrator → the REAL services/cron/runScheduledTriggers(nowOverride).
 *   - listRuns/readRun → service-role diagnostics readers (incl. non-terminal).
 *   - drainRun → the REAL durable-queue processQueuedRun.
 *   - cleanup → unregisterWorkflowTriggers (deletes trigger_resources) + a
 *     service-role soft-delete of the smoke workflow.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowRecord } from "@/repositories/workflows";
import { getStateForDispatch } from "@/repositories/workflows";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import {
  getByIdServiceRole,
  listByWorkflowServiceRole,
} from "@/repositories/workflowRunsDiagnostics";
import {
  registerWorkflowTriggers,
  unregisterWorkflowTriggers,
} from "@/services/triggers/lifecycle";
import { runScheduledTriggers } from "@/services/cron/runScheduledTriggers";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import { ScheduledTriggerStoredConfigSchema } from "@/integrations/native/triggers/scheduledTrigger";
import {
  buildScheduledSmokeDefinition,
  type ScheduledSmokeDeps,
  type ScheduledSmokeRun,
  type ScheduledSmokeWorkflow,
} from "./scheduledSmoke";

export interface RealScheduledSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
}

/** Minimal WorkflowRecord the lifecycle functions actually read (id / account /
 * creator / draftDefinition). Built from known inputs — this is a test helper. */
function minimalWorkflowRecord(
  workflowId: string,
  accountId: string,
  userId: string,
  workflow: ScheduledSmokeWorkflow,
): WorkflowRecord {
  return {
    id: workflowId,
    accountId,
    createdByUserId: userId,
    draftDefinition: workflow.definition,
  } as unknown as WorkflowRecord;
}

function mapStatus(s: string | null | undefined): ScheduledSmokeRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

export function makeRealScheduledSmokeDeps(
  config: RealScheduledSmokeDepsConfig,
): ScheduledSmokeDeps {
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
          `scheduled-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async armScheduledTrigger({ workflowId, triggerNodeId }) {
      const workflow = buildScheduledSmokeDefinition();
      const record = minimalWorkflowRecord(workflowId, accountId, userId, workflow);
      // REAL lifecycle: runs the native scheduled activation hook (computes the
      // first nextFireAt strictly after the activation instant) + upserts the
      // trigger_resources row.
      await registerWorkflowTriggers(record, workflow.definition);

      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      if (!row) throw new Error("scheduled-smoke: trigger_resources row not found after arming");
      const parsed = ScheduledTriggerStoredConfigSchema.safeParse(row.config);
      if (!parsed.success) {
        throw new Error("scheduled-smoke: armed trigger_resources config malformed");
      }
      const ms = Date.parse(parsed.data.nextFireAt);
      return { nextFireAtMs: ms };
    },

    async countOtherDueScheduled({ nowMs, excludeWorkflowId }) {
      const rows = await triggerResourcesRepo.listForDispatch("native", "schedule.fired");
      let due = 0;
      for (const row of rows) {
        if (row.workflowId === excludeWorkflowId) continue;
        const state = await getStateForDispatch(row.workflowId);
        if (state !== "active") continue;
        const parsed = ScheduledTriggerStoredConfigSchema.safeParse(row.config);
        if (!parsed.success) continue;
        const ms = Date.parse(parsed.data.nextFireAt);
        if (!Number.isNaN(ms) && ms <= nowMs) due += 1;
      }
      return due;
    },

    async runOrchestrator(nowMs) {
      const r = await runScheduledTriggers(nowMs);
      return { fired: r.fired };
    },

    async listRuns(workflowId) {
      const runs = await listByWorkflowServiceRole(workflowId, {
        includeRunning: true,
        limit: 50,
      });
      return runs.map((r) => ({ runId: r.id, status: mapStatus(r.status) }));
    },

    async drainRun(runId) {
      await processQueuedRun(runId);
    },

    async readRun(runId) {
      const rec = await getByIdServiceRole(runId);
      if (!rec) return null;
      return { runId, status: mapStatus(rec.status) };
    },

    async cleanup(workflowId) {
      const workflow = buildScheduledSmokeDefinition();
      const record = minimalWorkflowRecord(workflowId, accountId, userId, workflow);
      // Real lifecycle teardown: deletes the trigger_resources row (native
      // scheduled has no provider-side subscription to cancel).
      await unregisterWorkflowTriggers(record).catch(() => {});
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({ event: "trigger-smoke.cleanup_failed", workflowId, error: error.message }),
        );
      }
    },
  };
}
