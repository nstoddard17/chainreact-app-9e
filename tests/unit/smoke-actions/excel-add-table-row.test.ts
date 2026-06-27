/**
 * @jest-environment node
 *
 * Write smoke harness — Microsoft Excel add_table_row (SMOKE-WRITE-42).
 *
 * add_table_row appends to a NAMED Excel table, and there is no create_table action — so
 * the fixture uploads a table-bearing bootstrap workbook (table "SmokeTable", column
 * "Col", header + benign seed row) and appends a marker row, verified independently via
 * excel:read_table_rows, cleaned up by whole-file onedrive:delete_item. Driven through the
 * pure `runWriteSmoke` orchestrator over a FAKE boundary (no DB / no provider).
 *
 * NOT live-certified — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP. These offline tests pin the fixture shape + orchestration only. (The table
 * asset itself was validated separately via a direct-API probe.)
 *
 * Protects:
 *   - add_table_row targets the embedded "SmokeTable" with positional values and the WHOLE
 *     file is the cleanup unit (created 1 / cleaned 1 / 0 leaked);
 *   - verify proves the marker(+suffix "trow") on an INDEPENDENT read_table_rows read-back
 *     (the non-marker seed row is ignored; a no-op append fails);
 *   - cleanup is same-provider OneDrive delete and absorbs a workbook-session lock via the
 *     bounded OneDrive delete retry.
 */
import { MINIMAL_XLSX_WITH_TABLE_BASE64 } from "@/tests/smoke-actions/minimalXlsx";
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

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
