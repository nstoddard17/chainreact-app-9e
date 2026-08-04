/**
 * @jest-environment node
 *
 * TEST-REDUNDANCY-CONSOLIDATION-2B — merged from 7 sibling suites:
 *   excel-add-row.test.ts
 *   excel-add-table-row.test.ts
 *   excel-create-worksheet.test.ts
 *   excel-delete-row.test.ts
 *   excel-delete-worksheet.test.ts
 *   excel-rename-worksheet.test.ts
 *   excel-update-row.test.ts
 *
 * Each former file's body is wrapped VERBATIM in its own describe, so its
 * fixtures, helpers and beforeEach isolation are unchanged. Module-scope mock
 * declarations are hoisted once (Jest requires them at module scope); every
 * distinct provider module keeps its own jest.mock.
 */

import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type StepRunOutcome, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";
import { MINIMAL_XLSX_WITH_TABLE_BASE64, MINIMAL_XLSX_BASE64 } from "@/tests/smoke-actions/minimalXlsx";

// ---------------------------------------------------------------------------
// Merged verbatim from the former excel-add-row.test.ts
// ---------------------------------------------------------------------------
describe("excel-add-row", () => {

  const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true, sleep: async () => {} } as const;
  const MARKER = "crsmoke-T1-";
  const WB_ID = "wb-1";
  const env = (): string | undefined => "x"; // _CONNECTED signals are filtered from the target gate

  const fixture = (): ActionSmokeFixture =>
    WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "microsoft-excel:add_row")!;

  interface RecordingDeps extends WriteHarnessDeps {
    readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  }

  function depsWith(plan: Record<string, readonly StepRunOutcome[]>): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    const idx: Record<string, number> = {};
    return {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        const key = `${input.provider}:${input.action}`;
        const seq = plan[key] ?? [{ ok: true, output: null, reason: null }];
        const i = idx[key] ?? 0;
        idx[key] = i + 1;
        return seq[Math.min(i, seq.length - 1)]!;
      },
    };
  }

  const UPLOAD_OK: StepRunOutcome = { ok: true, output: { itemId: WB_ID, name: `${MARKER}workbook.xlsx` }, reason: null };
  // read_range A1 returns the appended marker cell as a 2D matrix.
  const READ_RANGE_MARKER: StepRunOutcome = {
    ok: true,
    output: { address: "Sheet1!A1", values: [[`${MARKER}row`]] },
    reason: null,
  };

  describe("excel:add_row — fixture shape", () => {
    it("is a destructiveSafe Excel write that appends to seeded Sheet1 + cleans via OneDrive delete", () => {
      const f = fixture();
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.liveSafe).toBe(false);
      expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_EXCEL_CONNECTED", "SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"]);
      expect(f.writeHarness?.setup?.[0]?.action).toBe("upload_file");
      expect(f.writeHarness?.setup?.[0]?.captureResource?.resourceKey).toBe("workbook");
      // execute appends a positional row to the empty Sheet1.
      expect(f.config.workbookId).toBe("{{ledger.workbook.id}}");
      expect(f.config.worksheetName).toBe("Sheet1");
      expect(f.config.values).toEqual(["{{smokeMarker}}row", "x"]);
      // verify is an INDEPENDENT read_range A1 read-back, marker + suffix "row".
      expect(f.writeHarness?.verify?.action).toBe("read_range");
      expect(f.writeHarness?.verify?.config).toMatchObject({ worksheetName: "Sheet1", address: "A1" });
      expect(f.writeHarness?.verify?.markerPath).toBe("values");
      expect(f.writeHarness?.verify?.markerSuffix).toBe("row");
      expect(f.writeHarness?.cleanup?.provider).toBe("microsoft-onedrive");
      expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
      expect(f.writeHarness?.crossProviderCleanup).toBeUndefined();
    });
  });

  describe("excel:add_row — orchestration", () => {
    it("PASS: upload -> add_row -> independent read_range A1 marker -> delete (cleaned, 0 leaked)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_row": [{ ok: true, output: { updatedRange: "Sheet1!A1:B1" }, reason: null }],
        "microsoft-excel:read_range": [READ_RANGE_MARKER],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger).toMatchObject({ created: 1, cleaned: 1, leaked: 0, kinds: ["workbook"] });
      expect(deps.calls.find((c) => c.action === "add_row")?.config.values).toEqual([`${MARKER}row`, "x"]);
      expect(deps.calls.find((c) => c.action === "read_range")?.config.workbookId).toBe(WB_ID);
      expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe(WB_ID);
    });

    it("VERIFY_FAILED: read-back A1 lacks the marker (no-op append; cleanup still runs, 0 leaked)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_row": [{ ok: true, output: null, reason: null }],
        "microsoft-excel:read_range": [{ ok: true, output: { address: "Sheet1!A1", values: [[null]] }, reason: null }],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
      expect(res.ledger.leaked).toBe(0);
    });

    it("cleanup absorbs a workbook-session delete LOCK via the bounded OneDrive retry -> 0 leaked", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_row": [{ ok: true, output: null, reason: null }],
        "microsoft-excel:read_range": [READ_RANGE_MARKER],
        "microsoft-onedrive:delete_item": [
          { ok: false, output: null, reason: "The resource you are attempting to access is locked" },
          { ok: true, output: null, reason: null },
        ],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.filter((c) => c.action === "delete_item")).toHaveLength(2);
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former excel-add-table-row.test.ts
// ---------------------------------------------------------------------------
describe("excel-add-table-row", () => {

  const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true, sleep: async () => {} } as const;
  const MARKER = "crsmoke-T1-";
  const WB_ID = "wb-1";
  const env = (): string | undefined => "x"; // _CONNECTED signals are filtered from the target gate

  const fixture = (): ActionSmokeFixture =>
    WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "microsoft-excel:add_table_row")!;

  interface RecordingDeps extends WriteHarnessDeps {
    readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  }

  function depsWith(plan: Record<string, readonly StepRunOutcome[]>): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    const idx: Record<string, number> = {};
    return {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        const key = `${input.provider}:${input.action}`;
        const seq = plan[key] ?? [{ ok: true, output: null, reason: null }];
        const i = idx[key] ?? 0;
        idx[key] = i + 1;
        return seq[Math.min(i, seq.length - 1)]!;
      },
    };
  }

  const UPLOAD_OK: StepRunOutcome = { ok: true, output: { itemId: WB_ID, name: `${MARKER}workbook.xlsx` }, reason: null };
  // read_table_rows returns the seed row + the appended marker row (handler row shape).
  const READ_ROWS_WITH_MARKER: StepRunOutcome = {
    ok: true,
    output: { rows: [{ index: 0, cells: ["seed"] }, { index: 1, cells: [`${MARKER}trow`] }], count: 2 },
    reason: null,
  };

  describe("excel:add_table_row — fixture shape", () => {
    it("is a destructiveSafe Excel write that appends to the embedded table + cleans via OneDrive delete", () => {
      const f = fixture();
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.liveSafe).toBe(false);
      expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_EXCEL_CONNECTED", "SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"]);
      // setup uploads the TABLE-bearing asset (not the plain minimal workbook).
      expect(f.writeHarness?.setup?.[0]?.action).toBe("upload_file");
      expect(f.writeHarness?.setup?.[0]?.config.content).toBe(MINIMAL_XLSX_WITH_TABLE_BASE64);
      expect(f.writeHarness?.setup?.[0]?.captureResource?.resourceKey).toBe("workbook");
      // execute appends a positional row to the named table.
      expect(f.config.workbookId).toBe("{{ledger.workbook.id}}");
      expect(f.config.tableName).toBe("SmokeTable");
      expect(f.config.values).toEqual(["{{smokeMarker}}trow"]);
      // verify is an INDEPENDENT read_table_rows read-back, marker + suffix "trow".
      expect(f.writeHarness?.verify?.action).toBe("read_table_rows");
      expect(f.writeHarness?.verify?.config).toMatchObject({ tableName: "SmokeTable" });
      expect(f.writeHarness?.verify?.markerPath).toBe("rows");
      expect(f.writeHarness?.verify?.markerSuffix).toBe("trow");
      expect(f.writeHarness?.cleanup?.provider).toBe("microsoft-onedrive");
      expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
      expect(f.writeHarness?.crossProviderCleanup).toBeUndefined();
    });
  });

  describe("excel:add_table_row — orchestration", () => {
    it("PASS: upload table workbook -> add_table_row -> independent read_table_rows marker -> delete (cleaned, 0 leaked)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_table_row": [{ ok: true, output: { index: 1 }, reason: null }],
        "microsoft-excel:read_table_rows": [READ_ROWS_WITH_MARKER],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger).toMatchObject({ created: 1, cleaned: 1, leaked: 0, kinds: ["workbook"] });
      expect(deps.calls.find((c) => c.action === "add_table_row")?.config.values).toEqual([`${MARKER}trow`]);
      expect(deps.calls.find((c) => c.action === "read_table_rows")?.config.tableName).toBe("SmokeTable");
      expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe(WB_ID);
    });

    it("VERIFY_FAILED on a no-op: read-back has only the non-marker seed row (cleanup still runs, 0 leaked)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_table_row": [{ ok: true, output: null, reason: null }],
        "microsoft-excel:read_table_rows": [{ ok: true, output: { rows: [{ index: 0, cells: ["seed"] }], count: 1 }, reason: null }],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
      expect(res.ledger.leaked).toBe(0);
    });

    it("cleanup absorbs a workbook-session delete LOCK via the bounded OneDrive retry -> 0 leaked", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_table_row": [{ ok: true, output: null, reason: null }],
        "microsoft-excel:read_table_rows": [READ_ROWS_WITH_MARKER],
        "microsoft-onedrive:delete_item": [
          { ok: false, output: null, reason: "The resource you are attempting to access is locked" },
          { ok: true, output: null, reason: null },
        ],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.filter((c) => c.action === "delete_item")).toHaveLength(2);
    });
  });

  describe("table bootstrap asset", () => {
    it("is a valid OOXML zip (PK header) and distinct from the plain minimal workbook", () => {
      const buf = Buffer.from(MINIMAL_XLSX_WITH_TABLE_BASE64, "base64");
      expect(buf.slice(0, 2).toString("latin1")).toBe("PK");
      expect(buf.length).toBeGreaterThan(2000);
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former excel-create-worksheet.test.ts
// ---------------------------------------------------------------------------
describe("excel-create-worksheet", () => {

  const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true, sleep: async () => {} } as const;
  const MARKER = "crsmoke-T1-";
  const WB_ID = "wb-1";
  // Both connection signals are filtered out of the target-env gate (they end in _CONNECTED),
  // so any non-empty env keeps the run off BLOCKED_ENV; there is no target id to resolve.
  const env = (): string | undefined => "x";

  const fixture = (): ActionSmokeFixture =>
    WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "microsoft-excel:create_worksheet")!;

  interface RecordingDeps extends WriteHarnessDeps {
    readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  }

  function depsWith(plan: Record<string, readonly StepRunOutcome[]>): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    const idx: Record<string, number> = {};
    return {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        const key = `${input.provider}:${input.action}`;
        const seq = plan[key] ?? [{ ok: true, output: null, reason: null }];
        const i = idx[key] ?? 0;
        idx[key] = i + 1;
        return seq[Math.min(i, seq.length - 1)]!;
      },
    };
  }

  const UPLOAD_OK: StepRunOutcome = { ok: true, output: { itemId: WB_ID, name: `${MARKER}workbook.xlsx` }, reason: null };
  const WORKSHEETS_WITH_MARKER: StepRunOutcome = {
    ok: true,
    output: { worksheets: [{ name: "Sheet1" }, { name: `${MARKER}ws` }], count: 2 },
    reason: null,
  };

  // ─── Shape ───────────────────────────────────────────────────────────────────

  describe("excel:create_worksheet — fixture shape", () => {
    it("is a destructiveSafe Excel write that bootstraps via OneDrive upload + cleans via OneDrive delete", () => {
      const f = fixture();
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.liveSafe).toBe(false);
      expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_EXCEL_CONNECTED", "SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"]);
      // setup uploads a workbook via OneDrive (inline base64), captured as "workbook".
      expect(f.writeHarness?.setup?.[0]?.provider).toBe("microsoft-onedrive");
      expect(f.writeHarness?.setup?.[0]?.action).toBe("upload_file");
      expect(f.writeHarness?.setup?.[0]?.config.contentEncoding).toBe("base64");
      expect(f.writeHarness?.setup?.[0]?.captureResource).toEqual({
        resourceKey: "workbook",
        idPath: "itemId",
        kind: "workbook",
      });
      // execute adds a marker-named worksheet to the captured workbook.
      expect(f.config.workbookId).toBe("{{ledger.workbook.id}}");
      expect(f.config.name).toBe("{{smokeMarker}}ws");
      // verify is an INDEPENDENT get_worksheets read-back, marker + suffix "ws".
      expect(f.writeHarness?.verify?.action).toBe("get_worksheets");
      expect(f.writeHarness?.verify?.markerPath).toBe("worksheets");
      expect(f.writeHarness?.verify?.markerSuffix).toBe("ws");
      // cleanup deletes the WHOLE workbook via OneDrive (same provider -> not cross-provider).
      expect(f.writeHarness?.cleanup?.provider).toBe("microsoft-onedrive");
      expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
      expect(f.writeHarness?.cleanupKind).toBe("delete");
      expect(f.writeHarness?.crossProviderCleanup).toBeUndefined();
    });
  });

  // ─── Orchestration ─────────────────────────────────────────────────────────────

  describe("excel:create_worksheet — orchestration", () => {
    it("PASS: upload -> create_worksheet -> independent get_worksheets marker -> delete (cleaned, 0 leaked)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:create_worksheet": [{ ok: true, output: { name: `${MARKER}ws` }, reason: null }],
        "microsoft-excel:get_worksheets": [WORKSHEETS_WITH_MARKER],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger).toMatchObject({ created: 1, cleaned: 1, leaked: 0, kinds: ["workbook"] });
      // The Excel action + verify + delete all targeted the captured workbook id.
      expect(deps.calls.find((c) => c.action === "create_worksheet")?.config.workbookId).toBe(WB_ID);
      expect(deps.calls.find((c) => c.action === "get_worksheets")?.config.workbookId).toBe(WB_ID);
      expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe(WB_ID);
      // The new worksheet name carried the run marker.
      expect(deps.calls.find((c) => c.action === "create_worksheet")?.config.name).toBe(`${MARKER}ws`);
    });

    it("VERIFY_FAILED: get_worksheets lacks the marker worksheet (cleanup still runs, 0 leaked)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:create_worksheet": [{ ok: true, output: null, reason: null }],
        "microsoft-excel:get_worksheets": [{ ok: true, output: { worksheets: [{ name: "Sheet1" }], count: 1 }, reason: null }],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
      expect(res.ledger.leaked).toBe(0); // cleanup still removed the workbook
    });

    it("cleanup absorbs a workbook-session delete LOCK via the bounded OneDrive retry -> 0 leaked", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:create_worksheet": [{ ok: true, output: null, reason: null }],
        "microsoft-excel:get_worksheets": [WORKSHEETS_WITH_MARKER],
        "microsoft-onedrive:delete_item": [
          { ok: false, output: null, reason: "The resource you are attempting to access is locked" },
          { ok: false, output: null, reason: "The resource you are attempting to access is locked" },
          { ok: true, output: null, reason: null },
        ],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.filter((c) => c.action === "delete_item")).toHaveLength(3); // retried within bounds
    });

    it("CLEANUP_FAILED (not masked) when the workbook delete keeps failing after bounded retries", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:create_worksheet": [{ ok: true, output: null, reason: null }],
        "microsoft-excel:get_worksheets": [WORKSHEETS_WITH_MARKER],
        "microsoft-onedrive:delete_item": [{ ok: false, output: null, reason: "server error 500" }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("CLEANUP_FAILED");
      expect(res.ledger.leaked).toBe(1);
    });
  });

  // ─── Frozen asset ──────────────────────────────────────────────────────────────

  describe("minimal .xlsx bootstrap asset", () => {
    it("is a valid OOXML zip package (PK header, non-trivial size)", () => {
      const buf = Buffer.from(MINIMAL_XLSX_BASE64, "base64");
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf.slice(0, 2).toString("latin1")).toBe("PK"); // zip local-file-header magic
    });

    it("matches the byte length verified live as openable by Graph's workbook API", () => {
      expect(Buffer.from(MINIMAL_XLSX_BASE64, "base64").length).toBe(1898);
    });

    it("contains the core OOXML workbook parts", () => {
      const raw = Buffer.from(MINIMAL_XLSX_BASE64, "base64").toString("latin1");
      expect(raw).toContain("[Content_Types].xml");
      expect(raw).toContain("xl/workbook.xml");
      expect(raw).toContain("xl/worksheets/sheet1.xml");
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former excel-delete-row.test.ts
// ---------------------------------------------------------------------------
describe("excel-delete-row", () => {

  const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true, sleep: async () => {} } as const;
  const MARKER = "crsmoke-T1-";
  const WB_ID = "wb-1";
  const env = (): string | undefined => "x"; // _CONNECTED signals are filtered from the target gate

  const fixture = (): ActionSmokeFixture =>
    WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "microsoft-excel:delete_row")!;

  interface RecordingDeps extends WriteHarnessDeps {
    readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  }

  function depsWith(plan: Record<string, readonly StepRunOutcome[]>): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    const idx: Record<string, number> = {};
    return {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        const key = `${input.provider}:${input.action}`;
        const seq = plan[key] ?? [{ ok: true, output: null, reason: null }];
        const i = idx[key] ?? 0;
        idx[key] = i + 1;
        return seq[Math.min(i, seq.length - 1)]!;
      },
    };
  }

  const cell = (v: string | null): StepRunOutcome => ({ ok: true, output: { address: "Sheet1!x", values: [[v]] }, reason: null });
  const range3 = (a1: string | null, a2: string | null, a3: string | null): StepRunOutcome => ({
    ok: true,
    output: { address: "Sheet1!A1:A3", values: [[a1], [a2], [a3]] },
    reason: null,
  });

  const UPLOAD_OK: StepRunOutcome = { ok: true, output: { itemId: WB_ID, name: `${MARKER}workbook.xlsx` }, reason: null };
  const ADD_OK: StepRunOutcome = { ok: true, output: { updatedRange: "Sheet1!A1" }, reason: null };
  const DELETE_OK: StepRunOutcome = { ok: true, output: { deleted: true, address: "2:2" }, reason: null };

  // read_range is called 3x in order: A1, A2, A1:A3. Post-delete (row 2 removed, shift up).
  const READS_AFTER_DELETE: readonly StepRunOutcome[] = [
    cell(`${MARKER}keep-before`), // A1 unchanged
    cell(`${MARKER}keep-after`), // A2 == old A3 (shifted up)
    range3(`${MARKER}keep-before`, `${MARKER}keep-after`, null), // A1:A3 — delete-me gone
  ];

  describe("excel:delete_row — fixture shape", () => {
    it("is a destructiveSafe Excel delete that seeds 3 rows + proves the shift, cleans via OneDrive delete", () => {
      const f = fixture();
      expect(f).toBeDefined();
      expect(f.risk).toBe("destructive");
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.liveSafe).toBe(false);
      expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_EXCEL_CONNECTED", "SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"]);
      // setup: upload (capture) + 3 add_row seeds.
      expect(f.writeHarness?.setup?.[0]?.action).toBe("upload_file");
      expect(f.writeHarness?.setup?.[0]?.captureResource?.resourceKey).toBe("workbook");
      expect(f.writeHarness?.setup?.map((s) => s.action)).toEqual(["upload_file", "add_row", "add_row", "add_row"]);
      expect(f.writeHarness?.setup?.[1]?.config.values).toEqual(["{{smokeMarker}}keep-before"]);
      expect(f.writeHarness?.setup?.[2]?.config.values).toEqual(["{{smokeMarker}}delete-me"]);
      expect(f.writeHarness?.setup?.[3]?.config.values).toEqual(["{{smokeMarker}}keep-after"]);
      // execute deletes row 2 by position.
      expect(f.config.rowNumber).toBe(2);
      expect(f.config.worksheetName).toBe("Sheet1");
      // verifyAll: 3 independent read_range reads that pin row 2.
      const va = f.writeHarness?.verifyAll ?? [];
      expect(va).toHaveLength(3);
      expect(va[0]).toMatchObject({ action: "read_range", config: { address: "A1" }, markerPath: "values", markerSuffix: "keep-before" });
      expect(va[1]).toMatchObject({ action: "read_range", config: { address: "A2" }, markerPath: "values", markerSuffix: "keep-after" });
      expect(va[2]).toMatchObject({ action: "read_range", config: { address: "A1:A3" }, expectAbsent: { path: "values", value: "{{smokeMarker}}delete-me" } });
      expect(f.writeHarness?.cleanup?.provider).toBe("microsoft-onedrive");
      expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
      expect(f.writeHarness?.crossProviderCleanup).toBeUndefined();
    });
  });

  describe("excel:delete_row — orchestration", () => {
    it("PASS: seed 3 rows -> delete row 2 -> verifyAll pins the shift -> delete (cleaned, 0 leaked)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_row": [ADD_OK, ADD_OK, ADD_OK],
        "microsoft-excel:delete_row": [DELETE_OK],
        "microsoft-excel:read_range": READS_AFTER_DELETE,
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger).toMatchObject({ created: 1, cleaned: 1, leaked: 0, kinds: ["workbook"] });
      expect(deps.calls.filter((c) => c.action === "add_row")).toHaveLength(3);
      expect(deps.calls.find((c) => c.action === "delete_row")?.config.rowNumber).toBe(2);
      expect(deps.calls.filter((c) => c.action === "read_range")).toHaveLength(3);
      expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe(WB_ID);
    });

    it("VERIFY_FAILED on a no-op: A2 still holds delete-me (fails the keep-after suffix + expectAbsent)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_row": [ADD_OK, ADD_OK, ADD_OK],
        "microsoft-excel:delete_row": [DELETE_OK],
        // No-op: nothing shifted -> A1 keep-before, A2 delete-me, A1:A3 still has delete-me.
        "microsoft-excel:read_range": [
          cell(`${MARKER}keep-before`),
          cell(`${MARKER}delete-me`),
          range3(`${MARKER}keep-before`, `${MARKER}delete-me`, `${MARKER}keep-after`),
        ],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
      expect(res.ledger.leaked).toBe(0);
    });

    it("VERIFY_FAILED on a WRONG-row delete: row 1 deleted -> A1 no longer keep-before", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_row": [ADD_OK, ADD_OK, ADD_OK],
        "microsoft-excel:delete_row": [DELETE_OK],
        // Row 1 deleted instead -> A1=delete-me, A2=keep-after, A3 empty.
        "microsoft-excel:read_range": [
          cell(`${MARKER}delete-me`),
          cell(`${MARKER}keep-after`),
          range3(`${MARKER}delete-me`, `${MARKER}keep-after`, null),
        ],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("VERIFY_FAILED"); // A1 markerSuffix keep-before fails; A1:A3 still has delete-me
      expect(res.ledger.leaked).toBe(0);
    });

    it("cleanup absorbs a workbook-session delete LOCK via the bounded OneDrive retry -> 0 leaked", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_row": [ADD_OK, ADD_OK, ADD_OK],
        "microsoft-excel:delete_row": [DELETE_OK],
        "microsoft-excel:read_range": READS_AFTER_DELETE,
        "microsoft-onedrive:delete_item": [
          { ok: false, output: null, reason: "The resource you are attempting to access is locked" },
          { ok: true, output: null, reason: null },
        ],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.filter((c) => c.action === "delete_item")).toHaveLength(2);
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former excel-delete-worksheet.test.ts
// ---------------------------------------------------------------------------
describe("excel-delete-worksheet", () => {

  const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true, sleep: async () => {} } as const;
  const MARKER = "crsmoke-T1-";
  const WB_ID = "wb-1";
  const env = (): string | undefined => "x"; // _CONNECTED signals are filtered from the target gate

  const fixture = (): ActionSmokeFixture =>
    WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "microsoft-excel:delete_worksheet")!;

  interface RecordingDeps extends WriteHarnessDeps {
    readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  }

  function depsWith(plan: Record<string, readonly StepRunOutcome[]>): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    const idx: Record<string, number> = {};
    return {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        const key = `${input.provider}:${input.action}`;
        const seq = plan[key] ?? [{ ok: true, output: null, reason: null }];
        const i = idx[key] ?? 0;
        idx[key] = i + 1;
        return seq[Math.min(i, seq.length - 1)]!;
      },
    };
  }

  const UPLOAD_OK: StepRunOutcome = { ok: true, output: { itemId: WB_ID, name: `${MARKER}workbook.xlsx` }, reason: null };
  const CREATE_VICTIM_OK: StepRunOutcome = { ok: true, output: { name: `${MARKER}victim` }, reason: null };
  const DELETE_OK: StepRunOutcome = { ok: true, output: { deleted: true }, reason: null };
  // After deleting the victim, only the seeded Sheet1 remains.
  const WORKSHEETS_AFTER_DELETE: StepRunOutcome = {
    ok: true,
    output: { worksheets: [{ name: "Sheet1" }], count: 1 },
    reason: null,
  };

  describe("excel:delete_worksheet — fixture shape", () => {
    it("is a destructiveSafe Excel delete that seeds a 2nd sheet + cleans via OneDrive delete", () => {
      const f = fixture();
      expect(f).toBeDefined();
      expect(f.risk).toBe("destructive");
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.liveSafe).toBe(false);
      expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_EXCEL_CONNECTED", "SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"]);
      // setup#1 uploads the workbook; setup#2 adds the victim worksheet so 2 sheets exist.
      expect(f.writeHarness?.setup?.[0]?.action).toBe("upload_file");
      expect(f.writeHarness?.setup?.[0]?.captureResource?.resourceKey).toBe("workbook");
      expect(f.writeHarness?.setup?.[1]?.provider).toBe("microsoft-excel");
      expect(f.writeHarness?.setup?.[1]?.action).toBe("create_worksheet");
      expect(f.writeHarness?.setup?.[1]?.config.name).toBe("{{smokeMarker}}victim");
      // execute deletes the victim by name.
      expect(f.config.workbookId).toBe("{{ledger.workbook.id}}");
      expect(f.config.worksheetName).toBe("{{smokeMarker}}victim");
      // verify: victim ABSENT + exactly one sheet remains.
      expect(f.writeHarness?.verify?.action).toBe("get_worksheets");
      expect(f.writeHarness?.verify?.expectAbsent).toEqual({ path: "worksheets", value: "{{smokeMarker}}victim" });
      expect(f.writeHarness?.verify?.expectEquals).toEqual({ path: "count", value: 1 });
      expect(f.writeHarness?.cleanup?.provider).toBe("microsoft-onedrive");
      expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
      expect(f.writeHarness?.crossProviderCleanup).toBeUndefined();
    });
  });

  describe("excel:delete_worksheet — orchestration", () => {
    it("PASS: upload -> add victim -> delete victim -> independent get_worksheets (absent + count==1) -> delete (cleaned, 0 leaked)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:create_worksheet": [CREATE_VICTIM_OK],
        "microsoft-excel:delete_worksheet": [DELETE_OK],
        "microsoft-excel:get_worksheets": [WORKSHEETS_AFTER_DELETE],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger).toMatchObject({ created: 1, cleaned: 1, leaked: 0, kinds: ["workbook"] });
      // setup added the victim; execute deleted it by name; cleanup removed the captured workbook.
      expect(deps.calls.find((c) => c.action === "create_worksheet")?.config.name).toBe(`${MARKER}victim`);
      expect(deps.calls.find((c) => c.action === "delete_worksheet")?.config.worksheetName).toBe(`${MARKER}victim`);
      expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe(WB_ID);
    });

    it("VERIFY_FAILED: the victim is STILL present on read-back (expectAbsent catches a no-op delete)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:create_worksheet": [CREATE_VICTIM_OK],
        "microsoft-excel:delete_worksheet": [DELETE_OK],
        "microsoft-excel:get_worksheets": [
          { ok: true, output: { worksheets: [{ name: "Sheet1" }, { name: `${MARKER}victim` }], count: 2 }, reason: null },
        ],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true); // cleanup still runs
      expect(res.ledger.leaked).toBe(0);
    });

    it("VERIFY_FAILED: count is wrong even though the victim is absent (survivor / validity check)", async () => {
      // victim absent satisfies expectAbsent, but count==0 (no sheet left) fails expectEquals.
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:create_worksheet": [CREATE_VICTIM_OK],
        "microsoft-excel:delete_worksheet": [DELETE_OK],
        "microsoft-excel:get_worksheets": [{ ok: true, output: { worksheets: [], count: 0 }, reason: null }],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(res.ledger.leaked).toBe(0);
    });

    it("cleanup absorbs a workbook-session delete LOCK via the bounded OneDrive retry -> 0 leaked", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:create_worksheet": [CREATE_VICTIM_OK],
        "microsoft-excel:delete_worksheet": [DELETE_OK],
        "microsoft-excel:get_worksheets": [WORKSHEETS_AFTER_DELETE],
        "microsoft-onedrive:delete_item": [
          { ok: false, output: null, reason: "The resource you are attempting to access is locked" },
          { ok: true, output: null, reason: null },
        ],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.filter((c) => c.action === "delete_item")).toHaveLength(2);
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former excel-rename-worksheet.test.ts
// ---------------------------------------------------------------------------
describe("excel-rename-worksheet", () => {

  const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true, sleep: async () => {} } as const;
  const MARKER = "crsmoke-T1-";
  const WB_ID = "wb-1";
  const env = (): string | undefined => "x"; // _CONNECTED signals are filtered from the target gate

  const fixture = (): ActionSmokeFixture =>
    WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "microsoft-excel:rename_worksheet")!;

  interface RecordingDeps extends WriteHarnessDeps {
    readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  }

  function depsWith(plan: Record<string, readonly StepRunOutcome[]>): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    const idx: Record<string, number> = {};
    return {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        const key = `${input.provider}:${input.action}`;
        const seq = plan[key] ?? [{ ok: true, output: null, reason: null }];
        const i = idx[key] ?? 0;
        idx[key] = i + 1;
        return seq[Math.min(i, seq.length - 1)]!;
      },
    };
  }

  const UPLOAD_OK: StepRunOutcome = { ok: true, output: { itemId: WB_ID, name: `${MARKER}workbook.xlsx` }, reason: null };
  const WORKSHEETS_RENAMED: StepRunOutcome = {
    ok: true,
    output: { worksheets: [{ name: `${MARKER}renamed` }], count: 1 },
    reason: null,
  };

  describe("excel:rename_worksheet — fixture shape", () => {
    it("is a destructiveSafe Excel write that renames seeded Sheet1 + cleans via OneDrive delete", () => {
      const f = fixture();
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.liveSafe).toBe(false);
      expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_EXCEL_CONNECTED", "SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"]);
      expect(f.writeHarness?.setup?.[0]?.action).toBe("upload_file");
      expect(f.writeHarness?.setup?.[0]?.captureResource?.resourceKey).toBe("workbook");
      // execute renames the seeded Sheet1 to a marker name.
      expect(f.config.workbookId).toBe("{{ledger.workbook.id}}");
      expect(f.config.worksheetName).toBe("Sheet1");
      expect(f.config.newWorksheetName).toBe("{{smokeMarker}}renamed");
      // verify is an INDEPENDENT get_worksheets read-back, marker + suffix "renamed".
      expect(f.writeHarness?.verify?.action).toBe("get_worksheets");
      expect(f.writeHarness?.verify?.markerPath).toBe("worksheets");
      expect(f.writeHarness?.verify?.markerSuffix).toBe("renamed");
      expect(f.writeHarness?.cleanup?.provider).toBe("microsoft-onedrive");
      expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
      expect(f.writeHarness?.crossProviderCleanup).toBeUndefined();
    });
  });

  describe("excel:rename_worksheet — orchestration", () => {
    it("PASS: upload -> rename Sheet1 -> independent get_worksheets marker -> delete (cleaned, 0 leaked)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:rename_worksheet": [{ ok: true, output: { renamed: true, newWorksheetName: `${MARKER}renamed` }, reason: null }],
        "microsoft-excel:get_worksheets": [WORKSHEETS_RENAMED],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger).toMatchObject({ created: 1, cleaned: 1, leaked: 0, kinds: ["workbook"] });
      // rename addressed Sheet1 -> marker name; verify + delete targeted the captured workbook.
      expect(deps.calls.find((c) => c.action === "rename_worksheet")?.config.worksheetName).toBe("Sheet1");
      expect(deps.calls.find((c) => c.action === "rename_worksheet")?.config.newWorksheetName).toBe(`${MARKER}renamed`);
      expect(deps.calls.find((c) => c.action === "rename_worksheet")?.config.workbookId).toBe(WB_ID);
      expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe(WB_ID);
    });

    it("VERIFY_FAILED: read-back still shows the un-renamed Sheet1 (cleanup still runs, 0 leaked)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:rename_worksheet": [{ ok: true, output: null, reason: null }],
        "microsoft-excel:get_worksheets": [{ ok: true, output: { worksheets: [{ name: "Sheet1" }], count: 1 }, reason: null }],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
      expect(res.ledger.leaked).toBe(0);
    });

    it("cleanup absorbs a workbook-session delete LOCK via the bounded OneDrive retry -> 0 leaked", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:rename_worksheet": [{ ok: true, output: null, reason: null }],
        "microsoft-excel:get_worksheets": [WORKSHEETS_RENAMED],
        "microsoft-onedrive:delete_item": [
          { ok: false, output: null, reason: "The resource you are attempting to access is locked" },
          { ok: true, output: null, reason: null },
        ],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.filter((c) => c.action === "delete_item")).toHaveLength(2); // retried within bounds
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former excel-update-row.test.ts
// ---------------------------------------------------------------------------
describe("excel-update-row", () => {

  const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true, sleep: async () => {} } as const;
  const MARKER = "crsmoke-T1-";
  const WB_ID = "wb-1";
  const env = (): string | undefined => "x"; // _CONNECTED signals are filtered from the target gate

  const fixture = (): ActionSmokeFixture =>
    WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "microsoft-excel:update_row")!;

  interface RecordingDeps extends WriteHarnessDeps {
    readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  }

  function depsWith(plan: Record<string, readonly StepRunOutcome[]>): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    const idx: Record<string, number> = {};
    return {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        const key = `${input.provider}:${input.action}`;
        const seq = plan[key] ?? [{ ok: true, output: null, reason: null }];
        const i = idx[key] ?? 0;
        idx[key] = i + 1;
        return seq[Math.min(i, seq.length - 1)]!;
      },
    };
  }

  const UPLOAD_OK: StepRunOutcome = { ok: true, output: { itemId: WB_ID, name: `${MARKER}workbook.xlsx` }, reason: null };
  const ADD_OK: StepRunOutcome = { ok: true, output: { updatedRange: "Sheet1!A1" }, reason: null };
  const UPDATE_OK: StepRunOutcome = { ok: true, output: { columnsUpdated: 1, address: "Sheet1!A2" }, reason: null };
  // read_range A2 returns the UPDATED cell value (marker + suffix "updated").
  const READ_UPDATED: StepRunOutcome = {
    ok: true,
    output: { address: "Sheet1!A2", values: [[`${MARKER}updated`]] },
    reason: null,
  };

  describe("excel:update_row — fixture shape", () => {
    it("is a destructiveSafe Excel write that seeds header+data then updates row 2, cleans via OneDrive delete", () => {
      const f = fixture();
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.liveSafe).toBe(false);
      expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_EXCEL_CONNECTED", "SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"]);
      // setup: upload (capture workbook) -> add header row -> add seed data row.
      expect(f.writeHarness?.setup?.[0]?.action).toBe("upload_file");
      expect(f.writeHarness?.setup?.[0]?.captureResource?.resourceKey).toBe("workbook");
      expect(f.writeHarness?.setup?.[1]?.action).toBe("add_row");
      expect(f.writeHarness?.setup?.[1]?.config.values).toEqual(["Col"]);
      expect(f.writeHarness?.setup?.[2]?.action).toBe("add_row");
      expect(f.writeHarness?.setup?.[2]?.config.values).toEqual(["{{smokeMarker}}seed"]);
      // execute updates row 2's "Col" cell to the marker+updated value.
      expect(f.config.workbookId).toBe("{{ledger.workbook.id}}");
      expect(f.config.worksheetName).toBe("Sheet1");
      expect(f.config.rowNumber).toBe(2);
      expect(f.config.values).toEqual({ Col: "{{smokeMarker}}updated" });
      // verify is an INDEPENDENT read_range A2 read-back, marker + suffix "updated".
      expect(f.writeHarness?.verify?.action).toBe("read_range");
      expect(f.writeHarness?.verify?.config).toMatchObject({ worksheetName: "Sheet1", address: "A2" });
      expect(f.writeHarness?.verify?.markerPath).toBe("values");
      expect(f.writeHarness?.verify?.markerSuffix).toBe("updated");
      expect(f.writeHarness?.cleanup?.provider).toBe("microsoft-onedrive");
      expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
      expect(f.writeHarness?.crossProviderCleanup).toBeUndefined();
    });
  });

  describe("excel:update_row — orchestration", () => {
    it("PASS: seed header+data -> update row 2 -> independent read_range A2 (marker+updated) -> delete (cleaned, 0 leaked)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_row": [ADD_OK, ADD_OK],
        "microsoft-excel:update_row": [UPDATE_OK],
        "microsoft-excel:read_range": [READ_UPDATED],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.artifact).toBe("cleaned");
      expect(res.ledger).toMatchObject({ created: 1, cleaned: 1, leaked: 0, kinds: ["workbook"] });
      // two add_row setup calls (header + seed), then the update targets row 2 Col.
      expect(deps.calls.filter((c) => c.action === "add_row")).toHaveLength(2);
      const upd = deps.calls.find((c) => c.action === "update_row");
      expect(upd?.config.rowNumber).toBe(2);
      expect(upd?.config.values).toEqual({ Col: `${MARKER}updated` });
      expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe(WB_ID);
    });

    it("VERIFY_FAILED on a no-op: read-back A2 still shows the SEED (marker without 'updated' suffix)", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_row": [ADD_OK, ADD_OK],
        "microsoft-excel:update_row": [UPDATE_OK],
        // A2 still holds the seed -> contains the run marker but NOT "<marker>updated".
        "microsoft-excel:read_range": [{ ok: true, output: { address: "Sheet1!A2", values: [[`${MARKER}seed`]] }, reason: null }],
        "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("VERIFY_FAILED");
      expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
      expect(res.ledger.leaked).toBe(0);
    });

    it("cleanup absorbs a workbook-session delete LOCK via the bounded OneDrive retry -> 0 leaked", async () => {
      const deps = depsWith({
        "microsoft-onedrive:upload_file": [UPLOAD_OK],
        "microsoft-excel:add_row": [ADD_OK, ADD_OK],
        "microsoft-excel:update_row": [UPDATE_OK],
        "microsoft-excel:read_range": [READ_UPDATED],
        "microsoft-onedrive:delete_item": [
          { ok: false, output: null, reason: "The resource you are attempting to access is locked" },
          { ok: true, output: null, reason: null },
        ],
      });
      const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
      expect(res.status).toBe("PASS");
      expect(res.ledger.leaked).toBe(0);
      expect(deps.calls.filter((c) => c.action === "delete_item")).toHaveLength(2);
    });
  });

});
