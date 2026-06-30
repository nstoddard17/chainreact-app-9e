/**
 * @jest-environment node
 *
 * Unit tests for the generic Excel polling-trigger smoke ORCHESTRATOR (pure,
 * fakes for every seam). Proves baseline-first (first poll 0) + fire-once +
 * verifiable identity + propagation re-poll + terminal + cleanup-not-masked, plus
 * the three real specs' build + identity logic. No DB / engine / provider.
 */
import {
  buildExcelNewWorksheetSmokeWorkflow,
  buildExcelNewRowSmokeWorkflow,
  buildExcelNewTableRowSmokeWorkflow,
  runExcelPollingSmoke,
  runExcelNewWorksheetSmoke,
  NEW_WORKSHEET_SPEC,
  NEW_ROW_SPEC,
  NEW_TABLE_ROW_SPEC,
  UPDATED_ROW_SPEC,
  UPDATED_TABLE_ROW_SPEC,
  EXCEL_POLLING_SMOKE_TRIGGER_NODE_ID,
  type ExcelPollingSmokeDeps,
  type ExcelPollingRun,
} from "@/tests/trigger-smoke/excelPollingSmoke";
import { TRIGGER_CERTIFICATIONS } from "@/tests/trigger-smoke/triggerCertificationSeed";

/**
 * Fake deps modeling the real timeline: a run appears for THIS workflow only after
 * a post-baseline add (tracked via `added`), and only after `runsAppearOnPoll`
 * polls since the add (to simulate Graph propagation lag). The run's payload is
 * `{ worksheetName: added, values: [added] }` so it matches every spec's identity.
 */
