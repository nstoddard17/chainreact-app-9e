/**
 * @jest-environment node
 *
 * TEST-REDUNDANCY-CONSOLIDATION-2B — merged from 5 sibling suites:
 *   google-sheets-batch-update.test.ts
 *   google-sheets-clear-range.test.ts
 *   google-sheets-delete-row.test.ts
 *   google-sheets-format-range.test.ts
 *   google-sheets-row-mutators.test.ts
 *
 * Each former file's body is wrapped VERBATIM in its own describe, so its
 * fixtures, helpers and beforeEach isolation are unchanged. Module-scope mock
 * declarations are hoisted once (Jest requires them at module scope); every
 * distinct provider module keeps its own jest.mock.
 */

import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type StepRunOutcome, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

// ---------------------------------------------------------------------------
// Merged verbatim from the former google-sheets-batch-update.test.ts
// ---------------------------------------------------------------------------
describe("google-sheets-batch-update", () => {

  const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
  const MARKER = "crsmoke-T1-";
  const SHEET_ID = "sheet-batch";

  const fixture = (): ActionSmokeFixture =>
    WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "google-sheets:batch_update")!;

  interface RecordingDeps extends WriteHarnessDeps {
    readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  }

  function depsWith(plan: Record<string, StepRunOutcome>): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    return {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
      },
    };
  }

  const okPlan = (): Record<string, StepRunOutcome> => ({
    "google-sheets:create_spreadsheet": { ok: true, output: { spreadsheetId: SHEET_ID }, reason: null },
    "google-sheets:batch_update": {
      ok: true,
      output: { totalUpdatedCells: 1, responses: [{ updatedRange: "Data!A1" }] },
      reason: null,
    },
    "google-sheets:get_cell_value": { ok: true, output: { value: `${MARKER}batch` }, reason: null },
    "google-drive:delete_file": { ok: true, output: { success: true }, reason: null },
  });

  // ─── Shape ───────────────────────────────────────────────────────────────────

  describe("google-sheets:batch_update: shape", () => {
    it("is a destructiveSafe write fixture using exactly ONE one-cell update entry", () => {
      const f = fixture();
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.liveSafe).toBe(false);
      expect(f.requiredEnv).toEqual(["SMOKE_GOOGLE_SHEETS_CONNECTED"]);
      // Narrowest deterministic request: one update entry, one cell.
      const updates = f.config.updates as Array<{ range: string; values: unknown[][] }>;
      expect(updates).toHaveLength(1);
      expect(updates[0]!.range).toBe("Data!A1");
      expect(updates[0]!.values).toEqual([["{{smokeMarker}}batch"]]);
      expect(f.config.valueInputOption).toBe("RAW");
      // setup creates + captures a whole smoke spreadsheet.
      expect(f.writeHarness?.setup?.[0]?.action).toBe("create_spreadsheet");
      expect(f.writeHarness?.setup?.[0]?.captureResource?.resourceKey).toBe("sheet");
      // independent read-back via get_cell_value (not the write echo) + cross-provider delete.
      const v = f.writeHarness!.verify!;
      expect(v.action).toBe("get_cell_value");
      expect(v.smokeRead).toBeUndefined();
      expect(v.markerPath).toBe("value");
      expect(v.markerSuffix).toBe("batch");
      expect(f.writeHarness?.crossProviderCleanup).toBe(true);
      expect(f.writeHarness?.cleanup?.provider).toBe("google-drive");
      expect(f.writeHarness?.cleanup?.config).toEqual({ fileId: "{{ledger.sheet.id}}", permanent: true });
    });
  });

  // ─── Orchestration ────────────────────────────────────────────────────────────

  describe("google-sheets:batch_update orchestration", () => {
    it("PASS: create sheet -> batch write A1 -> independent get_cell_value(value)==marker -> Drive-delete (cleaned)", async () => {
      const deps = depsWith(okPlan());
      const res = await runWriteSmoke(fixture(), RUN, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger.created).toBe(1);
      expect(res.ledger.cleaned).toBe(1);
      expect(res.ledger.leaked).toBe(0);
      // batch + verify both targeted OUR captured spreadsheet id.
      expect(deps.calls.find((c) => c.action === "batch_update")?.config.spreadsheetId).toBe(SHEET_ID);
      expect(deps.calls.find((c) => c.action === "get_cell_value")?.config.spreadsheetId).toBe(SHEET_ID);
      expect(deps.calls.find((c) => c.action === "delete_file")?.config.fileId).toBe(SHEET_ID);
    });

    it("VERIFY_FAILED: read-back value lacks the marker (counters can't vacuously pass; cleanup still runs)", async () => {
      const plan = okPlan();
      plan["google-sheets:get_cell_value"] = { ok: true, output: { value: "someone-else" }, reason: null };
      const deps = depsWith(plan);
      const res = await runWriteSmoke(fixture(), RUN, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_file")).toBe(true);
    });

    it("FAIL: setup create fails -> no batch, nothing created/leaked", async () => {
      const deps = depsWith({
        "google-sheets:create_spreadsheet": { ok: false, output: null, reason: "create boom" },
      });
      const res = await runWriteSmoke(fixture(), RUN, deps);
      expect(res.status).toBe("FAIL");
      expect(res.ledger.created).toBe(0);
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.some((c) => c.action === "batch_update")).toBe(false);
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former google-sheets-clear-range.test.ts
// ---------------------------------------------------------------------------
describe("google-sheets-clear-range", () => {

  const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
  const MARKER = "crsmoke-T1-";
  const SHEET_ID = "sheet-clear";

  const fixture = (): ActionSmokeFixture =>
    WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "google-sheets:clear_range")!;

  interface RecordingDeps extends WriteHarnessDeps {
    readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  }

  function depsWith(plan: Record<string, StepRunOutcome>): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    return {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
      },
    };
  }

  /** Passing-by-default plan (cleared cell reads back as value:null). */
  const okPlan = (): Record<string, StepRunOutcome> => ({
    "google-sheets:create_spreadsheet": { ok: true, output: { spreadsheetId: SHEET_ID }, reason: null },
    "google-sheets:update_cell": { ok: true, output: { updated: true }, reason: null }, // seed
    "google-sheets:clear_range": { ok: true, output: { clearedRange: "Data!A1" }, reason: null },
    "google-sheets:get_cell_value": { ok: true, output: { value: null, cell: "A1" }, reason: null },
    "google-drive:delete_file": { ok: true, output: { success: true }, reason: null },
  });

  // ─── Shape ───────────────────────────────────────────────────────────────────

  describe("google-sheets:clear_range: shape", () => {
    it("is a destructiveSafe write fixture that SEEDS then verifies emptiness independently", () => {
      const f = fixture();
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.liveSafe).toBe(false);
      expect(f.requiredEnv).toEqual(["SMOKE_GOOGLE_SHEETS_CONNECTED"]);
      // setup: create whole sheet, then SEED A1 so the clear is provably a change.
      const setup = f.writeHarness!.setup!;
      expect(setup).toHaveLength(2);
      expect(setup[0]!.action).toBe("create_spreadsheet");
      expect(setup[0]!.captureResource?.resourceKey).toBe("sheet");
      expect(setup[1]!.action).toBe("update_cell");
      expect((setup[1]!.config as Record<string, unknown>).value).toBe("{{smokeMarker}}seed");
      // verify: independent get_cell_value with the empty assertion (NOT the write echo).
      const v = f.writeHarness!.verify!;
      expect(v.action).toBe("get_cell_value");
      expect(v.smokeRead).toBeUndefined();
      expect(v.expectEmpty).toEqual({ path: "value" });
      expect(v.markerPath).toBeUndefined(); // a clear has no marker to confirm
      // cross-provider whole-spreadsheet teardown.
      expect(f.writeHarness?.crossProviderCleanup).toBe(true);
      expect(f.writeHarness?.cleanup?.provider).toBe("google-drive");
      expect(f.writeHarness?.cleanup?.config).toEqual({ fileId: "{{ledger.sheet.id}}", permanent: true });
    });
  });

  // ─── Orchestration ────────────────────────────────────────────────────────────

  describe("google-sheets:clear_range orchestration", () => {
    it("PASS: create+seed -> clear A1 -> independent get_cell_value value==null (empty) -> Drive-delete (cleaned)", async () => {
      const deps = depsWith(okPlan());
      const res = await runWriteSmoke(fixture(), RUN, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger.created).toBe(1); // only the spreadsheet is a ledger resource
      expect(res.ledger.cleaned).toBe(1);
      expect(res.ledger.leaked).toBe(0);
      // seed + clear + verify all targeted OUR captured spreadsheet id.
      expect(deps.calls.find((c) => c.action === "update_cell")?.config.spreadsheetId).toBe(SHEET_ID);
      expect(deps.calls.find((c) => c.action === "clear_range")?.config.range).toBe("Data!A1");
      expect(deps.calls.find((c) => c.action === "delete_file")?.config.fileId).toBe(SHEET_ID);
    });

    it("PASS: a cleared cell that reads back as empty STRING also counts as empty", async () => {
      const plan = okPlan();
      plan["google-sheets:get_cell_value"] = { ok: true, output: { value: "" }, reason: null };
      const res = await runWriteSmoke(fixture(), RUN, depsWith(plan));
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
    });

    it("VERIFY_FAILED: read-back still shows the seeded value (clear was a no-op; echo can't pass)", async () => {
      const plan = okPlan();
      plan["google-sheets:get_cell_value"] = { ok: true, output: { value: `${MARKER}seed` }, reason: null };
      const deps = depsWith(plan);
      const res = await runWriteSmoke(fixture(), RUN, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_file")).toBe(true); // still cleaned up
    });

    it("VERIFY_FAILED: read-back omits the value key entirely (missing path never vacuously passes)", async () => {
      const plan = okPlan();
      plan["google-sheets:get_cell_value"] = { ok: true, output: { cell: "A1" }, reason: null }; // no `value`
      const res = await runWriteSmoke(fixture(), RUN, depsWith(plan));
      expect(res.status).toBe("VERIFY_FAILED");
    });

    it("VERIFY_FAILED: read-back STEP errors (permission/API) -> never read as 'cleared'", async () => {
      const plan = okPlan();
      plan["google-sheets:get_cell_value"] = { ok: false, output: null, reason: "403 forbidden" };
      const res = await runWriteSmoke(fixture(), RUN, depsWith(plan));
      expect(res.status).toBe("VERIFY_FAILED");
    });

    it("FAIL: setup create fails -> no clear, nothing created/leaked", async () => {
      const deps = depsWith({
        "google-sheets:create_spreadsheet": { ok: false, output: null, reason: "create boom" },
      });
      const res = await runWriteSmoke(fixture(), RUN, deps);
      expect(res.status).toBe("FAIL");
      expect(res.ledger.created).toBe(0);
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.some((c) => c.action === "clear_range")).toBe(false);
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former google-sheets-delete-row.test.ts
// ---------------------------------------------------------------------------
describe("google-sheets-delete-row", () => {

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

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former google-sheets-format-range.test.ts
// ---------------------------------------------------------------------------
describe("google-sheets-format-range", () => {

  const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
  const SHEET_ID = "sheet-fmt";

  const fixture = (): ActionSmokeFixture =>
    WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "google-sheets:format_range")!;

  interface RecordingDeps extends WriteHarnessDeps {
    readonly calls: { provider: string; action: string; config: Record<string, unknown>; via: "engine" | "smoke" }[];
  }

  /** Fake boundary: scripted runActionStep (engine) + scripted smokeReadBack. */
  function depsWith(
    plan: Record<string, StepRunOutcome>,
    smokePlan: Record<string, StepRunOutcome> = {},
  ): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    return {
      calls,
      async runActionStep(input) {
        calls.push({ ...input, config: { ...input.config }, via: "engine" });
        return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
      },
      async smokeReadBack(input) {
        calls.push({ ...input, config: { ...input.config }, via: "smoke" });
        return smokePlan[`${input.provider}:${input.action}`] ?? { ok: false, output: null, reason: "no reader" };
      },
    };
  }

  const enginePlan = (): Record<string, StepRunOutcome> => ({
    "google-sheets:create_spreadsheet": { ok: true, output: { spreadsheetId: SHEET_ID }, reason: null },
    "google-sheets:update_cell": { ok: true, output: { updated: true }, reason: null }, // seed
    "google-sheets:format_range": { ok: true, output: { appliedFormat: { bold: true } }, reason: null },
    "google-drive:delete_file": { ok: true, output: { success: true }, reason: null },
  });

  // ─── Shape ───────────────────────────────────────────────────────────────────

  describe("google-sheets:format_range: shape", () => {
    it("verifies via the SMOKE cell_format read-back (bounded), asserting bold==true", () => {
      const f = fixture();
      expect(f).toBeDefined();
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.requiredEnv).toEqual(["SMOKE_GOOGLE_SHEETS_CONNECTED"]);
      // execute applies a deterministic NON-default format.
      expect(f.config.range).toBe("A1"); // bare A1 per format_range schema
      expect(f.config.bold).toBe(true);
      // verify is the smoke-only bounded format reader, asserting bold == true.
      const v = f.writeHarness!.verify!;
      expect(v.action).toBe("cell_format");
      expect(v.smokeRead).toBe(true);
      expect(v.config).toEqual({ spreadsheetId: "{{ledger.sheet.id}}", range: "Data!A1" });
      expect(v.expectEquals).toEqual({ path: "bold", value: true });
      // cross-provider whole-spreadsheet teardown.
      expect(f.writeHarness?.crossProviderCleanup).toBe(true);
      expect(f.writeHarness?.cleanup?.provider).toBe("google-drive");
    });
  });

  // ─── Orchestration ────────────────────────────────────────────────────────────

  describe("google-sheets:format_range orchestration", () => {
    it("PASS: create+seed -> format bold -> independent smoke cell_format bold==true -> Drive-delete (cleaned)", async () => {
      const deps = depsWith(enginePlan(), {
        "google-sheets:cell_format": { ok: true, output: { bold: true, italic: null, horizontalAlignment: null }, reason: null },
      });
      const res = await runWriteSmoke(fixture(), RUN, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger.created).toBe(1);
      expect(res.ledger.cleaned).toBe(1);
      expect(res.ledger.leaked).toBe(0);
      // the format read-back went through the SMOKE seam (not the engine), against OUR sheet.
      const read = deps.calls.find((c) => c.action === "cell_format");
      expect(read?.via).toBe("smoke");
      expect(read?.config.spreadsheetId).toBe(SHEET_ID);
      expect(read?.config.range).toBe("Data!A1");
      expect(deps.calls.find((c) => c.action === "delete_file")?.config.fileId).toBe(SHEET_ID);
    });

    it("VERIFY_FAILED: read-back bold is false (format did not land; echo can't pass)", async () => {
      const deps = depsWith(enginePlan(), {
        "google-sheets:cell_format": { ok: true, output: { bold: false, italic: null, horizontalAlignment: null }, reason: null },
      });
      const res = await runWriteSmoke(fixture(), RUN, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_file")).toBe(true); // still cleaned up
    });

    it("VERIFY_FAILED: read-back bold is null (a fresh cell — proves no default vacuous pass)", async () => {
      const deps = depsWith(enginePlan(), {
        "google-sheets:cell_format": { ok: true, output: { bold: null, italic: null, horizontalAlignment: null }, reason: null },
      });
      const res = await runWriteSmoke(fixture(), RUN, deps);
      expect(res.status).toBe("VERIFY_FAILED");
    });

    it("VERIFY_FAILED: the smoke read-back STEP errors (permission/API) -> never read as formatted", async () => {
      const deps = depsWith(enginePlan(), {
        "google-sheets:cell_format": { ok: false, output: null, reason: "403 forbidden" },
      });
      const res = await runWriteSmoke(fixture(), RUN, deps);
      expect(res.status).toBe("VERIFY_FAILED");
    });

    it("FAIL: setup create fails -> no format, nothing created/leaked", async () => {
      const deps = depsWith({
        "google-sheets:create_spreadsheet": { ok: false, output: null, reason: "create boom" },
      });
      const res = await runWriteSmoke(fixture(), RUN, deps);
      expect(res.status).toBe("FAIL");
      expect(res.ledger.created).toBe(0);
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.some((c) => c.action === "format_range")).toBe(false);
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former google-sheets-row-mutators.test.ts
// ---------------------------------------------------------------------------
describe("google-sheets-row-mutators", () => {

  const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
  const MARKER = "crsmoke-T1-";
  const SHEET_ID = "sheet-abc";

  const fixtureFor = (key: string): ActionSmokeFixture =>
    WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

  interface RecordingDeps extends WriteHarnessDeps {
    readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  }

  function depsWith(plan: Record<string, StepRunOutcome>): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    return {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
      },
    };
  }

  const KEYS = ["google-sheets:update_cell", "google-sheets:append_row", "google-sheets:update_row"] as const;

  // ─── Shape ───────────────────────────────────────────────────────────────────

  describe("google-sheets row/range mutators: shape", () => {
    it.each(KEYS)("%s is a destructiveSafe write fixture, connection-only env", (key) => {
      const f = fixtureFor(key);
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.liveSafe).toBe(false);
      expect(f.writeHarness?.smokeMarker).toBe("crsmoke-");
      expect(f.requiredEnv).toEqual(["SMOKE_GOOGLE_SHEETS_CONNECTED"]);
    });

    it.each(KEYS)("%s sets up a whole smoke spreadsheet (pinned 'Data' sheet) and captures it", (key) => {
      const f = fixtureFor(key);
      const setup = f.writeHarness!.setup!;
      expect(setup[0]!.provider).toBe("google-sheets");
      expect(setup[0]!.action).toBe("create_spreadsheet");
      expect(setup[0]!.config.initialSheetName).toBe("Data");
      expect(setup[0]!.captureResource).toEqual({
        resourceKey: "sheet",
        idPath: "spreadsheetId",
        kind: "spreadsheet",
      });
    });

    it.each(KEYS)("%s verifies via INDEPENDENT get_cell_value (not the write echo) + cross-provider Drive delete", (key) => {
      const f = fixtureFor(key);
      const v = f.writeHarness!.verify!;
      expect(v.provider).toBe("google-sheets");
      expect(v.action).toBe("get_cell_value");
      expect(v.markerPath).toBe("value");
      expect(v.smokeRead).toBeUndefined(); // registered read, not a smoke reader
      expect(typeof v.markerSuffix).toBe("string");
      // Whole-spreadsheet teardown is cross-provider (a spreadsheetId is a Drive file id).
      expect(f.writeHarness?.crossProviderCleanup).toBe(true);
      expect(f.writeHarness?.cleanupKind).toBe("delete");
      expect(f.writeHarness?.cleanup?.provider).toBe("google-drive");
      expect(f.writeHarness?.cleanup?.action).toBe("delete_file");
      expect(f.writeHarness?.cleanup?.config).toEqual({ fileId: "{{ledger.sheet.id}}", permanent: true });
    });

    it("update_row SEEDS a distinct prior value so the update is provably not a no-op", () => {
      const f = fixtureFor("google-sheets:update_row");
      const setup = f.writeHarness!.setup!;
      expect(setup).toHaveLength(2);
      expect(setup[1]!.action).toBe("append_row"); // seed
      expect((setup[1]!.config.values as string[])[0]).toBe("{{smokeMarker}}seed");
      expect(f.writeHarness?.verify?.markerSuffix).toBe("updated"); // proves overwrite landed
    });
  });

  // ─── Orchestration ────────────────────────────────────────────────────────────

  describe("google-sheets:update_cell orchestration", () => {
    it("PASS: create sheet -> update A1 -> independent get_cell_value(value) marker -> Drive-delete whole sheet (cleaned)", async () => {
      const deps = depsWith({
        "google-sheets:create_spreadsheet": { ok: true, output: { spreadsheetId: SHEET_ID, title: `${MARKER}sheet` }, reason: null },
        "google-sheets:update_cell": { ok: true, output: { updated: true, updatedRange: "Data!A1" }, reason: null },
        "google-sheets:get_cell_value": { ok: true, output: { value: `${MARKER}cell`, cell: "A1" }, reason: null },
        "google-drive:delete_file": { ok: true, output: { success: true }, reason: null },
      });
      const res = await runWriteSmoke(fixtureFor("google-sheets:update_cell"), RUN, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger.created).toBe(1); // only the spreadsheet is a ledger resource
      expect(res.ledger.cleaned).toBe(1);
      expect(res.ledger.leaked).toBe(0);
      // mutation + verify both targeted OUR captured spreadsheet id.
      expect(deps.calls.find((c) => c.action === "update_cell")?.config.spreadsheetId).toBe(SHEET_ID);
      expect(deps.calls.find((c) => c.action === "get_cell_value")?.config.spreadsheetId).toBe(SHEET_ID);
      // cross-provider teardown deletes the whole sheet by its Drive file id.
      expect(deps.calls.find((c) => c.action === "delete_file")?.config.fileId).toBe(SHEET_ID);
    });

    it("VERIFY_FAILED: read-back value lacks the marker (echo cannot vacuously pass; cleanup still runs)", async () => {
      const deps = depsWith({
        "google-sheets:create_spreadsheet": { ok: true, output: { spreadsheetId: SHEET_ID }, reason: null },
        "google-sheets:update_cell": { ok: true, output: { updated: true }, reason: null },
        "google-sheets:get_cell_value": { ok: true, output: { value: "someone-else" }, reason: null },
        "google-drive:delete_file": { ok: true, output: { success: true }, reason: null },
      });
      const res = await runWriteSmoke(fixtureFor("google-sheets:update_cell"), RUN, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_file")).toBe(true);
    });
  });

  describe("google-sheets:append_row orchestration", () => {
    it("PASS: create sheet -> append marker row -> independent get_cell_value(A1)==marker -> Drive-delete (cleaned)", async () => {
      const deps = depsWith({
        "google-sheets:create_spreadsheet": { ok: true, output: { spreadsheetId: SHEET_ID }, reason: null },
        "google-sheets:append_row": { ok: true, output: { updatedRange: "Data!A1:B1", updatedRows: 1 }, reason: null },
        "google-sheets:get_cell_value": { ok: true, output: { value: `${MARKER}row` }, reason: null },
        "google-drive:delete_file": { ok: true, output: { success: true }, reason: null },
      });
      const res = await runWriteSmoke(fixtureFor("google-sheets:append_row"), RUN, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.find((c) => c.action === "append_row")?.config.spreadsheetId).toBe(SHEET_ID);
    });
  });

  describe("google-sheets:update_row orchestration", () => {
    it("PASS: create+seed -> update row -> read-back proves 'updated' (not the seeded 'seed') -> Drive-delete (cleaned)", async () => {
      const deps = depsWith({
        "google-sheets:create_spreadsheet": { ok: true, output: { spreadsheetId: SHEET_ID }, reason: null },
        "google-sheets:append_row": { ok: true, output: { updatedRange: "Data!A1" }, reason: null }, // seed
        "google-sheets:update_row": { ok: true, output: { updatedRange: "Data!A1:B1" }, reason: null },
        "google-sheets:get_cell_value": { ok: true, output: { value: `${MARKER}updated` }, reason: null },
        "google-drive:delete_file": { ok: true, output: { success: true }, reason: null },
      });
      const res = await runWriteSmoke(fixtureFor("google-sheets:update_row"), RUN, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger.created).toBe(1);
      expect(res.ledger.leaked).toBe(0);
    });

    it("VERIFY_FAILED: read-back still shows the seeded value (update was a no-op)", async () => {
      const deps = depsWith({
        "google-sheets:create_spreadsheet": { ok: true, output: { spreadsheetId: SHEET_ID }, reason: null },
        "google-sheets:append_row": { ok: true, output: { updatedRange: "Data!A1" }, reason: null },
        "google-sheets:update_row": { ok: true, output: { updatedRange: "Data!A1:B1" }, reason: null },
        // The cell still reads the SEEDED value -> markerSuffix "updated" must fail.
        "google-sheets:get_cell_value": { ok: true, output: { value: `${MARKER}seed` }, reason: null },
        "google-drive:delete_file": { ok: true, output: { success: true }, reason: null },
      });
      const res = await runWriteSmoke(fixtureFor("google-sheets:update_row"), RUN, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_file")).toBe(true); // still cleaned up
    });

    it("FAIL: setup create_spreadsheet fails -> no mutation, nothing created/leaked", async () => {
      const deps = depsWith({
        "google-sheets:create_spreadsheet": { ok: false, output: null, reason: "create boom" },
      });
      const res = await runWriteSmoke(fixtureFor("google-sheets:update_row"), RUN, deps);
      expect(res.status).toBe("FAIL");
      expect(res.ledger.created).toBe(0);
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.some((c) => c.action === "update_row")).toBe(false);
    });
  });

});
