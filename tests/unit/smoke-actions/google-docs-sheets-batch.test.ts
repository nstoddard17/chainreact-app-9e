/**
 * @jest-environment node
 *
 * Write smoke harness — Google Docs + Sheets create batch (SMOKE-WRITE-23).
 *
 * Pins the two new create fixtures WITHOUT a real DB/provider, driving each through
 * the pure `runWriteSmoke` orchestrator over a FAKE boundary. These are the first
 * CROSS-PROVIDER cleanup fixtures: a Google Doc / Sheet is a Drive file, so the
 * created resource is torn down via the certified `google-drive:delete_file`. The
 * tests prove:
 *   - create verifies the marker on an INDEPENDENT get read-back (not the create
 *     echo, whose `title` falls back to config);
 *   - cleanup dispatches to google-drive (cross-provider) and the run is cleaned;
 *   - the fixtures declare crossProviderCleanup (else the harness would refuse —
 *     covered in write-harness.test.ts).
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

describe("google docs/sheets create batch: shape", () => {
  const KEYS = ["google-docs:create_document", "google-sheets:create_spreadsheet"] as const;

  it.each(KEYS)("%s is a destructiveSafe write fixture with declared cross-provider Drive cleanup", (key) => {
    const f = fixtureFor(key);
    expect(f).toBeDefined();
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.crossProviderCleanup).toBe(true);
    // cleanup is the certified Drive delete, against the captured ledger id only.
    expect(f.writeHarness?.cleanup?.provider).toBe("google-drive");
    expect(f.writeHarness?.cleanup?.action).toBe("delete_file");
    expect(f.writeHarness?.cleanup?.config.fileId).toMatch(/\{\{ledger\..+\.id\}\}/);
    expect(f.writeHarness?.cleanup?.config.permanent).toBe(true);
    // verification is an independent get read-back (not the create echo).
    expect(f.writeHarness?.verify?.markerPath).toBe("title");
    expect(f.writeHarness?.verify?.smokeRead).toBeUndefined();
  });
});

describe("google-docs:create_document orchestration", () => {
  it("PASS: create -> independent get_document marker on title -> Drive delete (cleaned)", async () => {
    const deps = depsWith({
      "google-docs:create_document": { ok: true, output: { documentId: "doc_1", title: `${MARKER}doc` }, reason: null },
      "google-docs:get_document": { ok: true, output: { title: `${MARKER}doc` }, reason: null },
      "google-drive:delete_file": { ok: true, output: null, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("google-docs:create_document"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    // cleanup ran cross-provider against the captured documentId.
    const del = deps.calls.find((c) => c.action === "delete_file");
    expect(del?.provider).toBe("google-drive");
    expect(del?.config.fileId).toBe("doc_1");
  });

  it("VERIFY_FAILED: read-back title lacks the marker (cleanup still runs)", async () => {
    const deps = depsWith({
      "google-docs:create_document": { ok: true, output: { documentId: "doc_1", title: "someone else" }, reason: null },
      "google-docs:get_document": { ok: true, output: { title: "someone else" }, reason: null },
      "google-drive:delete_file": { ok: true, output: null, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("google-docs:create_document"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_file")).toBe(true);
  });
});

describe("google-sheets:create_spreadsheet orchestration", () => {
  it("PASS: create -> independent get_sheet_metadata marker on title -> Drive delete (cleaned)", async () => {
    const deps = depsWith({
      "google-sheets:create_spreadsheet": { ok: true, output: { spreadsheetId: "sht_1", title: `${MARKER}sheet` }, reason: null },
      "google-sheets:get_sheet_metadata": { ok: true, output: { title: `${MARKER}sheet` }, reason: null },
      "google-drive:delete_file": { ok: true, output: null, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("google-sheets:create_spreadsheet"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    const del = deps.calls.find((c) => c.action === "delete_file");
    expect(del?.provider).toBe("google-drive");
    expect(del?.config.fileId).toBe("sht_1");
  });

  it("VERIFY_FAILED: read-back title lacks the marker", async () => {
    const deps = depsWith({
      "google-sheets:create_spreadsheet": { ok: true, output: { spreadsheetId: "sht_1", title: "untitled" }, reason: null },
      "google-sheets:get_sheet_metadata": { ok: true, output: { title: "untitled" }, reason: null },
      "google-drive:delete_file": { ok: true, output: null, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("google-sheets:create_spreadsheet"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });
});
