/**
 * @jest-environment node
 *
 * Unit tests for the Excel polling-trigger smoke ORCHESTRATOR (pure, fakes for
 * every seam). Proves baseline-first (first poll fires 0) + fire-once + verifiable
 * payload + terminal + cleanup, with no DB / engine / provider.
 */
import {
  buildExcelNewWorksheetSmokeWorkflow,
  runExcelNewWorksheetSmoke,
  EXCEL_POLLING_SMOKE_TRIGGER_NODE_ID,
  EXCEL_POLLING_SMOKE_ACTION_NODE_ID,
  type ExcelPollingSmokeDeps,
  type ExcelPollingRun,
} from "@/tests/trigger-smoke/excelPollingSmoke";
import { TRIGGER_CERTIFICATIONS } from "@/tests/trigger-smoke/triggerCertificationSeed";

function makeFakeDeps(overrides: Partial<ExcelPollingSmokeDeps> = {}): {
  deps: ExcelPollingSmokeDeps;
  calls: { polls: number; cleaned: string[]; drained: string[] };
} {
  const calls = { polls: 0, cleaned: [] as string[], drained: [] as string[] };
  let addedName: string | null = null;
  let runs: ExcelPollingRun[] = [];

  const deps: ExcelPollingSmokeDeps = {
    async createSmokeWorkbook() {
      return { workbookId: "wb-smoke" };
    },
    async createActiveSmokeWorkflow() {
      return { workflowId: "wf-smoke" };
    },
    async armPollingTrigger() {
      return { snapshotNames: ["Sheet1"] };
    },
    async poll() {
      calls.polls += 1;
      // Real semantics: a run appears ONLY after a post-baseline change (addedName),
      // exactly once. The first poll (addedName null) fires nothing — baseline-first.
      if (addedName && runs.length === 0) {
        runs = [{ runId: "run-ws", status: "queued", triggerWorksheetName: addedName }];
      }
    },
    async addWorksheet() {
      addedName = "crsmokeabcd1234ws";
      return { worksheetName: addedName };
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
    async cleanup({ workflowId }) {
      calls.cleaned.push(workflowId);
    },
    async sleep() {
      /* instant in unit tests */
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("buildExcelNewWorksheetSmokeWorkflow", () => {
  it("wires a microsoft-excel:new_worksheet trigger (carrying workbookId) to a native no-op", () => {
    const wf = buildExcelNewWorksheetSmokeWorkflow("wb-123");
    expect(wf.triggerNodeId).toBe(EXCEL_POLLING_SMOKE_TRIGGER_NODE_ID);
    expect(wf.actionNodeId).toBe(EXCEL_POLLING_SMOKE_ACTION_NODE_ID);
    const trigger = wf.definition.nodes.find((n) => n.kind === "trigger")!;
    expect(trigger.provider).toBe("microsoft-excel");
    expect(trigger.type).toBe("new_worksheet");
    expect((trigger.config as { workbookId?: string }).workbookId).toBe("wb-123");
  });
});

describe("runExcelNewWorksheetSmoke — happy path", () => {
  it("passes: baseline 0, exactly 1 after the new worksheet, payload matches, terminal succeeded, cleaned", async () => {
    const { deps, calls } = makeFakeDeps();
    const r = await runExcelNewWorksheetSmoke(deps);
    expect(r.outcome).toBe("pass");
    expect(r.baselineRunCount).toBe(0);
    expect(r.afterRunCount).toBe(1);
    expect(r.firedWorksheetName).toBe(r.addedWorksheetName);
    expect(r.terminalStatus).toBe("succeeded");
    expect(r.cleaned).toBe(true);
    expect(calls.polls).toBe(2); // baseline + after-change
    expect(calls.drained).toEqual(["run-ws"]);
    expect(calls.cleaned).toEqual(["wf-smoke"]);
  });
});

describe("runExcelNewWorksheetSmoke — baseline-first invariant", () => {
  it("fails if the FIRST poll fires from pre-existing state, and still cleans up", async () => {
    let runs: ExcelPollingRun[] = [];
    const { deps, calls } = makeFakeDeps({
      async poll() {
        // Wrongly fires on the very first poll (no change applied yet).
        if (runs.length === 0) runs = [{ runId: "early", status: "queued", triggerWorksheetName: "Sheet1" }];
      },
      async listRuns() {
        return runs;
      },
    });
    const r = await runExcelNewWorksheetSmoke(deps);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline violation/);
    expect(r.baselineRunCount).toBe(1);
    expect(r.cleaned).toBe(true);
    expect(calls.cleaned).toEqual(["wf-smoke"]);
  });
});

describe("runExcelNewWorksheetSmoke — failure modes", () => {
  it("fails when the fired run's payload worksheet does not match the added one", async () => {
    let addedName: string | null = null;
    let runs: ExcelPollingRun[] = [];
    const { deps } = makeFakeDeps({
      async addWorksheet() {
        addedName = "crsmokeXXXXXws";
        return { worksheetName: addedName };
      },
      async poll() {
        if (addedName && runs.length === 0) {
          runs = [{ runId: "r", status: "queued", triggerWorksheetName: "some-other-sheet" }];
        }
      },
      async listRuns() {
        return runs;
      },
    });
    const r = await runExcelNewWorksheetSmoke(deps);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/payload worksheet/);
  });

  it("fails when activation seeds an empty snapshot", async () => {
    const { deps } = makeFakeDeps({
      async armPollingTrigger() {
        return { snapshotNames: [] };
      },
    });
    const r = await runExcelNewWorksheetSmoke(deps);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/empty worksheet snapshot/);
  });

  it("fails AND cleans up (workbook + workflow) when arming throws", async () => {
    const { deps, calls } = makeFakeDeps({
      async armPollingTrigger() {
        throw new Error("arm boom");
      },
    });
    const r = await runExcelNewWorksheetSmoke(deps);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toBe("arm boom");
    expect(calls.cleaned).toEqual(["wf-smoke"]); // cleanup ran despite the throw
  });
});

describe("trigger certification seed — excel new_worksheet", () => {
  it("has a row for microsoft-excel:new_worksheet (polling)", () => {
    const row = TRIGGER_CERTIFICATIONS.find(
      (c) => c.provider === "microsoft-excel" && c.type === "new_worksheet",
    );
    expect(row?.activation).toBe("polling");
  });
});
