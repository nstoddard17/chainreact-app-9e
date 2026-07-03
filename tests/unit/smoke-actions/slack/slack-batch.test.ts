/**
 * @jest-environment node
 *
 * Action smoke harness — Slack read-only coverage batch (SMOKE-ACTIONS-6).
 *
 * Pins the new Slack read fixtures WITHOUT a real DB/provider:
 *   - each is read-only + liveSafe,
 *   - each env-dependent fixture SKIPs before any workflow is created when its env
 *     is missing,
 *   - a read fixture runs in live mode without the write gate,
 *   - the provider filter narrows to Slack.
 */
import { effectiveLiveRisk } from "@/tests/smoke-actions/contract";
import { ALL_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runActionSmokeWorkflowMode } from "@/tests/smoke-actions/harness";
import {
  runFixtureWorkflowMode,
  type SmokeManualRunWorkflow,
  type WorkflowRunDeps,
} from "@/tests/smoke-actions/workflowRun";

const NEW_SLACK_KEYS = [
  "slack:get_user_info",
  "slack:get_messages",
  "slack:list_scheduled_messages",
  "slack:get_thread_messages",
  "slack:get_file_info",
] as const;

function fakeDeps() {
  const create = jest.fn<Promise<{ workflowId: string }>, [SmokeManualRunWorkflow]>(
    async () => ({ workflowId: "wf-1" }),
  );
  const deps: WorkflowRunDeps = {
    createSmokeWorkflow: create,
    runManualAndAwait: jest.fn(async () => ({ runId: "run-1" })),
    readRun: jest.fn(async () => ({ runId: "run-1", status: "succeeded" as const, failureReason: null })),
    cleanupSmokeWorkflow: jest.fn(async () => {}),
  };
  return { deps, create };
}

const noEnv = (_: string): string | undefined => undefined;
const envWith = (present: Record<string, string>) => (n: string): string | undefined => present[n];
const fixtureFor = (key: string) =>
  ALL_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

describe("Slack batch: shape", () => {
  it("ships 5 new Slack read fixtures, all read + liveSafe", () => {
    for (const key of NEW_SLACK_KEYS) {
      const f = fixtureFor(key);
      expect(f).toBeDefined();
      expect(f.provider).toBe("slack");
      expect(f.risk).toBe("read");
      expect(effectiveLiveRisk(f)).toBe("read");
      expect(f.liveSafe).toBe(true);
    }
  });
});

describe("Slack batch: missing env SKIPs before workflow creation", () => {
  it.each(NEW_SLACK_KEYS)("%s skips (no create) when its env is missing", async (key) => {
    const { deps, create } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      fixtureFor(key),
      { includeDestructive: false, live: true },
      deps,
      noEnv,
    );
    expect(result.outcome).toBe("skip");
    expect(result.reason).toMatch(/missing env/);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("Slack batch: read fixtures need no write gate", () => {
  it("runs slack:list_scheduled_messages in live mode with allowWrite false (connection only)", async () => {
    const { deps, create } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      fixtureFor("slack:list_scheduled_messages"),
      { includeDestructive: false, live: true, allowWrite: false },
      deps,
      envWith({ SMOKE_SLACK_CONNECTED: "1" }),
    );
    expect(result.outcome).toBe("pass");
    expect(result.liveRisk).toBe("read");
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("Slack batch: provider filter", () => {
  it("includes the new read fixtures when filtering to slack", async () => {
    const { deps } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      ALL_SMOKE_FIXTURES,
      { live: true, includeDestructive: false, providerFilter: "slack" },
      deps,
      noEnv,
    );
    expect(report.results.every((r) => r.provider === "slack")).toBe(true);
    const actions = new Set(report.results.map((r) => r.action));
    for (const key of NEW_SLACK_KEYS) {
      expect(actions.has(key.split(":")[1] as string)).toBe(true);
    }
  });
});
