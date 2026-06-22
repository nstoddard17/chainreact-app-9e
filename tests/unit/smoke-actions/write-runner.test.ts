/**
 * @jest-environment node
 *
 * Write smoke batch runner — folds rich WriteSmokeResults into the shared
 * zero-FAIL ExecutionReport gate without changing read/native behavior.
 *
 * Business rules protected:
 *   - a CLEANUP_FAILED / VERIFY_FAILED write result flips the gate to FAILED,
 *   - providerFilter narrows the batch,
 *   - dryRun calls no provider seam.
 */
import type { ActionSmokeFixture, WriteHarnessSpec } from "@/tests/smoke-actions/contract";
import type { StepRunOutcome, WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";
import { runActionSmokeWriteMode } from "@/tests/smoke-actions/writeRunner";

function fakeDeps(plan: Record<string, StepRunOutcome> = {}): WriteHarnessDeps & {
  calls: { provider: string; action: string }[];
} {
  const calls: { provider: string; action: string }[] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action });
      return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
    },
  };
}

function fx(provider: string, action: string, writeHarness: WriteHarnessSpec): ActionSmokeFixture {
  return { provider, action, risk: "write", config: {}, expect: { outcome: "success" }, writeHarness };
}

const destructive: WriteHarnessSpec = {
  liveClass: "destructiveSafe",
  smokeMarker: "crsmoke-",
  captureResource: { resourceKey: "r", idPath: "id", kind: "thing" },
  cleanup: { provider: "p", action: "delete_thing", config: { id: "{{ledger.r.id}}" } },
};

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;

describe("runActionSmokeWriteMode", () => {
  it("folds a CLEANUP_FAILED into a FAILED gate (mode workflow-live)", async () => {
    const deps = fakeDeps({
      "alpha:run": { ok: true, output: { id: "A" }, reason: null },
      "alpha:delete_thing": { ok: false, output: null, reason: "delete failed" }, // cleanup fails
      "beta:run": { ok: true, output: { id: "B" }, reason: null },
      "beta:delete_thing": { ok: true, output: null, reason: null },
    });
    const fixtures = [
      fx("alpha", "run", { ...destructive, cleanup: { provider: "alpha", action: "delete_thing", config: { id: "{{ledger.r.id}}" } } }),
      fx("beta", "run", { ...destructive, cleanup: { provider: "beta", action: "delete_thing", config: { id: "{{ledger.r.id}}" } } }),
    ];
    const { report, writeResults } = await runActionSmokeWriteMode(fixtures, RUN, deps);

    expect(report.mode).toBe("workflow-live");
    expect(report.ok).toBe(false); // CLEANUP_FAILED -> fail
    expect(writeResults.find((r) => r.provider === "alpha")?.status).toBe("CLEANUP_FAILED");
    expect(writeResults.find((r) => r.provider === "beta")?.status).toBe("PASS");
  });

  it("providerFilter narrows the batch", async () => {
    const deps = fakeDeps();
    const fixtures = [fx("alpha", "run", destructive), fx("beta", "run", destructive)];
    const { writeResults } = await runActionSmokeWriteMode(
      fixtures,
      { ...RUN, providerFilter: "alpha" },
      deps,
    );
    expect(writeResults).toHaveLength(1);
    expect(writeResults[0]!.provider).toBe("alpha");
  });

  it("dryRun calls no provider seam and reports a clean gate", async () => {
    const deps = fakeDeps();
    const fixtures = [fx("alpha", "run", destructive)];
    const { report } = await runActionSmokeWriteMode(fixtures, { ...RUN, dryRun: true }, deps);
    expect(deps.calls).toHaveLength(0);
    expect(report.ok).toBe(true); // all skipped
    expect(report.totals.skip).toBe(1);
  });
});
