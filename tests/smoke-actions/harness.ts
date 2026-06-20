/**
 * Action smoke harness — top-level runners.
 *
 * Two runtime modes share one sequential loop (deterministic order; never bursts
 * a provider):
 *   - runActionSmoke           — fast handler-dispatch mode (runFixture).
 *   - runActionSmokeWorkflowMode — full manual run-now mode (runFixtureWorkflowMode).
 *
 * Both fold per-fixture results into the shared ExecutionReport, tagged with the
 * mode so the JSON/human output says which runtime produced it.
 */
import {
  buildExecutionReport,
  type ExecutionReport,
  type ProviderBoundary,
  type SmokeMode,
  type SmokeResult,
} from "@/scripts/chainreact/smoke/core";
import { isCertifiedLivePass as defaultIsCertifiedLivePass } from "@/scripts/chainreact/smoke/certification";
import { effectiveLiveRisk, type ActionSmokeFixture } from "./contract";
import { defaultSmokeDeps, runFixture, type SmokeHarnessDeps } from "./runFixture";
import {
  runFixtureWorkflowMode,
  type WorkflowRunDeps,
} from "./workflowRun";

export interface RunActionSmokeOptions {
  readonly providerFilter?: string | null;
  readonly includeDestructive?: boolean;
  /** Boundary label for handler mode (default "live"; tests pass "mocked"). */
  readonly providerBoundary?: ProviderBoundary;
}

export interface RunActionSmokeWorkflowOptions {
  readonly providerFilter?: string | null;
  readonly includeDestructive?: boolean;
  /** Opt into a real (non-test) engine run. Default false (engine test mode). */
  readonly live?: boolean;
  /** Second half of the destructive double-opt-in in live mode. Default false. */
  readonly allowDestructive?: boolean;
  /** Enable live `write` fixtures (ALLOW_LIVE_PROVIDER_WRITE_SMOKE). Default false. */
  readonly allowWrite?: boolean;
  readonly terminalReadAttempts?: number;
  /**
   * Turn ON the certification planner (live mode only). The live verification
   * runner enables this so a default sweep conserves task budget + provider
   * calls by NOT re-running actions already certified LIVE_PASS — they report
   * `certified-skip` and never reach the engine. Default OFF so harness-mechanics
   * callers/tests run every fixture as before.
   */
  readonly applyCertificationPlanner?: boolean;
  /**
   * Explicit full-regression sweep: re-run certified LIVE_PASS actions instead
   * of skipping them (SMOKE_RERUN_PASSED=1). Only meaningful with the planner on.
   */
  readonly rerunPassed?: boolean;
  /** Injectable LIVE_PASS lookup (default reads the real certification matrix). */
  readonly isCertifiedLivePass?: (provider: string, action: string) => boolean;
}

/**
 * Shared loop: filter by provider, optionally short-circuit a fixture via the
 * `plan` (certified-skip), else run it, fold into a report. `plan` returns a
 * ready-made SmokeResult to use INSTEAD of running (so the provider is never
 * called), or null to run normally.
 */
async function runSmokeLoop(
  fixtures: readonly ActionSmokeFixture[],
  providerFilter: string | null,
  mode: SmokeMode,
  runOne: (fixture: ActionSmokeFixture) => Promise<SmokeResult>,
  opts: {
    readonly plan?: (fixture: ActionSmokeFixture) => SmokeResult | null;
    readonly rerunPassed?: boolean;
  } = {},
): Promise<ExecutionReport> {
  const selected = providerFilter
    ? fixtures.filter((f) => f.provider === providerFilter)
    : fixtures;
  const results: SmokeResult[] = [];
  for (const fixture of selected) {
    const planned = opts.plan?.(fixture) ?? null;
    results.push(planned ?? (await runOne(fixture)));
  }
  return buildExecutionReport(results, mode, opts.rerunPassed ?? false);
}

/**
 * Build the `certified-skip` result for an action skipped by the planner. Live
 * boundary (the run happened in a live sweep, we just didn't call the provider)
 * so existing "every result is live" assertions hold. No runId / workflowId / no
 * missingEnv — it is NOT an env skip.
 */
function certifiedSkipResult(fixture: ActionSmokeFixture): SmokeResult {
  return {
    provider: fixture.provider,
    action: fixture.action,
    risk: fixture.risk,
    liveRisk: effectiveLiveRisk(fixture),
    outcome: "certified-skip",
    reason: "certified LIVE_PASS — not re-run (set SMOKE_RERUN_PASSED=1 to re-run)",
    runId: null,
    providerBoundary: "live",
  };
}

export async function runActionSmoke(
  fixtures: readonly ActionSmokeFixture[],
  options: RunActionSmokeOptions = {},
  deps: SmokeHarnessDeps = defaultSmokeDeps,
): Promise<ExecutionReport> {
  const includeDestructive = options.includeDestructive ?? false;
  return runSmokeLoop(fixtures, options.providerFilter ?? null, "handler", (fixture) =>
    runFixture(fixture, { includeDestructive, providerBoundary: options.providerBoundary }, deps),
  );
}

export async function runActionSmokeWorkflowMode(
  fixtures: readonly ActionSmokeFixture[],
  options: RunActionSmokeWorkflowOptions,
  deps: WorkflowRunDeps,
  envLookup: (name: string) => string | undefined = (n) => process.env[n],
): Promise<ExecutionReport> {
  const includeDestructive = options.includeDestructive ?? false;
  const mode: SmokeMode = options.live ? "workflow-live" : "workflow-test";
  const rerunPassed = options.rerunPassed ?? false;
  const plannerOn = options.applyCertificationPlanner === true && mode === "workflow-live";
  const isCertifiedLivePass = options.isCertifiedLivePass ?? defaultIsCertifiedLivePass;

  // The planner (when ON, live mode, not a rerun sweep) only ever SKIPS a
  // liveSafe action already certified LIVE_PASS. It NEVER makes an uncertified
  // action run — a destructive action is never LIVE_PASS, so it is never
  // planner-skipped and stays fully gated by the downstream destructive/write
  // double-opt-ins. So enabling the planner cannot loosen any live gate.
  const plan =
    plannerOn && !rerunPassed
      ? (fixture: ActionSmokeFixture): SmokeResult | null =>
          fixture.liveSafe === true && isCertifiedLivePass(fixture.provider, fixture.action)
            ? certifiedSkipResult(fixture)
            : null
      : undefined;

  return runSmokeLoop(
    fixtures,
    options.providerFilter ?? null,
    mode,
    (fixture) =>
      runFixtureWorkflowMode(
        fixture,
        {
          includeDestructive,
          live: options.live,
          allowDestructive: options.allowDestructive,
          allowWrite: options.allowWrite,
          terminalReadAttempts: options.terminalReadAttempts,
        },
        deps,
        envLookup,
      ),
    { plan, rerunPassed },
  );
}

export type { ExecutionReport };
