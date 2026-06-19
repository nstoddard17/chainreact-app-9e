/**
 * Action smoke harness — top-level runner.
 *
 * Runs the selected fixtures sequentially (deterministic order, and never fans
 * out parallel provider calls), then folds the per-fixture results into the
 * shared ExecutionReport shape (same JSON the CLI core defines). Sequential is
 * intentional: smoke runs are small and we never want to burst a provider.
 */
import {
  buildExecutionReport,
  type ExecutionReport,
} from "@/scripts/chainreact/smoke/core";
import type { ActionSmokeFixture } from "./contract";
import { defaultSmokeDeps, runFixture, type SmokeHarnessDeps } from "./runFixture";

export interface RunActionSmokeOptions {
  readonly providerFilter?: string | null;
  readonly includeDestructive?: boolean;
}

export async function runActionSmoke(
  fixtures: readonly ActionSmokeFixture[],
  options: RunActionSmokeOptions = {},
  deps: SmokeHarnessDeps = defaultSmokeDeps,
): Promise<ExecutionReport> {
  const providerFilter = options.providerFilter ?? null;
  const includeDestructive = options.includeDestructive ?? false;

  const selected = providerFilter
    ? fixtures.filter((f) => f.provider === providerFilter)
    : fixtures;

  const results = [];
  for (const fixture of selected) {
    results.push(await runFixture(fixture, { includeDestructive }, deps));
  }
  return buildExecutionReport(results);
}

export type { ExecutionReport };
