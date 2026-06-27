/**
 * @jest-environment node
 *
 * Write smoke harness — Microsoft Excel add_row (SMOKE-WRITE-39).
 *
 * Reuses the SMOKE-WRITE-36 bootstrap: upload a frozen minimal .xlsx (empty "Sheet1") ->
 * add_row appends ["{{marker}}row","x"] at A1:B1 (empty-sheet single-row mode) -> verify
 * independently via excel:read_range A1 -> cleanup hard-deletes the whole file via
 * onedrive:delete_item. Driven through the pure `runWriteSmoke` orchestrator over a FAKE
 * boundary (no DB / no provider).
 *
 * NOT live-certified — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP. These offline tests pin the fixture shape + orchestration only.
 *
 * Protects:
 *   - add_row targets the seeded empty "Sheet1" with positional values and the WHOLE file
 *     is the cleanup unit (created 1 / cleaned 1 / 0 leaked);
 *   - verify proves the marker(+suffix "row") on an INDEPENDENT read_range A1 read-back;
 *   - cleanup is same-provider OneDrive delete and absorbs a workbook-session lock via the
 *     bounded OneDrive delete retry.
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
