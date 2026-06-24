/**
 * @jest-environment node
 *
 * Write smoke harness — Google Sheets clear_range (SMOKE-WRITE-28).
 *
 * Pins the new clear_range WRITE fixture WITHOUT a real DB/provider, driving it
 * through the pure `runWriteSmoke` orchestrator over a FAKE boundary (mock only the
 * external seam; run the real gate / ledger / phase / verify logic). This is the
 * orchestration-level proof for the new `expectEmpty` verify primitive:
 *   - setup creates a WHOLE smoke spreadsheet (pinned "Data") AND seeds A1 with a
 *     distinct value, so the clear is provably a change (not empty -> empty);
 *   - clear_range is verified by an INDEPENDENT get_cell_value read-back asserting the
 *     cell `value` is PRESENT-but-EMPTY (null) — never the handler's `clearedRange` echo;
 *   - a still-set value -> VERIFY_FAILED (no vacuous pass);
 *   - a read-back STEP failure (permission/API error) -> VERIFY_FAILED (an error is
 *     never read as "cleared");
 *   - cleanup is a CROSS-PROVIDER google-drive:delete_file of the whole spreadsheet ->
 *     leaked 0, cleaned == created (1).
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
