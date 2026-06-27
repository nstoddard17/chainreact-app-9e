/**
 * @jest-environment node
 *
 * Write smoke harness — Microsoft Excel delete_row (SMOKE-WRITE-41).
 *
 * delete_row is POSITION-based (row number, shift up). The fixture seeds 3 marker rows
 * via add_row, deletes the middle one, and proves EXACTLY row 2 was removed with 3
 * independent read_range reads: upload minimal .xlsx -> add A1 keep-before / A2 delete-me
 * / A3 keep-after -> delete_row row 2 -> verifyAll (A1==keep-before, A2==keep-after
 * shifted, A1:A3 lacks delete-me) -> cleanup whole-file onedrive:delete_item. Driven
 * through the pure `runWriteSmoke` orchestrator over a FAKE boundary (no DB / no provider).
 *
 * NOT live-certified — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP. These offline tests pin the fixture shape + orchestration only.
 *
 * Protects:
 *   - setup seeds 3 rows; execute deletes row 2; the verifyAll triple pins the shift;
 *   - a no-op (A2 still delete-me) AND a wrong-row delete both fail verification;
 *   - cleanup is whole-workbook OneDrive delete (created 1 / cleaned 1 / 0 leaked) with
 *     the bounded delete retry.
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
