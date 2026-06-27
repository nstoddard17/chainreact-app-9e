/**
 * @jest-environment node
 *
 * Write smoke harness — Microsoft Excel rename_worksheet (SMOKE-WRITE-37).
 *
 * Reuses the SMOKE-WRITE-36 bootstrap: setup uploads a frozen minimal .xlsx (seeded
 * "Sheet1") via onedrive:upload_file, execute renames "Sheet1" to "{{marker}}renamed",
 * verify reads it back independently via excel:get_worksheets, cleanup hard-deletes the
 * whole file via onedrive:delete_item. Driven through the pure `runWriteSmoke`
 * orchestrator over a FAKE boundary (no DB / no provider).
 *
 * Protects:
 *   - the rename targets the seeded "Sheet1" and the WHOLE file is the cleanup unit
 *     (created 1 / cleaned 1 / 0 leaked);
 *   - verify proves the marker(+suffix "renamed") on an INDEPENDENT get_worksheets
 *     read-back (a no-op that left "Sheet1" fails);
 *   - cleanup is same-provider OneDrive delete and absorbs a workbook-session lock via
 *     the bounded OneDrive delete retry.
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
