/**
 * @jest-environment node
 *
 * Action smoke harness — full workflow-run mode (fake DB/engine boundary).
 *
 * Proves the workflow-mode rule without a real DB: the manual-run workflow shape,
 * terminal-state -> PASS/FAIL mapping, that missing env SKIPs BEFORE any workflow
 * is created, that destructive stays gated, cleanup always runs, and the JSON
 * carries mode + workflow id + run id + status + reason. The engine/DB seams are
 * faked (the rule under test is the orchestration, not Supabase).
 */
import { renderExecutionJson } from "@/scripts/chainreact/smoke/core";
import { defineActionSmokeFixture, type ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { runActionSmoke, runActionSmokeWorkflowMode } from "@/tests/smoke-actions/harness";
import {
  buildSmokeManualRunDefinition,
  runFixtureWorkflowMode,
  type SmokePersistedRun,
  type WorkflowRunDeps,
} from "@/tests/smoke-actions/workflowRun";

const nativeFixture = (over: Partial<ActionSmokeFixture> = {}): ActionSmokeFixture =>
  defineActionSmokeFixture({
    provider: "native",
    action: "format_transformer",
    risk: "read",
    config: { content: "**hi**", sourceFormat: "markdown", targetFormat: "html" },
    expect: { outcome: "success" },
    ...over,
  });

function fakeDeps(run: SmokePersistedRun | null = { runId: "run-1", status: "succeeded", failureReason: null }) {
  const create = jest.fn(async () => ({ workflowId: "wf-1" }));
  const runManual = jest.fn(async () => ({ runId: "run-1" }));
  const readRun = jest.fn(async () => run);
  const cleanup = jest.fn(async () => {});
  const deps: WorkflowRunDeps = {
    createSmokeWorkflow: create,
    runManualAndAwait: runManual,
    readRun,
    cleanupSmokeWorkflow: cleanup,
  };
  return { deps, create, runManual, readRun, cleanup };
}

const noEnv = (_: string): string | undefined => undefined;

describe("buildSmokeManualRunDefinition", () => {
  it("builds a valid {native:manual.run trigger -> fixture action} workflow", () => {
    const wf = buildSmokeManualRunDefinition(nativeFixture());
    const trigger = wf.definition.nodes.find((n) => n.kind === "trigger");
    const action = wf.definition.nodes.find((n) => n.kind === "action");
    expect(trigger).toMatchObject({ provider: "native", type: "manual.run", id: wf.triggerNodeId });
    expect(action).toMatchObject({ provider: "native", type: "format_transformer", id: wf.actionNodeId });
    expect(wf.definition.edges).toEqual([
      { id: "smoke-edge", from: wf.triggerNodeId, to: wf.actionNodeId },
    ]);
    expect(wf.definition.nodes.filter((n) => n.kind === "trigger")).toHaveLength(1);
    expect(wf.name).toBe("smoke:native:format_transformer");
  });

  it("carries the fixture config onto the action node verbatim", () => {
    const wf = buildSmokeManualRunDefinition(nativeFixture({ config: { content: "x", targetFormat: "plain" } }));
    const action = wf.definition.nodes.find((n) => n.kind === "action");
    expect(action?.config).toEqual({ content: "x", targetFormat: "plain" });
  });
});

describe("runFixtureWorkflowMode: terminal-state classification", () => {
  it("PASSes on a persisted succeeded run, returning workflow id + run id, and cleans up", async () => {
    const { deps, create, cleanup } = fakeDeps();
    const result = await runFixtureWorkflowMode(nativeFixture(), { includeDestructive: false }, deps, noEnv);
    expect(result.outcome).toBe("pass");
    expect(result.workflowId).toBe("wf-1");
    expect(result.runId).toBe("run-1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith("wf-1");
  });

  it("FAILs on a persisted failed run, surfacing the safe reason + run id", async () => {
    const { deps } = fakeDeps({ runId: "run-9", status: "failed", failureReason: "Action needs setup" });
    const result = await runFixtureWorkflowMode(nativeFixture(), { includeDestructive: false }, deps, noEnv);
    expect(result.outcome).toBe("fail");
    expect(result.reason).toBe("Action needs setup");
    expect(result.runId).toBe("run-9");
    expect(result.workflowId).toBe("wf-1");
  });

  it("PASSes when a failure was expected and the run failed", async () => {
    const { deps } = fakeDeps({ runId: "run-2", status: "failed", failureReason: "boom" });
    const fixture = nativeFixture({ expect: { outcome: "failure" } });
    const result = await runFixtureWorkflowMode(fixture, { includeDestructive: false }, deps, noEnv);
    expect(result.outcome).toBe("pass");
  });

  it("FAILs when the run never reaches a terminal state", async () => {
    const { deps, cleanup } = fakeDeps({ runId: "run-3", status: "running", failureReason: null });
    const result = await runFixtureWorkflowMode(nativeFixture(), { includeDestructive: false }, deps, noEnv);
    expect(result.outcome).toBe("fail");
    expect(result.reason).toMatch(/did not reach a terminal/);
    expect(cleanup).toHaveBeenCalledTimes(1); // still cleans up
  });
});

describe("runFixtureWorkflowMode: safety gates happen before any DB write", () => {
  it("SKIPs (not FAILs) on missing env and never creates a workflow", async () => {
    const { deps, create, runManual, cleanup } = fakeDeps();
    const fixture = nativeFixture({ requiredEnv: ["SMOKE_SLACK_CONNECTED"] });
    const result = await runFixtureWorkflowMode(fixture, { includeDestructive: false }, deps, noEnv);
    expect(result.outcome).toBe("skip");
    expect(result.reason).toMatch(/missing env: SMOKE_SLACK_CONNECTED/);
    expect(create).not.toHaveBeenCalled();
    expect(runManual).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("SKIPs a destructive fixture without includeDestructive and never creates a workflow", async () => {
    const { deps, create } = fakeDeps();
    const fixture = nativeFixture({ action: "delete_message", risk: "destructive" });
    const result = await runFixtureWorkflowMode(fixture, { includeDestructive: false }, deps, noEnv);
    expect(result.outcome).toBe("skip");
    expect(result.reason).toMatch(/destructive/);
    expect(create).not.toHaveBeenCalled();
  });

  it("RUNs a destructive fixture once includeDestructive is set", async () => {
    const { deps, create } = fakeDeps();
    const fixture = nativeFixture({ action: "delete_message", risk: "destructive" });
    const result = await runFixtureWorkflowMode(fixture, { includeDestructive: true }, deps, noEnv);
    expect(result.outcome).toBe("pass");
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("runActionSmokeWorkflowMode: report + JSON shape", () => {
  it("emits mode=workflow and per-result workflow id, run id, status, reason in JSON", async () => {
    const { deps } = fakeDeps({ runId: "run-1", status: "succeeded", failureReason: null });
    const report = await runActionSmokeWorkflowMode([nativeFixture()], { includeDestructive: false }, deps, noEnv);
    expect(report.mode).toBe("workflow");

    const json = JSON.parse(renderExecutionJson(report));
    expect(json.kind).toBe("execution");
    expect(json.mode).toBe("workflow");
    const row = json.results[0];
    expect(row).toMatchObject({
      provider: "native",
      action: "format_transformer",
      outcome: "pass",
      runId: "run-1",
      workflowId: "wf-1",
      reason: null,
    });
  });

  it("applies the provider filter", async () => {
    const { deps, create } = fakeDeps();
    const fixtures = [nativeFixture(), nativeFixture({ provider: "slack", action: "list_channels" })];
    const report = await runActionSmokeWorkflowMode(fixtures, { providerFilter: "native" }, deps, noEnv);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.provider).toBe("native");
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("handler-dispatch mode still works (regression)", () => {
  it("runActionSmoke reports mode=handler and passes the native fixture via the real resolver+registry", async () => {
    const report = await runActionSmoke([nativeFixture()], { includeDestructive: false });
    expect(report.mode).toBe("handler");
    expect(report.totals.fail).toBe(0);
    expect(report.results[0]?.outcome).toBe("pass");
  });
});
