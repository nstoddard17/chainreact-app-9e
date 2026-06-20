/**
 * @jest-environment node
 *
 * Action smoke harness — read-only coverage batch (SMOKE-ACTIONS-5).
 *
 * Pins the behavior of the new read-only fixtures WITHOUT a real DB/provider:
 *   - each provider-env fixture SKIPs before any workflow is created when its env
 *     is missing,
 *   - a provider filter narrows the run to that provider,
 *   - a liveSafe READ fixture runs in live mode without the write gate,
 *   - the new fixtures are all read-only + liveSafe.
 */
import { effectiveLiveRisk } from "@/tests/smoke-actions/contract";
import { ALL_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runActionSmokeWorkflowMode } from "@/tests/smoke-actions/harness";
import {
  runFixtureWorkflowMode,
  type SmokeManualRunWorkflow,
  type WorkflowRunDeps,
} from "@/tests/smoke-actions/workflowRun";

const NEW_READ_KEYS = [
  "slack:list_users",
  "slack:get_channel_info",
  "airtable:get_base_schema",
  "google-sheets:get_sheet_metadata",
  "google-drive:list_files",
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

describe("read-only batch: shape", () => {
  it("ships the 5 new read-only fixtures, all liveRisk read + liveSafe", () => {
    for (const key of NEW_READ_KEYS) {
      const f = fixtureFor(key);
      expect(f).toBeDefined();
      expect(f.risk).toBe("read");
      expect(effectiveLiveRisk(f)).toBe("read");
      expect(f.liveSafe).toBe(true);
    }
  });
});

describe("read-only batch: missing provider env SKIPs before workflow creation", () => {
  it.each(NEW_READ_KEYS)("%s skips (no create) when its env is missing", async (key) => {
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

describe("read-only batch: provider filter", () => {
  it("runs only the selected provider's fixtures", async () => {
    const { deps } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      ALL_SMOKE_FIXTURES,
      { live: true, includeDestructive: false },
      deps,
      noEnv,
    );
    const airtableOnly = await runActionSmokeWorkflowMode(
      ALL_SMOKE_FIXTURES,
      { live: true, includeDestructive: false, providerFilter: "airtable" },
      deps,
      noEnv,
    );
    expect(report.results.length).toBeGreaterThan(airtableOnly.results.length);
    expect(airtableOnly.results.every((r) => r.provider === "airtable")).toBe(true);
    expect(airtableOnly.results.some((r) => r.action === "get_base_schema")).toBe(true);
  });
});

describe("read-only batch: liveSafe read needs no write gate", () => {
  it("runs slack:list_users in live mode with allowWrite false (env present)", async () => {
    const { deps, create } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      fixtureFor("slack:list_users"),
      { includeDestructive: false, live: true, allowWrite: false },
      deps,
      envWith({ SMOKE_SLACK_CONNECTED: "1" }),
    );
    expect(result.outcome).toBe("pass");
    expect(result.liveRisk).toBe("read");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
