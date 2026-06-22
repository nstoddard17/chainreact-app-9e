/**
 * Write smoke harness — batch runner.
 *
 * Loops the WRITE_SMOKE_FIXTURES (or one provider's) through the pure
 * `runWriteSmoke` orchestrator over an injected `WriteHarnessDeps`, sequentially
 * (deterministic order, never bursts a provider). Returns both the rich per-
 * fixture WriteSmokeResults (phase + ledger detail for the human report) and a
 * folded ExecutionReport so write results join the SAME zero-FAIL gate the read
 * harness uses. Kept SEPARATE from the read runner so registering write fixtures
 * never changes read/native smoke behavior.
 */
import { buildExecutionReport, type ExecutionReport } from "@/scripts/chainreact/smoke/core";
import type { ActionSmokeFixture } from "./contract";
import {
  foldToSmokeResult,
  runWriteSmoke,
  type WriteHarnessDeps,
  type WriteSmokeResult,
} from "./writeHarness";

export interface RunWriteSmokeBatchOptions {
  readonly providerFilter?: string | null;
  /** ALLOW_LIVE_PROVIDER_WRITE_SMOKE — required by every mutating class. */
  readonly allowWrite?: boolean;
  /** ALLOW_DESTRUCTIVE_PROVIDER_SMOKE — required by destructiveSafe. */
  readonly allowDestructive?: boolean;
  /** Plan only; never call a mutating seam. */
  readonly dryRun?: boolean;
  /** Per-run unique token used to build the smoke marker (e.g. a short uuid). */
  readonly runToken: string;
  readonly envLookup?: (name: string) => string | undefined;
}

export interface WriteSmokeBatchResult {
  /** Folded into the shared zero-FAIL gate (CLEANUP_FAILED/VERIFY_FAILED -> fail). */
  readonly report: ExecutionReport;
  /** Rich per-fixture detail (phases + ledger summary) for the human report. */
  readonly writeResults: readonly WriteSmokeResult[];
}

export async function runActionSmokeWriteMode(
  fixtures: readonly ActionSmokeFixture[],
  options: RunWriteSmokeBatchOptions,
  deps: WriteHarnessDeps,
): Promise<WriteSmokeBatchResult> {
  const selected = options.providerFilter
    ? fixtures.filter((f) => f.provider === options.providerFilter)
    : fixtures;

  const writeResults: WriteSmokeResult[] = [];
  const smokeResults = [];
  for (const fixture of selected) {
    const result = await runWriteSmoke(
      fixture,
      {
        allowWrite: options.allowWrite,
        allowDestructive: options.allowDestructive,
        dryRun: options.dryRun,
        runToken: options.runToken,
        envLookup: options.envLookup,
      },
      deps,
    );
    writeResults.push(result);
    smokeResults.push(foldToSmokeResult(fixture, result));
  }

  return { report: buildExecutionReport(smokeResults, "workflow-live"), writeResults };
}
