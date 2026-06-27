/**
 * @jest-environment node
 *
 * Write smoke harness — Microsoft Excel create_worksheet (SMOKE-WRITE-36).
 *
 * Excel has no create_workbook action, so the fixture brings its OWN smoke-owned
 * workbook: setup uploads a frozen minimal .xlsx via onedrive:upload_file, execute adds
 * a marker-named worksheet, verify reads it back independently via excel:get_worksheets,
 * cleanup hard-deletes the whole file via onedrive:delete_item. Driven through the pure
 * `runWriteSmoke` orchestrator over a FAKE boundary (no DB / no provider).
 *
 * Protects:
 *   - the workbook is created + captured by OneDrive upload, the Excel action targets it,
 *     and the WHOLE file is the cleanup unit (created 1 / cleaned 1 / 0 leaked);
 *   - verify proves the marker on an INDEPENDENT get_worksheets read-back (not the echo);
 *   - cleanup is same-provider OneDrive delete (not cross-provider) and absorbs a
 *     workbook-session delete LOCK via the bounded OneDrive delete retry;
 *   - the frozen minimal .xlsx asset is a valid, openable OOXML package.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { MINIMAL_XLSX_BASE64 } from "@/tests/smoke-actions/minimalXlsx";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true, sleep: async () => {} } as const;
const MARKER = "crsmoke-T1-";
const WB_ID = "wb-1";
// Both connection signals are filtered out of the target-env gate (they end in _CONNECTED),
// so any non-empty env keeps the run off BLOCKED_ENV; there is no target id to resolve.
const env = (): string | undefined => "x";

const fixture = (): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "microsoft-excel:create_worksheet")!;

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
const WORKSHEETS_WITH_MARKER: StepRunOutcome = {
  ok: true,
  output: { worksheets: [{ name: "Sheet1" }, { name: `${MARKER}ws` }], count: 2 },
  reason: null,
};

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("excel:create_worksheet — fixture shape", () => {
  it("is a destructiveSafe Excel write that bootstraps via OneDrive upload + cleans via OneDrive delete", () => {
    const f = fixture();
    expect(f).toBeDefined();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_EXCEL_CONNECTED", "SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"]);
    // setup uploads a workbook via OneDrive (inline base64), captured as "workbook".
    expect(f.writeHarness?.setup?.[0]?.provider).toBe("microsoft-onedrive");
    expect(f.writeHarness?.setup?.[0]?.action).toBe("upload_file");
    expect(f.writeHarness?.setup?.[0]?.config.contentEncoding).toBe("base64");
    expect(f.writeHarness?.setup?.[0]?.captureResource).toEqual({
      resourceKey: "workbook",
      idPath: "itemId",
      kind: "workbook",
    });
    // execute adds a marker-named worksheet to the captured workbook.
    expect(f.config.workbookId).toBe("{{ledger.workbook.id}}");
    expect(f.config.name).toBe("{{smokeMarker}}ws");
    // verify is an INDEPENDENT get_worksheets read-back, marker + suffix "ws".
    expect(f.writeHarness?.verify?.action).toBe("get_worksheets");
    expect(f.writeHarness?.verify?.markerPath).toBe("worksheets");
    expect(f.writeHarness?.verify?.markerSuffix).toBe("ws");
    // cleanup deletes the WHOLE workbook via OneDrive (same provider -> not cross-provider).
    expect(f.writeHarness?.cleanup?.provider).toBe("microsoft-onedrive");
    expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
    expect(f.writeHarness?.crossProviderCleanup).toBeUndefined();
  });
});

// ─── Orchestration ─────────────────────────────────────────────────────────────

describe("excel:create_worksheet — orchestration", () => {
  it("PASS: upload -> create_worksheet -> independent get_worksheets marker -> delete (cleaned, 0 leaked)", async () => {
    const deps = depsWith({
      "microsoft-onedrive:upload_file": [UPLOAD_OK],
      "microsoft-excel:create_worksheet": [{ ok: true, output: { name: `${MARKER}ws` }, reason: null }],
      "microsoft-excel:get_worksheets": [WORKSHEETS_WITH_MARKER],
      "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
    });
    const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger).toMatchObject({ created: 1, cleaned: 1, leaked: 0, kinds: ["workbook"] });
    // The Excel action + verify + delete all targeted the captured workbook id.
    expect(deps.calls.find((c) => c.action === "create_worksheet")?.config.workbookId).toBe(WB_ID);
    expect(deps.calls.find((c) => c.action === "get_worksheets")?.config.workbookId).toBe(WB_ID);
    expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe(WB_ID);
    // The new worksheet name carried the run marker.
    expect(deps.calls.find((c) => c.action === "create_worksheet")?.config.name).toBe(`${MARKER}ws`);
  });

  it("VERIFY_FAILED: get_worksheets lacks the marker worksheet (cleanup still runs, 0 leaked)", async () => {
    const deps = depsWith({
      "microsoft-onedrive:upload_file": [UPLOAD_OK],
      "microsoft-excel:create_worksheet": [{ ok: true, output: null, reason: null }],
      "microsoft-excel:get_worksheets": [{ ok: true, output: { worksheets: [{ name: "Sheet1" }], count: 1 }, reason: null }],
      "microsoft-onedrive:delete_item": [{ ok: true, output: null, reason: null }],
    });
    const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
    expect(res.ledger.leaked).toBe(0); // cleanup still removed the workbook
  });

  it("cleanup absorbs a workbook-session delete LOCK via the bounded OneDrive retry -> 0 leaked", async () => {
    const deps = depsWith({
      "microsoft-onedrive:upload_file": [UPLOAD_OK],
      "microsoft-excel:create_worksheet": [{ ok: true, output: null, reason: null }],
      "microsoft-excel:get_worksheets": [WORKSHEETS_WITH_MARKER],
      "microsoft-onedrive:delete_item": [
        { ok: false, output: null, reason: "The resource you are attempting to access is locked" },
        { ok: false, output: null, reason: "The resource you are attempting to access is locked" },
        { ok: true, output: null, reason: null },
      ],
    });
    const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.filter((c) => c.action === "delete_item")).toHaveLength(3); // retried within bounds
  });

  it("CLEANUP_FAILED (not masked) when the workbook delete keeps failing after bounded retries", async () => {
    const deps = depsWith({
      "microsoft-onedrive:upload_file": [UPLOAD_OK],
      "microsoft-excel:create_worksheet": [{ ok: true, output: null, reason: null }],
      "microsoft-excel:get_worksheets": [WORKSHEETS_WITH_MARKER],
      "microsoft-onedrive:delete_item": [{ ok: false, output: null, reason: "server error 500" }],
    });
    const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("CLEANUP_FAILED");
    expect(res.ledger.leaked).toBe(1);
  });
});

// ─── Frozen asset ──────────────────────────────────────────────────────────────

describe("minimal .xlsx bootstrap asset", () => {
  it("is a valid OOXML zip package (PK header, non-trivial size)", () => {
    const buf = Buffer.from(MINIMAL_XLSX_BASE64, "base64");
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 2).toString("latin1")).toBe("PK"); // zip local-file-header magic
  });

  it("matches the byte length verified live as openable by Graph's workbook API", () => {
    expect(Buffer.from(MINIMAL_XLSX_BASE64, "base64").length).toBe(1898);
  });

  it("contains the core OOXML workbook parts", () => {
    const raw = Buffer.from(MINIMAL_XLSX_BASE64, "base64").toString("latin1");
    expect(raw).toContain("[Content_Types].xml");
    expect(raw).toContain("xl/workbook.xml");
    expect(raw).toContain("xl/worksheets/sheet1.xml");
  });
});
