/**
 * Action smoke harness — FULL workflow-run mode.
 *
 * Where handler-dispatch mode (runFixture.ts) exercises just the per-node core
 * (strict resolve -> handler), this mode exercises the whole manual run path the
 * app uses:
 *
 *   build a minimal {native:manual.run trigger -> fixture action} workflow
 *     -> persist it (a draft; manual.run registers no trigger_resources)
 *     -> run it via the same enqueueRun the run-now route calls
 *     -> wait for a terminal `workflow_runs` row
 *     -> PASS / FAIL / SKIP from the PERSISTED run status vs the fixture.
 *
 * Every DB / engine touchpoint is behind an injected `WorkflowRunDeps` so this
 * orchestrator is fully unit-testable with fakes; the real wiring (service-role
 * persistence + enqueueRun + workflowRuns.getById) lives in
 * `workflowRunDeps.ts` and only runs in the gated dev integration test.
 *
 * Safety:
 *   - destructive fixtures still require includeDestructive,
 *   - missing env SKIPs BEFORE any workflow is created,
 *   - runs default to engine TEST MODE, which executes native/logic handlers for
 *     real but blocks every external/destructive handler (testModeGate) — so no
 *     real provider call happens unless a fixture explicitly opts into live.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
} from "@/integrations/native/triggers/manualTrigger";
import {
  sanitizeFailureReason,
  type ProviderBoundary,
  type SmokeResult,
} from "@/scripts/chainreact/smoke/core";
import type { ActionSmokeFixture } from "./contract";
import { effectiveLiveRisk, fixtureKey, resolveFixtureConfig } from "./contract";

export const SMOKE_TRIGGER_NODE_ID = "smoke-trigger";
export const SMOKE_ACTION_NODE_ID = "smoke-action";

export interface SmokeManualRunWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  /** Stable display name; clearly marks the workflow as smoke-owned. */
  readonly name: string;
}

/**
 * Build the minimal manual-run workflow for a fixture: a `native:manual.run`
 * trigger wired to the fixture's action. Pure + schema-validated, so an invalid
 * shape fails loudly here (not deep in the engine). The action config is the
 * fixture config verbatim (resolution happens in the engine at run time).
 */
export function buildSmokeManualRunDefinition(
  fixture: ActionSmokeFixture,
  configOverride?: Readonly<Record<string, unknown>>,
): SmokeManualRunWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
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
        provider: fixture.provider,
        type: fixture.action,
        config: configOverride ?? fixture.config,
        position: { x: 0, y: 160 },
      },
    ],
    edges: [{ id: "smoke-edge", from: SMOKE_TRIGGER_NODE_ID, to: SMOKE_ACTION_NODE_ID }],
  });

  return {
    definition,
    triggerNodeId: SMOKE_TRIGGER_NODE_ID,
    actionNodeId: SMOKE_ACTION_NODE_ID,
    name: `smoke:${fixtureKey(fixture)}`,
  };
}

/** Terminal-state projection of a persisted run — SAFE fields only. */
export interface SmokePersistedRun {
  readonly runId: string;
  /** Terminal status, or null/"running" when the row isn't terminal yet. */
  readonly status: "succeeded" | "failed" | "running" | null;
  /**
   * Humanized failure reason on a failed run (errorClassification title or the
   * engine fatal-error code). NEVER raw provider output, tokens, or step blobs.
   */
  readonly failureReason: string | null;
}

export interface RunManualInput {
  readonly workflowId: string;
  readonly triggerNodeId: string;
  /** When false, the engine runs for real (live). Default true = test mode. */
  readonly live: boolean;
}

/** Injected seams. Defaults wired in workflowRunDeps.ts; fakes in tests. */
export interface WorkflowRunDeps {
  createSmokeWorkflow(
    workflow: SmokeManualRunWorkflow,
  ): Promise<{ workflowId: string }>;
  runManualAndAwait(input: RunManualInput): Promise<{ runId: string }>;
  /** Read the persisted run; may be polled by the orchestrator. */
  readRun(runId: string): Promise<SmokePersistedRun | null>;
  /** Best-effort cleanup (soft-delete) of a temporary smoke workflow. */
  cleanupSmokeWorkflow(workflowId: string): Promise<void>;
}

export interface RunFixtureWorkflowOptions {
  readonly includeDestructive: boolean;
  /**
   * Opt into a real (non-test) engine run — the external provider handler runs
   * against the real API. Needs creds + task balance. Default false (test mode:
   * external/destructive handlers blocked by testModeGate).
   */
  readonly live?: boolean;
  /**
   * The second half of the destructive double-opt-in in LIVE mode (mirrors the
   * `ALLOW_DESTRUCTIVE_PROVIDER_SMOKE` env gate). A destructive fixture runs live
   * ONLY when `includeDestructive && allowDestructive`. Ignored in test mode
   * (testModeGate blocks destructive handlers there regardless).
   */
  readonly allowDestructive?: boolean;
  /**
   * Enables LIVE `write` fixtures (mirrors `ALLOW_LIVE_PROVIDER_WRITE_SMOKE`). A
   * live fixture classified `write` runs ONLY when this is true. Ignored in test
   * mode. Default false.
   */
  readonly allowWrite?: boolean;
  /** How many times to re-read the run before giving up on a terminal state. */
  readonly terminalReadAttempts?: number;
}

function missingEnv(fixture: ActionSmokeFixture, envLookup: (n: string) => string | undefined): string[] {
  return (fixture.requiredEnv ?? []).filter((name) => {
    const v = envLookup(name);
    return v === undefined || v === "";
  });
}

/**
 * Plan + (when runnable) execute one fixture through the full workflow-run path.
 * Never throws — every failure mode becomes a structured SmokeResult.
 */
