/**
 * @jest-environment node
 *
 * Action smoke harness — LIVE-connected workflow mode safety (fake DB/engine).
 *
 * Live mode runs a real provider handler, so its safety rails are the most
 * important code in the harness. These tests pin them WITHOUT a real DB:
 *   - only liveSafe fixtures run; everything else SKIPs (before any DB write),
 *   - destructive needs BOTH includeDestructive AND allowDestructive,
 *   - missing env SKIPs before workflow creation,
 *   - results are tagged providerBoundary "live" (vs "blocked" in test mode),
 *   - no token/secret-shaped text survives into the serialized report.
 */
import { renderExecutionJson } from "@/scripts/chainreact/smoke/core";
import { defineActionSmokeFixture, type ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { runActionSmokeWorkflowMode } from "@/tests/smoke-actions/harness";
import {
  runFixtureWorkflowMode,
  type SmokeManualRunWorkflow,
  type SmokePersistedRun,
  type WorkflowRunDeps,
} from "@/tests/smoke-actions/workflowRun";

const liveReadFixture = (over: Partial<ActionSmokeFixture> = {}): ActionSmokeFixture =>
  defineActionSmokeFixture({
    provider: "slack",
    action: "list_channels",
    risk: "read",
    liveSafe: true,
    config: { kind: "public" },
    requiredEnv: ["SMOKE_SLACK_CONNECTED"],
    expect: { outcome: "success" },
    ...over,
  });

function fakeDeps(run: SmokePersistedRun | null = { runId: "run-1", status: "succeeded", failureReason: null }) {
  const create = jest.fn<Promise<{ workflowId: string }>, [SmokeManualRunWorkflow]>(
    async () => ({ workflowId: "wf-1" }),
  );
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

const liveWriteFixture = (over: Partial<ActionSmokeFixture> = {}): ActionSmokeFixture =>
  defineActionSmokeFixture({
    provider: "slack",
    action: "send_channel_message",
    risk: "write",
    liveSafe: true,
    liveRisk: "write",
    config: { text: "smoke (run {{trigger.eventId}})" },
    configFromEnv: { channel: "SMOKE_SLACK_CHANNEL_ID" },
    requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID"],
    expect: { outcome: "success" },
    ...over,
  });

const envWith = (present: Record<string, string>) => (n: string): string | undefined => present[n];
const noEnv = (_: string): string | undefined => undefined;

describe("live mode: liveSafe gate", () => {
  it("runs a liveSafe fixture when its env is present, tagged providerBoundary=live", async () => {
    const { deps, create, runManual } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      liveReadFixture(),
      { includeDestructive: false, live: true },
      deps,
      envWith({ SMOKE_SLACK_CONNECTED: "1" }),
    );
    expect(result.outcome).toBe("pass");
    expect(result.providerBoundary).toBe("live");
    expect(create).toHaveBeenCalledTimes(1);
    expect(runManual).toHaveBeenCalledWith(expect.objectContaining({ live: true }));
  });

  it("SKIPs a non-liveSafe fixture in live mode, before creating any workflow", async () => {
    const { deps, create } = fakeDeps();
    const fixture = liveReadFixture({ liveSafe: false, requiredEnv: [] });
    const result = await runFixtureWorkflowMode(fixture, { includeDestructive: false, live: true }, deps, noEnv);
    expect(result.outcome).toBe("skip");
    expect(result.reason).toMatch(/not marked liveSafe/);
    expect(result.providerBoundary).toBe("live");
    expect(create).not.toHaveBeenCalled();
  });

  it("SKIPs (not FAILs) a liveSafe fixture when its env is missing, before creating a workflow", async () => {
    const { deps, create } = fakeDeps();
    const result = await runFixtureWorkflowMode(liveReadFixture(), { includeDestructive: false, live: true }, deps, noEnv);
    expect(result.outcome).toBe("skip");
    expect(result.reason).toMatch(/missing env: SMOKE_SLACK_CONNECTED/);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("live mode: destructive double opt-in", () => {
  const destructive = (): ActionSmokeFixture =>
    liveReadFixture({ action: "delete_message", risk: "destructive", requiredEnv: [] });

  it("SKIPs a destructive fixture with includeDestructive but WITHOUT allowDestructive", async () => {
    const { deps, create } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      destructive(),
      { includeDestructive: true, allowDestructive: false, live: true },
      deps,
      noEnv,
    );
    expect(result.outcome).toBe("skip");
    expect(result.reason).toMatch(/allowDestructive|ALLOW_DESTRUCTIVE_PROVIDER_SMOKE/);
    expect(create).not.toHaveBeenCalled();
  });

  it("SKIPs a destructive fixture with allowDestructive but WITHOUT includeDestructive", async () => {
    const { deps, create } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      destructive(),
      { includeDestructive: false, allowDestructive: true, live: true },
      deps,
      noEnv,
    );
    expect(result.outcome).toBe("skip");
    expect(create).not.toHaveBeenCalled();
  });

  it("RUNs a destructive (liveSafe) fixture only when BOTH opt-ins are present", async () => {
    const { deps, create } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      destructive(),
      { includeDestructive: true, allowDestructive: true, live: true },
      deps,
      noEnv,
    );
    expect(result.outcome).toBe("pass");
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("live mode: write gate (ALLOW_LIVE_PROVIDER_WRITE_SMOKE)", () => {
  const envFull = envWith({ SMOKE_SLACK_CONNECTED: "1", SMOKE_SLACK_CHANNEL_ID: "C0SMOKE" });

  it("SKIPs a write fixture without allowWrite, even when its env is present", async () => {
    const { deps, create } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      liveWriteFixture(),
      { includeDestructive: false, live: true, allowWrite: false },
      deps,
      envFull,
    );
    expect(result.outcome).toBe("skip");
    expect(result.reason).toMatch(/ALLOW_LIVE_PROVIDER_WRITE_SMOKE/);
    expect(result.liveRisk).toBe("write");
    expect(create).not.toHaveBeenCalled();
  });

  it("SKIPs a write fixture before creating a workflow when SMOKE_SLACK_CHANNEL_ID is missing", async () => {
    const { deps, create } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      liveWriteFixture(),
      { includeDestructive: false, live: true, allowWrite: true },
      deps,
      envWith({ SMOKE_SLACK_CONNECTED: "1" }), // no channel id
    );
    expect(result.outcome).toBe("skip");
    expect(result.reason).toMatch(/missing env: SMOKE_SLACK_CHANNEL_ID/);
    expect(create).not.toHaveBeenCalled();
  });

  it("RUNs a write fixture with allowWrite + env, overlaying the channel id from env onto config", async () => {
    const { deps, create } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      liveWriteFixture(),
      { includeDestructive: false, live: true, allowWrite: true },
      deps,
      envFull,
    );
    expect(result.outcome).toBe("pass");
    expect(result.liveRisk).toBe("write");
    const wf = create.mock.calls[0]?.[0] as SmokeManualRunWorkflow;
    const actionNode = wf.definition.nodes.find((n) => n.kind === "action");
    expect(actionNode?.config.channel).toBe("C0SMOKE");
  });

  it("does NOT require allowWrite for a read fixture in live mode", async () => {
    const { deps } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      liveReadFixture(),
      { includeDestructive: false, live: true, allowWrite: false },
      deps,
      envWith({ SMOKE_SLACK_CONNECTED: "1" }),
    );
    expect(result.outcome).toBe("pass");
    expect(result.liveRisk).toBe("read");
  });
});

describe("live mode: report shape + boundary", () => {
  it("tags the report mode workflow-live and every result providerBoundary=live", async () => {
    const { deps } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      [liveReadFixture(), liveReadFixture({ provider: "slack", action: "send_channel_message", risk: "write", liveSafe: false })],
      { live: true, includeDestructive: false },
      deps,
      envWith({ SMOKE_SLACK_CONNECTED: "1" }),
    );
    expect(report.mode).toBe("workflow-live");
    const json = JSON.parse(renderExecutionJson(report));
    expect(json.mode).toBe("workflow-live");
    expect(json.results.every((r: { providerBoundary: string }) => r.providerBoundary === "live")).toBe(true);
    // Live-risk classification is reported per result.
    const list = json.results.find((r: { action: string }) => r.action === "list_channels");
    expect(list.liveRisk).toBe("read");
    // The non-liveSafe write fixture is skipped even though its env is present.
    const send = json.results.find((r: { action: string }) => r.action === "send_channel_message");
    expect(send.outcome).toBe("skip");
    expect(send.liveRisk).toBe("write");
  });
});

describe("live mode: report serialization carries no secrets", () => {
  it("redacts token/URL-shaped text from a failed run's reason", async () => {
    // A failed run whose (already-humanized) reason somehow embedded a token +
    // signed URL — the harness must not let it reach the report verbatim.
    const leaky = `${["xoxb", "9999", "SECRETTOKENVALUE"].join("-")} see https://files.slack.com/x?t=SECRETSIGNATURE0000000000`;
    const { deps } = fakeDeps({ runId: "run-x", status: "failed", failureReason: leaky });
    const report = await runActionSmokeWorkflowMode(
      [liveReadFixture()],
      { live: true, includeDestructive: false },
      deps,
      envWith({ SMOKE_SLACK_CONNECTED: "1" }),
    );
    const serialized = renderExecutionJson(report);
    expect(serialized).not.toMatch(new RegExp(["xoxb", "9999"].join("-")));
    expect(serialized).not.toMatch(/SECRETTOKENVALUE/);
    expect(serialized).not.toMatch(/SECRETSIGNATURE/);
    expect(serialized).not.toMatch(/files\.slack\.com/);
    expect(serialized).toMatch(/redacted/);
  });
});
