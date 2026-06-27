/**
 * @jest-environment node
 *
 * Write smoke harness — Microsoft Excel delete_worksheet (SMOKE-WRITE-38).
 *
 * Reuses the SMOKE-WRITE-36 bootstrap, with a 2nd setup step: upload a frozen minimal
 * .xlsx (seeded "Sheet1") -> add a marker "victim" worksheet (so the delete is not the
 * last-sheet 400) -> delete the victim -> verify independently via excel:get_worksheets
 * that the victim is ABSENT and exactly one sheet remains -> cleanup hard-deletes the
 * whole file. Driven through the pure `runWriteSmoke` orchestrator over a FAKE boundary.
 *
 * Protects:
 *   - the new `expectAbsent` verify assertion (deleted name gone from the read-back);
 *   - paired `expectEquals count == 1` proves the survivor (Sheet1) + a valid workbook;
 *   - the WHOLE file is the cleanup unit (created 1 / cleaned 1 / 0 leaked);
 *   - cleanup absorbs a workbook-session lock via the bounded OneDrive delete retry.
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
