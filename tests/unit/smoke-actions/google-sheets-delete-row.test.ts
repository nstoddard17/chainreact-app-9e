/**
 * @jest-environment node
 *
 * Write smoke harness — Google Sheets delete_row (SMOKE-WRITE-31).
 *
 * Pins the delete_row WRITE fixture WITHOUT a real DB/provider, driving it through the
 * pure `runWriteSmoke` orchestrator over a FAKE boundary. delete_row removes a row by
 * POSITION; inside a SAME-RUN smoke spreadsheet we seed, the delete + the row SHIFT it
 * causes are deterministic, so three INDEPENDENT get_cell_value reads (verifyAll) pin
 * exactly which row was removed:
 *   - setup creates a WHOLE smoke spreadsheet and seeds A1=keep-before, A2=delete-me,
 *     A3=keep-after;
 *   - execute deletes row 2;
 *   - verifyAll proves A1 unchanged, A2 == keep-after (old A3 shifted up), A3 empty —
 *     the ONLY single-row deletion consistent with all three is "row 2 deleted";
 *   - the handler's `deleted: true` echo is never used as proof;
 *   - any one read disproving the shift -> VERIFY_FAILED;
 *   - cleanup cross-provider deletes the whole spreadsheet -> leaked 0, cleaned 1.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const SHEET_ID = "sheet-del";

const fixture = (): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "google-sheets:delete_row")!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/** Deps: setup/create + delete echo scripted; get_cell_value scripted per A1/A2/A3 cell. */
function depsWith(opts: {
  byCell?: Record<string, StepRunOutcome>;
  createOk?: boolean;
}): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  const byCell = opts.byCell ?? {};
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      const key = `${input.provider}:${input.action}`;
      if (key === "google-sheets:create_spreadsheet") {
        return opts.createOk === false
          ? { ok: false, output: null, reason: "create boom" }
          : { ok: true, output: { spreadsheetId: SHEET_ID }, reason: null };
      }
      if (key === "google-sheets:get_cell_value") {
        return byCell[String(input.config.cell)] ?? { ok: false, output: null, reason: "no read" };
      }
      // update_cell seeds, delete_row, delete_file -> ok by default.
      return { ok: true, output: { deleted: true }, reason: null };
    },
  };
}

/** A correct post-delete read state: A1 kept, A2 shifted from old A3, A3 empty. */
const shiftedReads = (): Record<string, StepRunOutcome> => ({
  A1: { ok: true, output: { value: `${MARKER}keep-before` }, reason: null },
  A2: { ok: true, output: { value: `${MARKER}keep-after` }, reason: null },
  A3: { ok: true, output: { value: null }, reason: null },
});

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("google-sheets:delete_row: shape", () => {
  it("is a destructiveSafe fixture that seeds 3 rows and proves the row shift via verifyAll", () => {
    const f = fixture();
    expect(f).toBeDefined();
    expect(f.risk).toBe("destructive");
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.requiredEnv).toEqual(["SMOKE_GOOGLE_SHEETS_CONNECTED"]);
    expect(f.config.rowNumber).toBe(2);
    // setup: create + 3 seed writes.
    const setup = f.writeHarness!.setup!;
    expect(setup).toHaveLength(4);
    expect(setup[0]!.action).toBe("create_spreadsheet");
    expect(setup.slice(1).map((s) => (s.config as Record<string, unknown>).cell)).toEqual(["A1", "A2", "A3"]);
    expect(setup.slice(1).map((s) => (s.config as Record<string, unknown>).value)).toEqual([
      "{{smokeMarker}}keep-before",
      "{{smokeMarker}}delete-me",
      "{{smokeMarker}}keep-after",
    ]);
    // verifyAll: 3 independent get_cell_value reads (A1 keep-before, A2 keep-after, A3 empty).
    const va = f.writeHarness!.verifyAll!;
    expect(va).toHaveLength(3);
    expect(va.every((s) => s.action === "get_cell_value")).toBe(true);
    expect(va[0]!.markerSuffix).toBe("keep-before");
    expect(va[1]!.markerSuffix).toBe("keep-after");
    expect(va[2]!.expectEmpty).toEqual({ path: "value" });
    // cross-provider whole-spreadsheet teardown.
    expect(f.writeHarness?.crossProviderCleanup).toBe(true);
    expect(f.writeHarness?.cleanup?.provider).toBe("google-drive");
    expect(f.writeHarness?.cleanup?.config).toEqual({ fileId: "{{ledger.sheet.id}}", permanent: true });
  });
});

// ─── Orchestration ────────────────────────────────────────────────────────────

describe("google-sheets:delete_row orchestration", () => {
  it("PASS: seed -> delete row 2 -> A1 kept / A2 shifted / A3 empty -> Drive-delete (cleaned)", async () => {
    const deps = depsWith({ byCell: shiftedReads() });
    const res = await runWriteSmoke(fixture(), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(1); // only the spreadsheet is a ledger resource
    expect(res.ledger.cleaned).toBe(1);
    expect(res.ledger.leaked).toBe(0);
    // delete targeted OUR sheet, row 2; all three independent reads ran.
    expect(deps.calls.find((c) => c.action === "delete_row")?.config.rowNumber).toBe(2);
    expect(deps.calls.filter((c) => c.action === "get_cell_value")).toHaveLength(3);
    expect(deps.calls.find((c) => c.action === "delete_file")?.config.fileId).toBe(SHEET_ID);
  });

  it("VERIFY_FAILED: A2 still shows delete-me (no shift -> row 2 was not removed)", async () => {
    const reads = shiftedReads();
    reads.A2 = { ok: true, output: { value: `${MARKER}delete-me` }, reason: null };
    const deps = depsWith({ byCell: reads });
    const res = await runWriteSmoke(fixture(), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_file")).toBe(true); // still cleaned up
  });

  it("VERIFY_FAILED: A1 changed (a different row was deleted)", async () => {
    const reads = shiftedReads();
    reads.A1 = { ok: true, output: { value: `${MARKER}delete-me` }, reason: null };
    const res = await runWriteSmoke(fixture(), RUN, depsWith({ byCell: reads }));
    expect(res.status).toBe("VERIFY_FAILED");
  });

  it("VERIFY_FAILED: A3 not empty (the sheet did not shrink by one row)", async () => {
    const reads = shiftedReads();
    reads.A3 = { ok: true, output: { value: `${MARKER}keep-after` }, reason: null };
    const res = await runWriteSmoke(fixture(), RUN, depsWith({ byCell: reads }));
    expect(res.status).toBe("VERIFY_FAILED");
  });

  it("FAIL: setup create fails -> no delete, nothing created/leaked", async () => {
    const deps = depsWith({ createOk: false });
    const res = await runWriteSmoke(fixture(), RUN, deps);
    expect(res.status).toBe("FAIL");
    expect(res.ledger.created).toBe(0);
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.some((c) => c.action === "delete_row")).toBe(false);
  });
});
