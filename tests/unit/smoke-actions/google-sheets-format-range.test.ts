/**
 * @jest-environment node
 *
 * Write smoke harness — Google Sheets format_range (SMOKE-WRITE-29).
 *
 * Pins the format_range WRITE fixture WITHOUT a real DB/provider, driving it through
 * the pure `runWriteSmoke` orchestrator over a FAKE boundary. format_range's verify is
 * `smokeRead: true`, so it routes to `deps.smokeReadBack` (the bounded cell_format
 * reader), NOT the engine path — this test scripts that seam to prove:
 *   - setup creates a WHOLE smoke spreadsheet (pinned "Data") AND seeds A1, so the
 *     formatted cell is a real cell whose fresh state carries no bold;
 *   - format_range is verified by an INDEPENDENT smoke cell_format read-back asserting
 *     `bold == true` (NOT the handler's appliedFormat echo);
 *   - a read-back of bold:false / null -> VERIFY_FAILED (no vacuous pass);
 *   - a read-back seam ERROR (permission/API) -> VERIFY_FAILED (never read as formatted);
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
const SHEET_ID = "sheet-fmt";

const fixture = (): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "google-sheets:format_range")!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown>; via: "engine" | "smoke" }[];
}

/** Fake boundary: scripted runActionStep (engine) + scripted smokeReadBack. */
function depsWith(
  plan: Record<string, StepRunOutcome>,
  smokePlan: Record<string, StepRunOutcome> = {},
): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ ...input, config: { ...input.config }, via: "engine" });
      return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
    },
    async smokeReadBack(input) {
      calls.push({ ...input, config: { ...input.config }, via: "smoke" });
      return smokePlan[`${input.provider}:${input.action}`] ?? { ok: false, output: null, reason: "no reader" };
    },
  };
}

const enginePlan = (): Record<string, StepRunOutcome> => ({
  "google-sheets:create_spreadsheet": { ok: true, output: { spreadsheetId: SHEET_ID }, reason: null },
  "google-sheets:update_cell": { ok: true, output: { updated: true }, reason: null }, // seed
  "google-sheets:format_range": { ok: true, output: { appliedFormat: { bold: true } }, reason: null },
  "google-drive:delete_file": { ok: true, output: { success: true }, reason: null },
});

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("google-sheets:format_range: shape", () => {
  it("verifies via the SMOKE cell_format read-back (bounded), asserting bold==true", () => {
    const f = fixture();
    expect(f).toBeDefined();
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.requiredEnv).toEqual(["SMOKE_GOOGLE_SHEETS_CONNECTED"]);
    // execute applies a deterministic NON-default format.
    expect(f.config.range).toBe("A1"); // bare A1 per format_range schema
    expect(f.config.bold).toBe(true);
    // verify is the smoke-only bounded format reader, asserting bold == true.
    const v = f.writeHarness!.verify!;
    expect(v.action).toBe("cell_format");
    expect(v.smokeRead).toBe(true);
    expect(v.config).toEqual({ spreadsheetId: "{{ledger.sheet.id}}", range: "Data!A1" });
    expect(v.expectEquals).toEqual({ path: "bold", value: true });
    // cross-provider whole-spreadsheet teardown.
    expect(f.writeHarness?.crossProviderCleanup).toBe(true);
    expect(f.writeHarness?.cleanup?.provider).toBe("google-drive");
  });
});

// ─── Orchestration ────────────────────────────────────────────────────────────

describe("google-sheets:format_range orchestration", () => {
  it("PASS: create+seed -> format bold -> independent smoke cell_format bold==true -> Drive-delete (cleaned)", async () => {
    const deps = depsWith(enginePlan(), {
      "google-sheets:cell_format": { ok: true, output: { bold: true, italic: null, horizontalAlignment: null }, reason: null },
    });
    const res = await runWriteSmoke(fixture(), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(1);
    expect(res.ledger.cleaned).toBe(1);
    expect(res.ledger.leaked).toBe(0);
    // the format read-back went through the SMOKE seam (not the engine), against OUR sheet.
    const read = deps.calls.find((c) => c.action === "cell_format");
    expect(read?.via).toBe("smoke");
    expect(read?.config.spreadsheetId).toBe(SHEET_ID);
    expect(read?.config.range).toBe("Data!A1");
    expect(deps.calls.find((c) => c.action === "delete_file")?.config.fileId).toBe(SHEET_ID);
  });

  it("VERIFY_FAILED: read-back bold is false (format did not land; echo can't pass)", async () => {
    const deps = depsWith(enginePlan(), {
      "google-sheets:cell_format": { ok: true, output: { bold: false, italic: null, horizontalAlignment: null }, reason: null },
    });
    const res = await runWriteSmoke(fixture(), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_file")).toBe(true); // still cleaned up
  });

  it("VERIFY_FAILED: read-back bold is null (a fresh cell — proves no default vacuous pass)", async () => {
    const deps = depsWith(enginePlan(), {
      "google-sheets:cell_format": { ok: true, output: { bold: null, italic: null, horizontalAlignment: null }, reason: null },
    });
    const res = await runWriteSmoke(fixture(), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });

  it("VERIFY_FAILED: the smoke read-back STEP errors (permission/API) -> never read as formatted", async () => {
    const deps = depsWith(enginePlan(), {
      "google-sheets:cell_format": { ok: false, output: null, reason: "403 forbidden" },
    });
    const res = await runWriteSmoke(fixture(), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });

  it("FAIL: setup create fails -> no format, nothing created/leaked", async () => {
    const deps = depsWith({
      "google-sheets:create_spreadsheet": { ok: false, output: null, reason: "create boom" },
    });
    const res = await runWriteSmoke(fixture(), RUN, deps);
    expect(res.status).toBe("FAIL");
    expect(res.ledger.created).toBe(0);
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.some((c) => c.action === "format_range")).toBe(false);
  });
});
