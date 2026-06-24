/**
 * @jest-environment node
 *
 * Write smoke harness — Google Sheets row/range mutators (SMOKE-WRITE-27).
 *
 * Pins the three new Sheets WRITE fixtures WITHOUT a real DB/provider, driving each
 * through the pure `runWriteSmoke` orchestrator over a FAKE boundary (mock only the
 * external seam; run the real gate / ledger / phase / verify logic). Protects the
 * contracts that matter for mutating a SAME-RUN smoke-owned spreadsheet:
 *   - setup creates a WHOLE smoke spreadsheet (pinned sheet "Data") and captures its
 *     spreadsheetId; every mutation targets only that sheet;
 *   - the mutation is verified by an INDEPENDENT get_cell_value read-back of the live
 *     cell value (NOT the handler's `updated`/`updatedRange` echo), with a marker
 *     suffix proving the SPECIFIC written value (update_row's "updated" suffix proves
 *     the overwrite landed over the seeded "seed");
 *   - cleanup is a CROSS-PROVIDER google-drive:delete_file of the whole spreadsheet
 *     (declared via crossProviderCleanup) — leaked 0, cleaned == created (1);
 *   - a read-back without the right marker is VERIFY_FAILED (no vacuous pass).
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
