/**
 * @jest-environment node
 *
 * Write smoke harness — Dropbox copy_file + move_file (SMOKE-WRITE-25).
 *
 * Pins the two new Dropbox relocation WRITE fixtures WITHOUT a real DB/provider,
 * driving each through the pure `runWriteSmoke` orchestrator over a FAKE boundary
 * (the testing-strategy rule: mock only the external seam, run the real gate /
 * ledger / phase / verify logic). Protects the contracts that matter:
 *   - copy_file: setup uploads a smoke source, copy lands at a DISTINCT path; the
 *     copy is verified by an INDEPENDENT get (marker+suffix "copy", isFolder false),
 *     and BOTH files (source + copy) are deleted — leaked 0, cleaned == created (2);
 *   - move_file: setup uploads a smoke source, the move RE-CAPTURES into the same
 *     ledger key (one file, current address), verified by an INDEPENDENT get
 *     (marker+suffix "moved"), then the single file is deleted — leaked 0,
 *     cleaned == created (1);
 *   - the markerSuffix proves we read the COPY/MOVED file, not the original source;
 *   - a read-back without the right marker is VERIFY_FAILED (no vacuous pass);
 *   - the staged-source target env gates with BLOCKED_ENV (never "not connected",
 *     never a mutation).
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
// The staged-source env must resolve, else the harness returns BLOCKED_ENV.
const env = (n: string) => (n === "SMOKE_DROPBOX_UPLOAD_STORAGE_PATH" ? "smoke/src.png" : undefined);

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/** Fake boundary: scripted runActionStep keyed by `provider:action`. */
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

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("dropbox copy_file + move_file: shape", () => {
  const KEYS = ["dropbox:copy_file", "dropbox:move_file"] as const;

  it.each(KEYS)("%s is a registered destructiveSafe write fixture", (key) => {
    const f = fixtureFor(key);
    expect(f).toBeDefined();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false); // write fixtures NEVER run via the read live runner
    expect(f.writeHarness?.smokeMarker).toBe("crsmoke-");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
  });

  it.each(KEYS)("%s sets up a smoke source via upload_file from a self-contained FileRef", (key) => {
    const f = fixtureFor(key);
    expect(f.writeHarness?.setup).toHaveLength(1);
    const setup = f.writeHarness!.setup![0]!;
    expect(setup.provider).toBe("dropbox");
    expect(setup.action).toBe("upload_file");
    const file = setup.config.file as Record<string, unknown>;
    expect(file.kind).toBe("v2_storage");
    expect(file.storagePath).toBe("{{env.SMOKE_DROPBOX_UPLOAD_STORAGE_PATH}}");
    // the staged path is a required (non-_CONNECTED) target -> BLOCKED_ENV if unset.
    expect(f.requiredEnv).toContain("SMOKE_DROPBOX_UPLOAD_STORAGE_PATH");
  });

  it.each(KEYS)("%s verifies via the REGISTERED get_file_metadata (independent read), with a distinguishing marker suffix", (key) => {
    const f = fixtureFor(key);
    expect(f.writeHarness?.verify?.provider).toBe("dropbox");
    expect(f.writeHarness?.verify?.action).toBe("get_file_metadata");
    expect(f.writeHarness?.verify?.markerPath).toBe("name");
    expect(f.writeHarness?.verify?.smokeRead).toBeUndefined(); // registered read, not a smoke reader
    expect(f.writeHarness?.verify?.expectEquals).toEqual({ path: "isFolder", value: false });
    expect(typeof f.writeHarness?.verify?.markerSuffix).toBe("string");
  });

  it("copy_file uses cleanupEach (deletes BOTH source + copy); move_file uses single cleanup (one file)", () => {
    const copy = fixtureFor("dropbox:copy_file");
    expect(copy.writeHarness?.cleanupEach?.action).toBe("delete_file");
    expect(copy.writeHarness?.cleanupEach?.config.path).toBe("{{each.id}}");
    expect(copy.writeHarness?.cleanup).toBeUndefined();

    const move = fixtureFor("dropbox:move_file");
    expect(move.writeHarness?.cleanup?.action).toBe("delete_file");
    expect(move.writeHarness?.cleanup?.config.path).toBe("{{ledger.file.id}}");
    expect(move.writeHarness?.cleanupEach).toBeUndefined();
    // move re-captures the execute output into the SAME key the setup used.
    expect(move.writeHarness?.captureResource?.resourceKey).toBe("file");
    expect(move.writeHarness?.setup?.[0]?.captureResource?.resourceKey).toBe("file");
  });
});

// ─── copy_file orchestration ──────────────────────────────────────────────────

