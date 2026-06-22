/**
 * Write smoke harness — REAL runActionStep dep (server-only test helper).
 *
 * Wires `WriteHarnessDeps.runActionStep` to the real V2 engine: each phase step
 * (setup / execute / verify / cleanup) runs as its OWN minimal
 * `{native:manual.run -> action}` workflow through the SAME enqueueRun path the
 * run-now route uses, in engine REAL mode, then the per-node output is read back
 * so the orchestrator can capture the created resource id.
 *
 * Why one workflow PER step (not one multi-node workflow): the write orchestrator
 * needs cleanup to run even when execute/verify failed (a finally-style teardown).
 * A single multi-node workflow would stop at the failed node and never reach
 * cleanup. Running each step independently preserves that guarantee and keeps the
 * ledger the single source of truth for what to clean up.
 *
 * SAFETY:
 *   - REAL mode (testMode=false) — this DOES call the provider. The caller gates
 *     it behind the write + destructive opt-ins (runWriteSmoke + the dev test).
 *   - Each step consumes one task from the smoke account's balance.
 *   - Node output stays in memory (returned to the pure orchestrator, which reads
 *     ONLY the captured id path into the ledger). It is never logged or surfaced
 *     in a report. Failure reasons are humanized titles / engine codes, sanitized.
 *   - Temp workflows are soft-deleted (state='deleted', named `smoke:write:`).
 *
 * Imported ONLY by the gated dev integration test; never by app/server/CLI.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
} from "@/integrations/native/triggers/manualTrigger";
import { enqueueRun } from "@/services/execution/enqueue";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import { getActiveForExecution } from "@/repositories/integrations";
import { sanitizeFailureReason } from "@/scripts/chainreact/smoke/core";
import { SMOKE_ACTION_NODE_ID, SMOKE_TRIGGER_NODE_ID } from "./workflowRun";
import type { StepRunOutcome, WriteHarnessDeps } from "./writeHarness";

export interface RealWriteHarnessDepsConfig {
  /** A service-role Supabase client (the dev test constructs it). */
  readonly supabase: SupabaseClient;
  /** Account that owns the temp smoke workflows + runs (and the provider creds). */
  readonly accountId: string;
  /** Provenance user (created_by_user_id + triggered_by_user_id). */
  readonly userId: string;
  /** Crypto-random uuid generator (node:crypto.randomUUID in the test). */
  readonly newUuid: () => string;
}

function buildSingleActionDefinition(
  provider: string,
  action: string,
  config: Readonly<Record<string, unknown>>,
): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: MANUAL_TRIGGER_PROVIDER,
        type: MANUAL_TRIGGER_EVENT_TYPE,
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider,
        type: action,
        config,
        position: { x: 0, y: 160 },
      },
    ],
    edges: [{ id: "smoke-edge", from: SMOKE_TRIGGER_NODE_ID, to: SMOKE_ACTION_NODE_ID }],
  });
}

/**
 * Is the provider actually connected on the smoke account? Used by the dev test
 * to SKIP cleanly (never FAIL) when the pilot provider is not connected.
 */
export async function isProviderConnectedForWrite(
  accountId: string,
  provider: string,
): Promise<boolean> {
  return (await getActiveForExecution(accountId, provider, null)) !== null;
}

export function makeRealWriteHarnessDeps(
  config: RealWriteHarnessDepsConfig,
): WriteHarnessDeps {
  const { supabase, accountId, userId, newUuid } = config;

  return {
    async runActionStep(input): Promise<StepRunOutcome> {
      let definition: WorkflowDefinition;
      try {
        definition = buildSingleActionDefinition(input.provider, input.action, input.config);
      } catch (err) {
        return { ok: false, output: null, reason: sanitizeFailureReason((err as Error).message) };
      }

      // 1. Persist a throwaway draft workflow (manual.run registers no resources).
      const { data, error } = await supabase
        .from("workflows")
        .insert({
          account_id: accountId,
          created_by_user_id: userId,
          name: `smoke:write:${input.provider}:${input.action}`,
          state: "draft",
          draft_definition: definition,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) {
        return {
          ok: false,
          output: null,
          reason: sanitizeFailureReason(`createSmokeWorkflow failed: ${error?.message ?? "no row"}`),
        };
      }
      const workflowId = data.id;

      try {
        // 2. Run it LIVE (real provider call) via the run-now service path.
        const event: TriggerEvent = {
          provider: MANUAL_TRIGGER_PROVIDER,
          eventType: MANUAL_TRIGGER_EVENT_TYPE,
          eventId: newUuid(),
          occurredAt: new Date().toISOString(),
          providerAccountId: "system",
          payload: { inputs: {} },
        };
        let enginePromise: Promise<void> = Promise.resolve();
        const { runId } = await enqueueRun({
          workflowId,
          triggerNodeId: SMOKE_TRIGGER_NODE_ID,
          event,
          testMode: false,
          triggeredBy: "manual",
          triggeredByUserId: userId,
          executionDefinitionMode: "live",
          keepAlive: (p) => {
            enginePromise = p;
          },
        });
        await enginePromise;

        // 3. Read the persisted run + the action node's output.
        const rec = await workflowRunsRepo.getById(runId);
        if (!rec) return { ok: false, output: null, reason: "run did not reach a terminal state" };

        const step = rec.steps.find((s) => s.nodeId === SMOKE_ACTION_NODE_ID);
        const ok = rec.status === "succeeded" && step?.status === "succeeded";
        if (ok) {
          return { ok: true, output: step?.output ?? null, reason: null };
        }
        return {
          ok: false,
          output: null,
          // SAFE: humanized title or engine fatal-error CODE only, sanitized.
          reason: sanitizeFailureReason(
            rec.errorClassification?.title ?? rec.fatalError?.code ?? "step run failed",
          ),
        };
      } catch (err) {
        return { ok: false, output: null, reason: sanitizeFailureReason((err as Error).message) };
      } finally {
        // 4. Best-effort soft-delete of the temp workflow (never flips a verdict).
        const { error: delErr } = await supabase
          .from("workflows")
          .update({ state: "deleted", deleted_at: new Date().toISOString() })
          .eq("id", workflowId);
        if (delErr) {
          console.warn(
            JSON.stringify({ event: "smoke.write.cleanup_failed", workflowId, error: delErr.message }),
          );
        }
      }
    },
  };
}
