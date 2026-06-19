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
  type SmokeMode,
  type SmokeResult,
} from "@/scripts/chainreact/smoke/core";
import type { ActionSmokeFixture } from "./contract";
import { defaultSmokeDeps, runFixture, type SmokeHarnessDeps } from "./runFixture";
import {
  runFixtureWorkflowMode,
  type WorkflowRunDeps,
} from "./workflowRun";

export interface RunActionSmokeOptions {
  readonly providerFilter?: string | null;
  readonly includeDestructive?: boolean;
}

export interface RunActionSmokeWorkflowOptions extends RunActionSmokeOptions {
  /** Opt into a real (non-test) engine run. Default false (engine test mode). */
  readonly live?: boolean;
  readonly terminalReadAttempts?: number;
}

/** Shared loop: filter by provider, run each fixture, fold into a report. */
async function runSmokeLoop(
  fixtures: readonly ActionSmokeFixture[],
  providerFilter: string | null,
  mode: SmokeMode,
  runOne: (fixture: ActionSmokeFixture) => Promise<SmokeResult>,
): Promise<ExecutionReport> {
  const selected = providerFilter
    ? fixtures.filter((f) => f.provider === providerFilter)
    : fixtures;
  const results: SmokeResult[] = [];
  for (const fixture of selected) {
    results.push(await runOne(fixture));
  }
  return buildExecutionReport(results, mode);
}

export async function runActionSmoke(
  fixtures: readonly ActionSmokeFixture[],
  options: RunActionSmokeOptions = {},
  deps: SmokeHarnessDeps = defaultSmokeDeps,
): Promise<ExecutionReport> {
  const includeDestructive = options.includeDestructive ?? false;
  return runSmokeLoop(fixtures, options.providerFilter ?? null, "handler", (fixture) =>
    runFixture(fixture, { includeDestructive }, deps),
  );
}

export async function runActionSmokeWorkflowMode(
  fixtures: readonly ActionSmokeFixture[],
  options: RunActionSmokeWorkflowOptions,
  deps: WorkflowRunDeps,
  envLookup: (name: string) => string | undefined = (n) => process.env[n],
): Promise<ExecutionReport> {
  const includeDestructive = options.includeDestructive ?? false;
  return runSmokeLoop(fixtures, options.providerFilter ?? null, "workflow", (fixture) =>
    runFixtureWorkflowMode(
      fixture,
      { includeDestructive, live: options.live, terminalReadAttempts: options.terminalReadAttempts },
      deps,
      envLookup,
    ),
  );
}

export type { ExecutionReport };
