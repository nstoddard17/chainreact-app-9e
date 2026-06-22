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
import { getActiveForExecution } from "@/repositories/integrations";
import { getActionMeta } from "@/services/discovery/_registry";
import { getOptionsResolver } from "@/services/options/_registry";
import { OptionsResolverError } from "@/services/options/types";
import { sanitizeFailureReason } from "@/scripts/chainreact/smoke/core";
import {
  discoverSelectors,
  type DiscoveryMeta,
  type SelectorDiscoveryDeps,
  type SourceResolveOutcome,
} from "./selectorDiscovery";
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

/**
 * Real selector-discovery seams over the SAME account-scoped internals the
 * builder + engine use:
 *   - connection  → repositories/integrations.getActiveForExecution(account, …)
 *   - discovery   → the options resolver registry (the builder's dropdown
 *                   loaders) run against the connected account, take items[0].
 * READ-ONLY: only list/search option resolvers are invoked — never a mutation.
 */
function makeSelectorDiscoveryDeps(accountId: string, userId: string): SelectorDiscoveryDeps {
  return {
    getMeta(actionKey: string): DiscoveryMeta | undefined {
      const meta = getActionMeta(actionKey);
      if (!meta) return undefined;
      return {
        fields: (meta.fields ?? []).map((f) => ({
          name: f.name,
          ...(f.required === true ? { required: true } : {}),
          ...(f.optionsSource ? { optionsSource: f.optionsSource } : {}),
          ...(f.dependsOn ? { dependsOn: f.dependsOn } : {}),
        })),
      };
    },
    requiredDepsForSource(source: string): readonly string[] | undefined {
      return getOptionsResolver(source)?.requiredDeps;
    },
    async resolveSource({ source, deps }): Promise<SourceResolveOutcome> {
      const resolver = getOptionsResolver(source);
      if (!resolver) return { kind: "error", reason: "no resolver registered" };

      let integration = null;
      if (resolver.requiresIntegration) {
        integration = await getActiveForExecution(accountId, resolver.provider, null);
        if (integration === null) return { kind: "not-connected" };
      }

      try {
        const result = await resolver.resolve({ userId, integration, q: "", deps });
        const values = result.items.map((i) => i.value).filter((v) => typeof v === "string" && v.length > 0);
        if (values.length === 0) return { kind: "empty" };
        return { kind: "items", values };
      } catch (e) {
        if (e instanceof OptionsResolverError) {
          if (e.code === "INTEGRATION_DISCONNECTED" || e.code === "OWNER_MUST_CONNECT") {
            return { kind: "not-connected" };
          }
          // Sanitized, closed code only — never the raw provider body.
          return { kind: "error", reason: e.code };
        }
        return { kind: "error" };
      }
    },
  };
}

export function makeRealWorkflowRunDeps(config: RealWorkflowRunDepsConfig): WorkflowRunDeps {
  const { supabase, accountId, userId } = config;
  const selectorDeps = makeSelectorDiscoveryDeps(accountId, userId);

  return {
    async isProviderConnected(provider: string): Promise<boolean> {
      return (await getActiveForExecution(accountId, provider, null)) !== null;
    },

    async discoverSelectors(input) {
      return discoverSelectors(input, selectorDeps);
    },

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
            ? // SAFE: humanized title or the engine fatal-error CODE only (never
              // raw step output / provider responses / tokens), then sanitized as
              // belt-and-braces against a title that embedded provider text.
              sanitizeFailureReason(
                rec.errorClassification?.title ?? rec.fatalError?.code ?? "run failed",
              )
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
