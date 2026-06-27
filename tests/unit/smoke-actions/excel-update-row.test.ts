/**
 * @jest-environment node
 *
 * Write smoke harness — Microsoft Excel update_row (SMOKE-WRITE-40).
 *
 * update_row is HEADER-based, so the fixture seeds a header row + a data row before the
 * update: upload a frozen minimal .xlsx (empty "Sheet1") -> add_row ["Col"] (header at A1)
 * -> add_row ["{{marker}}seed"] (data at A2) -> update_row row 2 Col -> "{{marker}}updated"
 * -> verify independently via excel:read_range A2 (marker + suffix "updated") -> cleanup
 * hard-deletes the whole file via onedrive:delete_item. Driven through the pure
 * `runWriteSmoke` orchestrator over a FAKE boundary (no DB / no provider).
 *
 * NOT live-certified — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP. These offline tests pin the fixture shape + orchestration only.
 *
 * Protects:
 *   - setup seeds header + data row; execute updates the intended row (rowNumber 2);
 *   - verify proves the marker(+suffix "updated") and FAILS on a no-op (the seed lacks
 *     "updated");
 *   - cleanup is whole-workbook OneDrive delete (created 1 / cleaned 1 / 0 leaked) and
 *     absorbs a workbook-session lock via the bounded OneDrive delete retry.
 */
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
