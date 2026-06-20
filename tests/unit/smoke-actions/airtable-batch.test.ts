/**
 * @jest-environment node
 *
 * Action smoke harness — Airtable read-only coverage batch (SMOKE-ACTIONS-7).
 *
 * Pins the new Airtable read fixtures WITHOUT a real DB/provider:
 *   - each is read-only + liveSafe,
 *   - each SKIPs before any workflow is created when its env is missing,
 *   - a read fixture runs in live mode without the write gate (env present),
 *   - the provider filter narrows to Airtable.
 */
import { effectiveLiveRisk } from "@/tests/smoke-actions/contract";
import { ALL_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runActionSmokeWorkflowMode } from "@/tests/smoke-actions/harness";
import {
  runFixtureWorkflowMode,
  type SmokeManualRunWorkflow,
  type WorkflowRunDeps,
} from "@/tests/smoke-actions/workflowRun";

const NEW_AIRTABLE_KEYS = [
  "airtable:get_table_schema",
  "airtable:list_records",
  "airtable:find_record",
  "airtable:get_record",
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

describe("Airtable batch: shape", () => {
  it("ships 4 new Airtable read fixtures, all read + liveSafe", () => {
    for (const key of NEW_AIRTABLE_KEYS) {
      const f = fixtureFor(key);
      expect(f).toBeDefined();
      expect(f.provider).toBe("airtable");
      expect(f.risk).toBe("read");
      expect(effectiveLiveRisk(f)).toBe("read");
      expect(f.liveSafe).toBe(true);
    }
  });
});

describe("Airtable batch: missing env SKIPs before workflow creation", () => {
  it.each(NEW_AIRTABLE_KEYS)("%s skips (no create) when its env is missing", async (key) => {
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

describe("Airtable batch: read fixtures need no write gate", () => {
  it("runs airtable:list_records in live mode with allowWrite false (base + table env)", async () => {
    const { deps, create } = fakeDeps();
    const result = await runFixtureWorkflowMode(
      fixtureFor("airtable:list_records"),
      { includeDestructive: false, live: true, allowWrite: false },
      deps,
      envWith({
        SMOKE_AIRTABLE_CONNECTED: "1",
        SMOKE_AIRTABLE_BASE_ID: "appSMOKE",
        SMOKE_AIRTABLE_TABLE_ID: "tblSMOKE",
      }),
    );
    expect(result.outcome).toBe("pass");
    expect(result.liveRisk).toBe("read");
    expect(create).toHaveBeenCalledTimes(1);
    // The base/table ids are overlaid from env onto the action node config.
    const wf = create.mock.calls[0]?.[0] as SmokeManualRunWorkflow;
    const actionNode = wf.definition.nodes.find((n) => n.kind === "action");
    expect(actionNode?.config.baseId).toBe("appSMOKE");
    expect(actionNode?.config.tableIdOrName).toBe("tblSMOKE");
  });
});

describe("Airtable batch: provider filter", () => {
  it("includes the new read fixtures when filtering to airtable", async () => {
    const { deps } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      ALL_SMOKE_FIXTURES,
      { live: true, includeDestructive: false, providerFilter: "airtable" },
      deps,
      noEnv,
    );
    expect(report.results.every((r) => r.provider === "airtable")).toBe(true);
    const actions = new Set(report.results.map((r) => r.action));
    for (const key of NEW_AIRTABLE_KEYS) {
      expect(actions.has(key.split(":")[1] as string)).toBe(true);
    }
  });
});
