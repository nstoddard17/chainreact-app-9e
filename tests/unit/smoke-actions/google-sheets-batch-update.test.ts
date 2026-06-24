/**
 * @jest-environment node
 *
 * Write smoke harness — Google Sheets batch_update (SMOKE-WRITE-30).
 *
 * Pins the batch_update WRITE fixture WITHOUT a real DB/provider, driving it through
 * the pure `runWriteSmoke` orchestrator over a FAKE boundary. batch_update is a TYPED
 * multi-range value write (NOT a raw requests[] passthrough), so the narrowest
 * deterministic request — one entry, one cell — is verifiable like update_cell:
 *   - setup creates a WHOLE smoke spreadsheet (pinned "Data") and captures its id;
 *   - execute writes exactly one cell (Data!A1) via a single batch update entry;
 *   - verify is an INDEPENDENT get_cell_value read-back of the live cell value (NOT the
 *     handler's responses/totalUpdated echo), marker+suffix "batch";
 *   - a read-back without the marker -> VERIFY_FAILED (no vacuous pass);
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