function makeFakeDeps(
  opts: { runsAppearAfterNPolls?: number } = {},
  overrides: Partial<ExcelPollingSmokeDeps> = {},
): {
  deps: ExcelPollingSmokeDeps;
  calls: { polls: number; cleaned: string[]; drained: string[]; sleeps: number; seeded: number };
} {
  const appearAfter = opts.runsAppearAfterNPolls ?? 1;
  const calls = { polls: 0, cleaned: [] as string[], drained: [] as string[], sleeps: 0, seeded: 0 };
  let added: string | null = null;
  let pollsSinceAdd = 0;
  let runs: ExcelPollingRun[] = [];

  const maybeFire = () => {
    if (added && runs.length === 0) {
      pollsSinceAdd += 1;
      if (pollsSinceAdd >= appearAfter) {
        runs = [{ runId: "run-x", status: "queued", triggerPayload: { worksheetName: added, values: [added] } }];
      }
    }
  };

  const deps: ExcelPollingSmokeDeps = {
    async createSmokeWorkbook() {
      return { workbookId: "wb-smoke" };
    },
    async createActiveSmokeWorkflow() {
      return { workflowId: "wf-smoke" };
    },
    async armPollingTrigger() {
      return { snapshotKeyCount: 1 };
    },
    async poll() {
      calls.polls += 1;
      maybeFire();
    },
    async addWorksheet() {
      added = "crsmokeabcd1234ws";
      return { worksheetName: added };
    },
    async seedRow() {
      calls.seeded += 1;
    },
    async addMarkedRow() {
      added = "crsmoke-abcd1234-row";
      return { marker: added };
    },
    async addMarkedTableRow() {
      added = "crsmoke-abcd1234-trow";
      return { marker: added };
    },
    async seedRowsForUpdate() {
      calls.seeded += 1;
    },
    async updateRowMarked() {
      added = "crsmoke-abcd1234-upd";
      return { marker: added };
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
      calls.sleeps += 1;
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("build functions", () => {
  it("new_worksheet / new_row / new_table_row carry the right trigger type + config", () => {
    const ws = buildExcelNewWorksheetSmokeWorkflow("wb").definition.nodes.find((n) => n.kind === "trigger")!;
    expect(ws.type).toBe("new_worksheet");
    expect((ws.config as { workbookId?: string }).workbookId).toBe("wb");

    const row = buildExcelNewRowSmokeWorkflow("wb").definition.nodes.find((n) => n.kind === "trigger")!;
    expect(row.type).toBe("new_row");
    expect((row.config as { worksheetName?: string }).worksheetName).toBe("Sheet1");

    const trow = buildExcelNewTableRowSmokeWorkflow("wb").definition.nodes.find((n) => n.kind === "trigger")!;
    expect(trow.type).toBe("new_table_row");
    expect((trow.config as { tableName?: string }).tableName).toBe("SmokeTable");
    expect(trow.id).toBe(EXCEL_POLLING_SMOKE_TRIGGER_NODE_ID);
  });
});

describe("runExcelPollingSmoke — happy path per spec", () => {
  const SEEDING_SPECS = new Set([NEW_ROW_SPEC, UPDATED_ROW_SPEC]);
  for (const spec of [NEW_WORKSHEET_SPEC, NEW_ROW_SPEC, NEW_TABLE_ROW_SPEC, UPDATED_ROW_SPEC, UPDATED_TABLE_ROW_SPEC]) {
    it(`passes for ${spec.label}: baseline 0, after 1, identity matched, succeeded, cleaned`, async () => {
      const { deps, calls } = makeFakeDeps();
      const r = await runExcelPollingSmoke(deps, spec);
      expect(r.outcome).toBe("pass");
      expect(r.triggerLabel).toBe(spec.label);
      expect(r.baselineRunCount).toBe(0);
      expect(r.afterRunCount).toBe(1);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.cleaned).toBe(true);
      expect(calls.drained).toEqual(["run-x"]);
      expect(calls.cleaned).toEqual(["wf-smoke"]);
      // new_row + updated_row seed a baseline row/rows; the others do not.
      expect(calls.seeded).toBe(SEEDING_SPECS.has(spec) ? 1 : 0);
    });
  }

  it("runExcelNewWorksheetSmoke wrapper still works", async () => {
    const { deps } = makeFakeDeps();
    const r = await runExcelNewWorksheetSmoke(deps);
    expect(r.outcome).toBe("pass");
    expect(r.triggerLabel).toBe("microsoft-excel:new_worksheet");
  });
});

describe("runExcelPollingSmoke — propagation re-poll", () => {
  it("passes when the run only appears on the 2nd after-poll (bounded re-poll + sleep)", async () => {
    const { deps, calls } = makeFakeDeps({ runsAppearAfterNPolls: 2 });
    const r = await runExcelPollingSmoke(deps, NEW_WORKSHEET_SPEC, { afterPollAttempts: 4, afterPollSleepMs: 5 });
    expect(r.outcome).toBe("pass");
    expect(r.afterRunCount).toBe(1);
    expect(calls.sleeps).toBeGreaterThanOrEqual(1); // had to wait between after-polls
  });

  it("fails (not hang) when the add never becomes visible within the attempt budget", async () => {
    const { deps } = makeFakeDeps({ runsAppearAfterNPolls: 99 });
    const r = await runExcelPollingSmoke(deps, NEW_WORKSHEET_SPEC, { afterPollAttempts: 3, afterPollSleepMs: 1 });
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/expected exactly 1 run after the add, got 0/);
  });
});

describe("runExcelPollingSmoke — invariants + failure modes", () => {
  it("baseline-first: fails (and cleans up) if the FIRST poll fires from pre-existing state", async () => {
    let runs: ExcelPollingRun[] = [];
    const { deps, calls } = makeFakeDeps({}, {
      async poll() {
        if (runs.length === 0) runs = [{ runId: "early", status: "queued", triggerPayload: { worksheetName: "Sheet1" } }];
      },
      async listRuns() {
        return runs;
      },
    });
    const r = await runExcelPollingSmoke(deps, NEW_WORKSHEET_SPEC);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline violation/);
    expect(r.cleaned).toBe(true);
    expect(calls.cleaned).toEqual(["wf-smoke"]);
  });

  it("fails when the fired run's payload does not identify the add", async () => {
    let added: string | null = null;
    let runs: ExcelPollingRun[] = [];
    const { deps } = makeFakeDeps({}, {
      async addWorksheet() {
        added = "crsmokeZZZZws";
        return { worksheetName: added };
      },
      async poll() {
        if (added && runs.length === 0) runs = [{ runId: "r", status: "queued", triggerPayload: { worksheetName: "other-sheet" } }];
      },
      async listRuns() {
        return runs;
      },
    });
    const r = await runExcelPollingSmoke(deps, NEW_WORKSHEET_SPEC);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not identify the add/);
  });

  it("fails when activation seeds an empty snapshot", async () => {
    const { deps } = makeFakeDeps({}, { async armPollingTrigger() { return { snapshotKeyCount: 0 }; } });
    const r = await runExcelPollingSmoke(deps, NEW_WORKSHEET_SPEC);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/empty snapshot/);
  });

  it("cleanup is NOT masked: fails AND cleans up when arming throws", async () => {
    const { deps, calls } = makeFakeDeps({}, {
      async armPollingTrigger() {
        throw new Error("arm boom");
      },
    });
    const r = await runExcelPollingSmoke(deps, NEW_WORKSHEET_SPEC);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toBe("arm boom");
    expect(calls.cleaned).toEqual(["wf-smoke"]);
  });
});

describe("real spec identityMatches", () => {
  const run = (payload: Record<string, unknown>): ExcelPollingRun => ({
    runId: "r",
    status: "queued",
    triggerPayload: payload,
  });
  it("new_worksheet matches on payload.worksheetName", () => {
    expect(NEW_WORKSHEET_SPEC.identityMatches(run({ worksheetName: "wsA" }), "wsA")).toBe(true);
    expect(NEW_WORKSHEET_SPEC.identityMatches(run({ worksheetName: "wsB" }), "wsA")).toBe(false);
  });
  it("new_row / new_table_row match when payload.values includes the marker", () => {
    expect(NEW_ROW_SPEC.identityMatches(run({ values: ["crsmoke-x-row", "y"] }), "crsmoke-x-row")).toBe(true);
    expect(NEW_TABLE_ROW_SPEC.identityMatches(run({ values: ["other"] }), "crsmoke-x-trow")).toBe(false);
  });
});

describe("trigger certification seed — excel polling family", () => {
  it("has rows for new_worksheet, new_row, new_table_row (all polling)", () => {
    for (const t of ["new_worksheet", "new_row", "new_table_row", "updated_row", "updated_table_row"]) {
      const row = TRIGGER_CERTIFICATIONS.find((c) => c.provider === "microsoft-excel" && c.type === t);
      expect(row?.activation).toBe("polling");
    }
  });
});
