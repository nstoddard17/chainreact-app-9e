/**
 * @jest-environment node
 *
 * Unit tests for the scheduled-trigger smoke ORCHESTRATOR (pure, fakes for every
 * seam). Proves the baseline-first invariant + fire-once + terminal + cleanup
 * logic deterministically, with no DB / engine / cron.
 */
import {
  buildScheduledSmokeDefinition,
  runScheduledTriggerSmoke,
  SCHEDULED_SMOKE_TRIGGER_NODE_ID,
  SCHEDULED_SMOKE_ACTION_NODE_ID,
  type ScheduledSmokeDeps,
  type ScheduledSmokeRun,
} from "@/tests/trigger-smoke/scheduledSmoke";
import { TRIGGER_CERTIFICATIONS } from "@/tests/trigger-smoke/triggerCertificationSeed";

const NEXT_FIRE_MS = 1_900_000_060_000; // arbitrary fixed epoch ms

/**
 * A fake deps factory modeling the real timeline: runs appear for THIS workflow
 * only when the orchestrator is driven at now >= nextFireAt, exactly once.
 */
function makeFakeDeps(overrides: Partial<ScheduledSmokeDeps> = {}): {
  deps: ScheduledSmokeDeps;
  calls: { orchestrator: number[]; drained: string[]; cleaned: string[] };
} {
  const calls = { orchestrator: [] as number[], drained: [] as string[], cleaned: [] as string[] };
  let runs: ScheduledSmokeRun[] = [];

  const deps: ScheduledSmokeDeps = {
    async createActiveSmokeWorkflow() {
      return { workflowId: "wf-smoke" };
    },
    async armScheduledTrigger() {
      return { nextFireAtMs: NEXT_FIRE_MS };
    },
    async countOtherDueScheduled() {
      return 0;
    },
    async runOrchestrator(nowMs) {
      calls.orchestrator.push(nowMs);
      // Fire exactly once when driven at-or-after nextFireAt.
      if (nowMs >= NEXT_FIRE_MS && runs.length === 0) {
        runs = [{ runId: "run-1", status: "queued" }];
      }
      return { fired: runs.length };
    },
    async listRuns() {
      return runs;
    },
    async drainRun(runId) {
      calls.drained.push(runId);
      runs = runs.map((r) => (r.runId === runId ? { ...r, status: "succeeded" } : r));
    },
    async readRun(runId) {
      return runs.find((r) => r.runId === runId) ?? null;
    },
    async cleanup(workflowId) {
      calls.cleaned.push(workflowId);
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("buildScheduledSmokeDefinition", () => {
  it("builds a schedule.fired trigger wired to a single native no-op action", () => {
    const wf = buildScheduledSmokeDefinition();
    expect(wf.triggerNodeId).toBe(SCHEDULED_SMOKE_TRIGGER_NODE_ID);
    expect(wf.actionNodeId).toBe(SCHEDULED_SMOKE_ACTION_NODE_ID);
    const trigger = wf.definition.nodes.find((n) => n.kind === "trigger")!;
    expect(trigger.provider).toBe("native");
    expect(trigger.type).toBe("schedule.fired");
    expect((trigger.config as { cronExpression?: string }).cronExpression).toBe("* * * * *");
    const action = wf.definition.nodes.find((n) => n.kind === "action")!;
    expect(action.provider).toBe("native");
    expect(action.type).toBe("if_then_condition");
  });
});

describe("runScheduledTriggerSmoke — happy path", () => {
  it("passes: baseline 0, after 1, terminal succeeded, cleaned", async () => {
    const { deps, calls } = makeFakeDeps();
    const r = await runScheduledTriggerSmoke(deps);
    expect(r.outcome).toBe("pass");
    expect(r.baselineRunCount).toBe(0);
    expect(r.afterRunCount).toBe(1);
    expect(r.terminalStatus).toBe("succeeded");
    expect(r.cleaned).toBe(true);
    // Driven twice: once before (NEXT-60s), once at nextFireAt.
    expect(calls.orchestrator).toEqual([NEXT_FIRE_MS - 60_000, NEXT_FIRE_MS]);
    expect(calls.drained).toEqual(["run-1"]);
    expect(calls.cleaned).toEqual(["wf-smoke"]);
  });
});

describe("runScheduledTriggerSmoke — baseline-first invariant", () => {
  it("fails if a run fires BEFORE nextFireAt (baseline violation), and still cleans up", async () => {
    // Orchestrator that wrongly fires on the FIRST (before) tick.
    let runs: ScheduledSmokeRun[] = [];
    const { deps, calls } = makeFakeDeps({
      async runOrchestrator() {
        if (runs.length === 0) runs = [{ runId: "early", status: "queued" }];
        return { fired: runs.length };
      },
      async listRuns() {
        return runs;
      },
    });
    const r = await runScheduledTriggerSmoke(deps);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline violation/);
    expect(r.baselineRunCount).toBe(1);
    expect(r.cleaned).toBe(true);
    expect(calls.cleaned).toEqual(["wf-smoke"]);
  });
});

describe("runScheduledTriggerSmoke — safety + failure modes", () => {
  it("SKIPS (does not drive the global orchestrator) when other scheduled rows are due", async () => {
    const { deps, calls } = makeFakeDeps({
      async countOtherDueScheduled() {
        return 3;
      },
    });
    const r = await runScheduledTriggerSmoke(deps);
    expect(r.outcome).toBe("skip");
    expect(r.reason).toMatch(/unsafe to drive live: 3 other/);
    // Never drove the orchestrator.
    expect(calls.orchestrator).toEqual([]);
    // Still cleaned up the created workflow.
    expect(r.cleaned).toBe(true);
  });

  it("fails when the fired run never reaches terminal succeeded", async () => {
    let runs: ScheduledSmokeRun[] = [];
    const { deps } = makeFakeDeps({
      async runOrchestrator(nowMs) {
        if (nowMs >= NEXT_FIRE_MS && runs.length === 0) runs = [{ runId: "r", status: "queued" }];
        return { fired: runs.length };
      },
      async listRuns() {
        return runs;
      },
      async drainRun() {
        // drain fails to advance — stays queued.
      },
      async readRun(runId) {
        return { runId, status: "queued" };
      },
    });
    const r = await runScheduledTriggerSmoke(deps);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not reach terminal 'succeeded'/);
  });

  it("fails AND cleans up when arming throws after the workflow is created", async () => {
    const { deps, calls } = makeFakeDeps({
      async armScheduledTrigger() {
        throw new Error("arming boom");
      },
    });
    const r = await runScheduledTriggerSmoke(deps);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toBe("arming boom");
    expect(calls.cleaned).toEqual(["wf-smoke"]); // cleanup ran despite the throw
  });
});

describe("trigger certification seed", () => {
  it("classifies manual.run as RUN_NOW_PROVEN (not a dispatch cert)", () => {
    const manual = TRIGGER_CERTIFICATIONS.find((c) => c.type === "manual.run");
    expect(manual?.status).toBe("RUN_NOW_PROVEN");
  });
  it("has a single row per trigger key and only LIVE_PASS rows carry a date when certified", () => {
    const keys = TRIGGER_CERTIFICATIONS.map((c) => `${c.provider}:${c.type}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of TRIGGER_CERTIFICATIONS) {
      if (c.status === "LIVE_PASS") expect(typeof c.date).toBe("string");
    }
  });
});
