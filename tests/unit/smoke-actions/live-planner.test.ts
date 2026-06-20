/**
 * @jest-environment node
 *
 * Live-run CERTIFICATION planner — does NOT re-run already-passed actions.
 *
 * Business rules protected (req: "do not repeat actions that have passed"):
 *   - a certified LIVE_PASS action is CERTIFIED-SKIPPED by default (never reaches
 *     the engine — `create` is not called),
 *   - SMOKE_RERUN_PASSED (rerunPassed) re-runs it for a full sweep,
 *   - certified-skip is reported SEPARATELY from a missing-env skip,
 *   - the provider filter composes with the planner,
 *   - the planner NEVER makes an uncertified / destructive / write action run
 *     (it only skips) — live gates are untouched,
 *   - JSON output is additive (totals.certifiedSkip + rerunPassed + the new
 *     outcome),
 *   - the planner is OFF unless explicitly enabled (harness-mechanics callers
 *     are unaffected).
 */
import { renderExecutionJson } from "@/scripts/chainreact/smoke/core";
import { defineActionSmokeFixture, type ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { runActionSmokeWorkflowMode } from "@/tests/smoke-actions/harness";
import type {
  SmokeManualRunWorkflow,
  SmokePersistedRun,
  WorkflowRunDeps,
} from "@/tests/smoke-actions/workflowRun";

function fakeDeps(run: SmokePersistedRun | null = { runId: "run-1", status: "succeeded", failureReason: null }) {
  const create = jest.fn<Promise<{ workflowId: string }>, [SmokeManualRunWorkflow]>(async () => ({
    workflowId: "wf-1",
  }));
  const runManual = jest.fn(async () => ({ runId: "run-1" }));
  const readRun = jest.fn(async () => run);
  const cleanup = jest.fn(async () => {});
  const deps: WorkflowRunDeps = {
    createSmokeWorkflow: create,
    runManualAndAwait: runManual,
    readRun,
    cleanupSmokeWorkflow: cleanup,
  };
  return { deps, create };
}

const read = (provider: string, action: string, over: Partial<ActionSmokeFixture> = {}): ActionSmokeFixture =>
  defineActionSmokeFixture({
    provider,
    action,
    risk: "read",
    liveSafe: true,
    config: {},
    expect: { outcome: "success" },
    ...over,
  });

const allEnv = (): string | undefined => "1";

// Treat only this one key as certified for deterministic tests.
const certify = (...keys: string[]) => (p: string, a: string) => keys.includes(`${p}:${a}`);

describe("default planner: do not re-run passed actions", () => {
  it("CERTIFIED-SKIPs a LIVE_PASS action by default — the engine is never called", async () => {
    const { deps, create } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      [read("slack", "list_channels")],
      { live: true, applyCertificationPlanner: true, isCertifiedLivePass: certify("slack:list_channels") },
      deps,
      allEnv,
    );
    const r = report.results.find((x) => x.action === "list_channels");
    expect(r?.outcome).toBe("certified-skip");
    expect(r?.providerBoundary).toBe("live");
    expect(report.totals.certifiedSkip).toBe(1);
    expect(report.totals.pass).toBe(0);
    expect(create).not.toHaveBeenCalled(); // never reached the engine → no provider call / no task
  });

  it("rerunPassed re-runs the LIVE_PASS action (full regression sweep)", async () => {
    const { deps, create } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      [read("slack", "list_channels")],
      {
        live: true,
        applyCertificationPlanner: true,
        rerunPassed: true,
        isCertifiedLivePass: certify("slack:list_channels"),
      },
      deps,
      allEnv,
    );
    const r = report.results.find((x) => x.action === "list_channels");
    expect(r?.outcome).toBe("pass");
    expect(report.totals.certifiedSkip).toBe(0);
    expect(report.rerunPassed).toBe(true); // makes the sweep obvious in the report
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("planner is OFF unless enabled — a LIVE_PASS action runs normally", async () => {
    const { deps, create } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      [read("slack", "list_channels")],
      { live: true, isCertifiedLivePass: certify("slack:list_channels") }, // applyCertificationPlanner omitted
      deps,
      allEnv,
    );
    expect(report.results[0]?.outcome).toBe("pass");
    expect(report.totals.certifiedSkip).toBe(0);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("certified-skip is distinct from missing-env skip", () => {
  it("separates a certified LIVE_PASS skip from an uncertified missing-env skip", async () => {
    const { deps } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      [
        read("slack", "list_channels"), // certified -> certified-skip
        read("notion", "search", { requiredEnv: ["SMOKE_NOTION_CONNECTED"] }), // uncertified, env missing -> skip
      ],
      { live: true, applyCertificationPlanner: true, isCertifiedLivePass: certify("slack:list_channels") },
      deps,
      () => undefined, // no env present
    );
    expect(report.totals.certifiedSkip).toBe(1);
    expect(report.totals.skip).toBe(1);
    // The certified action is NOT in the missing-env summary; only the uncertified one is.
    expect(report.missingEnv.map((e) => `${e.provider}:${e.action}`)).toEqual(["notion:search"]);
    const cert = report.results.find((r) => r.action === "list_channels");
    expect(cert?.outcome).toBe("certified-skip");
    expect(cert?.missingEnv).toBeUndefined();
  });
});

describe("provider filter composes with the planner", () => {
  it("runs only the filtered provider, and certified-skips its LIVE_PASS actions", async () => {
    const { deps, create } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      [read("slack", "list_channels"), read("slack", "list_users"), read("airtable", "list_records")],
      {
        live: true,
        providerFilter: "slack",
        applyCertificationPlanner: true,
        isCertifiedLivePass: certify("slack:list_channels"), // only list_channels certified
      },
      deps,
      allEnv,
    );
    expect(report.results.every((r) => r.provider === "slack")).toBe(true); // filter respected
    expect(report.results.find((r) => r.action === "list_channels")?.outcome).toBe("certified-skip");
    expect(report.results.find((r) => r.action === "list_users")?.outcome).toBe("pass"); // uncertified slack action runs
    expect(create).toHaveBeenCalledTimes(1); // only list_users reached the engine
  });
});

describe("planner never loosens a live gate", () => {
  it("does NOT run a destructive action just because it is uncertified", async () => {
    const { deps, create } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      [read("slack", "delete_message", { risk: "destructive", liveSafe: false })],
      {
        live: true,
        applyCertificationPlanner: true,
        includeDestructive: false,
        isCertifiedLivePass: () => false,
      },
      deps,
      allEnv,
    );
    expect(report.results[0]?.outcome).toBe("skip"); // destructive gate still blocks it
    expect(report.totals.certifiedSkip).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });

  it("a certified LIVE_PASS write action is skipped by default (no re-post)", async () => {
    const { deps, create } = fakeDeps();
    const write = read("slack", "send_channel_message", { risk: "write", liveRisk: "write" });
    const report = await runActionSmokeWorkflowMode(
      [write],
      {
        live: true,
        applyCertificationPlanner: true,
        allowWrite: true, // even with the write gate on, a certified write is not re-run by default
        isCertifiedLivePass: certify("slack:send_channel_message"),
      },
      deps,
      allEnv,
    );
    expect(report.results[0]?.outcome).toBe("certified-skip");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("JSON output is additive", () => {
  it("serializes rerunPassed + totals.certifiedSkip + the certified-skip outcome", async () => {
    const { deps } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      [read("slack", "list_channels")],
      { live: true, applyCertificationPlanner: true, isCertifiedLivePass: certify("slack:list_channels") },
      deps,
      allEnv,
    );
    const json = JSON.parse(renderExecutionJson(report));
    expect(json.rerunPassed).toBe(false);
    expect(json.totals.certifiedSkip).toBe(1);
    expect(json.totals.pass).toBe(0); // existing fields still present
    expect(json.results[0].outcome).toBe("certified-skip");
    expect(json.perProvider[0].certifiedSkip).toBe(1);
  });
});