describe("dropbox:copy_file orchestration", () => {
  it("PASS: upload source -> copy to distinct path -> independent get marker+isFolder=false -> delete BOTH (cleaned)", async () => {
    const deps = depsWith({
      "dropbox:upload_file": { ok: true, output: { id: "id:s", name: `${MARKER}src.png`, path: `/${MARKER}src.png` }, reason: null },
      "dropbox:copy_file": { ok: true, output: { id: "id:c", name: `${MARKER}copy.png`, path: `/${MARKER}copy.png` }, reason: null },
      "dropbox:get_file_metadata": { ok: true, output: { name: `${MARKER}copy.png`, isFolder: false }, reason: null },
      "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("dropbox:copy_file"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(2); // source + copy
    expect(res.ledger.cleaned).toBe(2);
    expect(res.ledger.leaked).toBe(0);
    // copy reads the SOURCE path captured from setup.
    expect(deps.calls.find((c) => c.action === "copy_file")?.config.fromPath).toBe(`/${MARKER}src.png`);
    expect(deps.calls.find((c) => c.action === "copy_file")?.config.toPath).toBe(`/${MARKER}copy.png`);
    // both files deleted (source + copy paths).
    const deletes = deps.calls.filter((c) => c.action === "delete_file").map((c) => c.config.path);
    expect(deletes).toEqual(expect.arrayContaining([`/${MARKER}src.png`, `/${MARKER}copy.png`]));
    expect(deletes).toHaveLength(2);
  });

  it("VERIFY_FAILED: read-back is the SOURCE name (lacks the 'copy' suffix) — markerSuffix proves identity (cleanup still runs)", async () => {
    const deps = depsWith({
      "dropbox:upload_file": { ok: true, output: { id: "id:s", name: `${MARKER}src.png`, path: `/${MARKER}src.png` }, reason: null },
      "dropbox:copy_file": { ok: true, output: { id: "id:c", name: `${MARKER}copy.png`, path: `/${MARKER}copy.png` }, reason: null },
      // Wrong: read-back returns the SOURCE name (no "copy" suffix) -> must fail.
      "dropbox:get_file_metadata": { ok: true, output: { name: `${MARKER}src.png`, isFolder: false }, reason: null },
      "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("dropbox:copy_file"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.filter((c) => c.action === "delete_file")).toHaveLength(2); // cleanup still removes both
  });

  it("VERIFY_FAILED: read-back marker present but isFolder true (state assertion runs)", async () => {
    const deps = depsWith({
      "dropbox:upload_file": { ok: true, output: { path: `/${MARKER}src.png` }, reason: null },
      "dropbox:copy_file": { ok: true, output: { path: `/${MARKER}copy.png` }, reason: null },
      "dropbox:get_file_metadata": { ok: true, output: { name: `${MARKER}copy.png`, isFolder: true }, reason: null },
      "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("dropbox:copy_file"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });

  it("BLOCKED_ENV when the staged-source path is unset (never 'not connected', never mutates)", async () => {
    const deps = depsWith({});
    const res = await runWriteSmoke(fixtureFor("dropbox:copy_file"), { ...RUN, envLookup: () => undefined }, deps);
    expect(res.status).toBe("BLOCKED_ENV");
    expect(res.reason).toMatch(/SMOKE_DROPBOX_UPLOAD_STORAGE_PATH/);
    expect(deps.calls).toHaveLength(0);
  });
});

// ─── move_file orchestration ──────────────────────────────────────────────────

describe("dropbox:move_file orchestration", () => {
  it("PASS: upload source -> move to distinct path (re-capture same key) -> independent get marker+isFolder=false -> delete ONE (cleaned)", async () => {
    const deps = depsWith({
      "dropbox:upload_file": { ok: true, output: { id: "id:s", name: `${MARKER}src.png`, path: `/${MARKER}src.png` }, reason: null },
      "dropbox:move_file": { ok: true, output: { id: "id:m", name: `${MARKER}moved.png`, path: `/${MARKER}moved.png` }, reason: null },
      "dropbox:get_file_metadata": { ok: true, output: { name: `${MARKER}moved.png`, isFolder: false }, reason: null },
      "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("dropbox:move_file"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(1); // ONE physical file (relocated, key overwritten)
    expect(res.ledger.cleaned).toBe(1);
    expect(res.ledger.leaked).toBe(0);
    // move reads the OLD (source) path; the ledger key is overwritten AFTER.
    expect(deps.calls.find((c) => c.action === "move_file")?.config.fromPath).toBe(`/${MARKER}src.png`);
    expect(deps.calls.find((c) => c.action === "move_file")?.config.toPath).toBe(`/${MARKER}moved.png`);
    // exactly one delete, targeting the NEW (moved) path — not the stale source path.
    const deletes = deps.calls.filter((c) => c.action === "delete_file").map((c) => c.config.path);
    expect(deletes).toEqual([`/${MARKER}moved.png`]);
  });

  it("VERIFY_FAILED: read-back lacks the 'moved' suffix (still the source name)", async () => {
    const deps = depsWith({
      "dropbox:upload_file": { ok: true, output: { path: `/${MARKER}src.png` }, reason: null },
      "dropbox:move_file": { ok: true, output: { path: `/${MARKER}moved.png` }, reason: null },
      "dropbox:get_file_metadata": { ok: true, output: { name: `${MARKER}src.png`, isFolder: false }, reason: null },
      "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("dropbox:move_file"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    // cleanup still removes the one moved file (the verify failure never leaks it).
    expect(deps.calls.filter((c) => c.action === "delete_file")).toHaveLength(1);
  });

  it("FAIL: setup upload fails -> no move, nothing created, nothing leaked", async () => {
    const deps = depsWith({
      "dropbox:upload_file": { ok: false, output: null, reason: "upload boom" },
    });
    const res = await runWriteSmoke(fixtureFor("dropbox:move_file"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("FAIL");
    expect(res.ledger.created).toBe(0);
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.some((c) => c.action === "move_file")).toBe(false); // execute never ran
  });
});