export async function runFixtureWorkflowMode(
  fixture: ActionSmokeFixture,
  options: RunFixtureWorkflowOptions,
  deps: WorkflowRunDeps,
  envLookup: (name: string) => string | undefined = (n) => process.env[n],
): Promise<SmokeResult> {
  const live = options.live === true;
  const liveRisk = effectiveLiveRisk(fixture);
  const providerBoundary: ProviderBoundary = live ? "live" : "blocked";
  const base = {
    provider: fixture.provider,
    action: fixture.action,
    risk: fixture.risk,
    liveRisk,
    providerBoundary,
  };
  const skip = (reason: string): SmokeResult => ({
    ...base,
    outcome: "skip",
    reason,
    runId: null,
    workflowId: null,
  });

  // 1. Safety gates — all run BEFORE any workflow is created.
  if (live) {
    // (a) Only liveSafe fixtures may hit a real provider.
    if (fixture.liveSafe !== true) {
      return skip("not marked liveSafe — excluded from live-connected mode");
    }
    // (b) Per-class opt-in, keyed on the effective live risk (liveRisk ?? risk).
    if (liveRisk === "destructive") {
      if (!(options.includeDestructive && options.allowDestructive === true)) {
        return skip(
          "destructive — needs includeDestructive + allowDestructive (ALLOW_DESTRUCTIVE_PROVIDER_SMOKE)",
        );
      }
    } else if (liveRisk === "write") {
      if (options.allowWrite !== true) {
        return skip("write — needs ALLOW_LIVE_PROVIDER_WRITE_SMOKE");
      }
    }
    // read → the live-mode opt-in (ALLOW_LIVE_PROVIDER_SMOKE) is the only gate.
  } else {
    // Test mode: destructive needs includeDestructive (testModeGate blocks the
    // handler anyway, so this is just to keep the report honest).
    if (fixture.risk === "destructive" && !options.includeDestructive) {
      return skip("destructive — pass includeDestructive to run");
    }
  }

  // 2. Missing env → SKIP, before creating/running anything.
  const missing = missingEnv(fixture, envLookup);
  if (missing.length > 0) {
    return skip(`missing env: ${missing.join(", ")}`);
  }

  // 3. Build the manual-run workflow (pure + validated) with the env-config
  // overlay applied (e.g. a real channel id sourced from SMOKE_SLACK_CHANNEL_ID).
  let workflow: SmokeManualRunWorkflow;
  try {
    workflow = buildSmokeManualRunDefinition(fixture, resolveFixtureConfig(fixture, envLookup));
  } catch (err) {
    return {
      ...base,
      outcome: "fail",
      reason: sanitizeFailureReason(`could not build smoke workflow: ${(err as Error).message}`),
      runId: null,
      workflowId: null,
    };
  }

  let workflowId: string | null = null;
  try {
    ({ workflowId } = await deps.createSmokeWorkflow(workflow));
    const { runId } = await deps.runManualAndAwait({
      workflowId,
      triggerNodeId: workflow.triggerNodeId,
      live: options.live === true,
    });

    const run = await readTerminalRun(deps, runId, options.terminalReadAttempts ?? 1);
    if (!run || run.status === null || run.status === "running") {
      return {
        ...base,
        outcome: "fail",
        reason: "run did not reach a terminal persisted state",
        runId,
        workflowId,
      };
    }

    return classifyPersistedRun(base, fixture, run, workflowId);
  } catch (err) {
    return {
      ...base,
      outcome: "fail",
      reason: sanitizeFailureReason((err as Error).message),
      runId: null,
      workflowId,
    };
  } finally {
    if (workflowId) {
      // Best-effort cleanup; a cleanup failure must not flip the verdict.
      await deps.cleanupSmokeWorkflow(workflowId).catch(() => {});
    }
  }
}

async function readTerminalRun(
  deps: WorkflowRunDeps,
  runId: string,
  attempts: number,
): Promise<SmokePersistedRun | null> {
  let last: SmokePersistedRun | null = null;
  for (let i = 0; i < Math.max(1, attempts); i += 1) {
    last = await deps.readRun(runId);
    if (last && last.status !== null && last.status !== "running") return last;
  }
  return last;
}

function classifyPersistedRun(
  base: {
    provider: string;
    action: string;
    risk: ActionSmokeFixture["risk"];
    liveRisk: ActionSmokeFixture["risk"];
    providerBoundary: ProviderBoundary;
  },
  fixture: ActionSmokeFixture,
  run: SmokePersistedRun,
  workflowId: string,
): SmokeResult {
  // run.failureReason is sanitized at the deps boundary; sanitize again here as
  // defense-in-depth (idempotent) since fakes/other deps may not.
  const safeReason = sanitizeFailureReason(run.failureReason) ?? "run failed";

  if (fixture.expect.outcome === "success") {
    if (run.status === "succeeded") {
      return { ...base, outcome: "pass", reason: null, runId: run.runId, workflowId };
    }
    return { ...base, outcome: "fail", reason: safeReason, runId: run.runId, workflowId };
  }

  // expect.outcome === "failure"
  if (run.status === "failed") {
    const want = fixture.expect.errorIncludes;
    if (want && !(run.failureReason ?? "").includes(want)) {
      return {
        ...base,
        outcome: "fail",
        reason: sanitizeFailureReason(`expected failure containing "${want}", got: ${safeReason}`),
        runId: run.runId,
        workflowId,
      };
    }
    return { ...base, outcome: "pass", reason: null, runId: run.runId, workflowId };
  }
  return {
    ...base,
    outcome: "fail",
    reason: "expected a failure but the run succeeded",
    runId: run.runId,
    workflowId,
  };
}
