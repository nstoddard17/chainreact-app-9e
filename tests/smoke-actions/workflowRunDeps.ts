/**
 * Action smoke harness — REAL workflow-run deps (server-only test helper).
 *
 * Wires the injected `WorkflowRunDeps` seams to the real V2 internals:
 *   - createSmokeWorkflow  → a service-role INSERT into `workflows` (a draft;
 *                            manual.run registers no trigger_resources). There is
 *                            no service-role create in the repo, so the harness
 *                            inserts directly via the supplied service-role
 *                            client. This is permitted: the project-structure
 *                            rule exempts TEST HELPERS from the
 *                            "Supabase access only in repositories/" boundary,
 *                            and the established dev-DB test pattern
 *                            (reserveReconcileEngine.dev.test.ts) seeds the same
 *                            way.
 *   - runManualAndAwait    → `enqueueRun` (the exact service the run-now route
 *                            calls) + await the engine promise via the keepAlive
 *                            seam, so the run is terminal before we read it.
 *   - readRun              → `workflowRuns.getById` (existing service-role,
 *                            terminal-only repo read), projected to SAFE fields.
 *   - cleanupSmokeWorkflow → service-role soft-delete (state='deleted'). Lifecycle-
 *                            aligned: a manual/native workflow delete unregisters
 *                            nothing. Rows are marked deleted + named `smoke:` —
 *                            never hard-purged here, so run history is retained.
 *
 * This module is imported ONLY by the gated dev integration test. It is never
 * imported by app/server routes or the offline CLI.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
} from "@/integrations/native/triggers/manualTrigger";
import { enqueueRun } from "@/services/execution/enqueue";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import type {
  RunManualInput,
  SmokeManualRunWorkflow,
  SmokePersistedRun,
  WorkflowRunDeps,
} from "./workflowRun";

export interface RealWorkflowRunDepsConfig {
  /** A service-role Supabase client (the dev test constructs it). */
  readonly supabase: SupabaseClient;
  /** Account that will own the smoke workflow + run. */
  readonly accountId: string;
  /** Provenance user (created_by_user_id + triggered_by_user_id). */
  readonly userId: string;
  /** Crypto-random uuid generator (node:crypto.randomUUID in the test). */
  readonly newUuid: () => string;
}

export function makeRealWorkflowRunDeps(config: RealWorkflowRunDepsConfig): WorkflowRunDeps {
  const { supabase, accountId, userId } = config;

  return {
    async createSmokeWorkflow(workflow: SmokeManualRunWorkflow) {
      const { data, error } = await supabase
        .from("workflows")
        .insert({
          account_id: accountId,
          created_by_user_id: userId,
          name: workflow.name,
          state: "draft",
          draft_definition: workflow.definition,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) {
        throw new Error(`smoke createSmokeWorkflow failed: ${error?.message ?? "no row"}`);
      }
      return { workflowId: data.id };
    },

    async runManualAndAwait(input: RunManualInput) {
      const testMode = input.live !== true;
      const event: TriggerEvent = {
        provider: MANUAL_TRIGGER_PROVIDER,
        eventType: MANUAL_TRIGGER_EVENT_TYPE,
        eventId: config.newUuid(),
        occurredAt: new Date().toISOString(),
        providerAccountId: "system",
        // Manual trigger payload shape is { inputs }. Smoke workflows are
        // self-contained (no trigger-payload refs), so inputs stay empty.
        payload: { inputs: {} },
      };

      // Capture + await the background engine promise via the same keepAlive
      // seam the run-now route uses, so the run is terminal before we read it.
      let enginePromise: Promise<void> = Promise.resolve();
      const { runId } = await enqueueRun({
        workflowId: input.workflowId,
        triggerNodeId: input.triggerNodeId,
        event,
        testMode,
        triggeredBy: testMode ? "test" : "manual",
        triggeredByUserId: userId,
        executionDefinitionMode: testMode ? "draft" : "live",
        keepAlive: (p) => {
          enginePromise = p;
        },
      });
      await enginePromise;
      return { runId };
    },

    async readRun(runId: string): Promise<SmokePersistedRun | null> {
      const rec = await workflowRunsRepo.getById(runId);
      if (!rec) return { runId, status: null, failureReason: null };
      return {
        runId,
        status: rec.status,
        failureReason:
          rec.status === "failed"
            ? // SAFE: humanized title or the engine fatal-error CODE only.
              // Never raw step output / provider responses / tokens.
              rec.errorClassification?.title ?? rec.fatalError?.code ?? "run failed"
            : null,
      };
    },

    async cleanupSmokeWorkflow(workflowId: string): Promise<void> {
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        // Non-fatal: cleanup failure is logged, never flips the verdict.
        console.warn(
          JSON.stringify({ event: "smoke.cleanup_failed", workflowId, error: error.message }),
        );
      }
    },
  };
}
