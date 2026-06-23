/**
 * @jest-environment node
 *
 * Write smoke harness — Dropbox + OneDrive file-provider batch (SMOKE-WRITE-19).
 *
 * Pins the four new file-provider WRITE fixtures WITHOUT a real DB/provider, and
 * drives each through the pure `runWriteSmoke` orchestrator over a FAKE boundary
 * (the testing-strategy rule: mock only the external seam, run the real gate /
 * ledger / phase / verify logic). Protects the contract that matters for these
 * actions:
 *   - create_folder verifies the marker on an INDEPENDENT read-back (get), not the
 *     create echo, and a read-back without the marker is VERIFY_FAILED;
 *   - delete verifies ABSENCE on an INDEPENDENT read-back (exists==false), and a
 *     read-back that still shows the object is VERIFY_FAILED — the delete echo can
 *     never vacuously pass;
 *   - the cleanup / executeIsCleanup disposition is "cleaned" with no leak.
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

/** Fake boundary: scripted runActionStep + scripted smokeReadBack, keyed by key. */
function depsWith(
  plan: Record<string, StepRunOutcome>,
  smokePlan: Record<string, StepRunOutcome> = {},
): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
    },
    async smokeReadBack(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      return smokePlan[`${input.provider}:${input.action}`] ?? { ok: false, output: null, reason: "no reader" };
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("file-provider write batch: shape", () => {
  const CREATE = ["dropbox:create_folder", "microsoft-onedrive:create_folder"] as const;
  const DELETE = ["dropbox:delete_file", "microsoft-onedrive:delete_item"] as const;

  it.each([...CREATE, ...DELETE])("%s is a registered destructiveSafe write fixture", (key) => {
    const f = fixtureFor(key);
    expect(f).toBeDefined();
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false); // write fixtures NEVER run via the read live runner
    expect(f.writeHarness?.smokeMarker).toBe("crsmoke-");
  });

  it.each(CREATE)("%s captures a resource + verifies the marker on an independent read", (key) => {
    const f = fixtureFor(key);
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.captureResource).toBeDefined();
    expect(f.writeHarness?.verify?.markerPath).toBe("name");
    // create_folder verify reuses the REGISTERED read action (not a smoke reader).
    expect(f.writeHarness?.verify?.smokeRead).toBeUndefined();
    expect(f.writeHarness?.cleanupKind).toBe("delete");
  });

  it.each(DELETE)("%s sets up its own target, deletes it, and verifies absence independently", (key) => {
    const f = fixtureFor(key);
    expect(f.risk).toBe("destructive"); // delete_* verb -> destructive classification
    expect(f.writeHarness?.setup).toHaveLength(1);
    expect(f.writeHarness?.executeIsCleanup).toBe(true);
    // absence is proven via a smoke-only existence probe asserting exists==false.
    expect(f.writeHarness?.verify?.smokeRead).toBe(true);
    expect(f.writeHarness?.verify?.expectEquals).toEqual({ path: "exists", value: false });
  });
});

// ─── Dropbox create_folder ────────────────────────────────────────────────────

describe("dropbox:create_folder orchestration", () => {
  it("PASS: create -> independent get marker+isFolder -> delete (cleaned)", async () => {
    const deps = depsWith({
      "dropbox:create_folder": { ok: true, output: { id: "id:1", name: `${MARKER}folder`, path: `/${MARKER}folder` }, reason: null },
      "dropbox:get_file_metadata": { ok: true, output: { name: `${MARKER}folder`, isFolder: true }, reason: null },
      "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("dropbox:create_folder"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    expect(res.ledger.cleaned).toBe(res.ledger.created);
    // delete targeted the PERSISTED path captured from the create output.
    expect(deps.calls.find((c) => c.action === "delete_file")?.config.path).toBe(`/${MARKER}folder`);
  });

  it("VERIFY_FAILED: read-back lacks the marker (cleanup still runs)", async () => {
    const deps = depsWith({
      "dropbox:create_folder": { ok: true, output: { name: "someone-else", path: "/someone-else" }, reason: null },
      "dropbox:get_file_metadata": { ok: true, output: { name: "someone-else", isFolder: true }, reason: null },
      "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("dropbox:create_folder"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_file")).toBe(true);
  });

  it("VERIFY_FAILED: read-back marker present but isFolder false (proves the state assertion runs)", async () => {
    const deps = depsWith({
      "dropbox:create_folder": { ok: true, output: { name: `${MARKER}folder`, path: `/${MARKER}folder` }, reason: null },
      "dropbox:get_file_metadata": { ok: true, output: { name: `${MARKER}folder`, isFolder: false }, reason: null },
      "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("dropbox:create_folder"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });
});

// ─── Dropbox delete_file (absence verify) ─────────────────────────────────────

describe("dropbox:delete_file orchestration", () => {
  it("PASS: setup -> delete -> independent exists==false (cleaned, gone)", async () => {
    const deps = depsWith(
      {
        "dropbox:create_folder": { ok: true, output: { name: `${MARKER}folder`, path: `/${MARKER}folder` }, reason: null },
        "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
      },
      { "dropbox:path_metadata": { ok: true, output: { exists: false }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("dropbox:delete_file"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    // absence proven via the smoke reader, never a normal engine action.
    expect(deps.calls.filter((c) => c.action === "path_metadata")).toHaveLength(1);
  });

  it("VERIFY_FAILED: the object still exists on read-back (delete echo cannot vacuously pass)", async () => {
    const deps = depsWith(
      {
        "dropbox:create_folder": { ok: true, output: { name: `${MARKER}folder`, path: `/${MARKER}folder` }, reason: null },
        "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
      },
      { "dropbox:path_metadata": { ok: true, output: { exists: true }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("dropbox:delete_file"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });
});

// ─── OneDrive create_folder ───────────────────────────────────────────────────

describe("microsoft-onedrive:create_folder orchestration", () => {
  it("PASS: create -> independent get marker+kind -> delete (cleaned)", async () => {
    const deps = depsWith({
      "microsoft-onedrive:create_folder": { ok: true, output: { itemId: "01ABC", name: `${MARKER}folder` }, reason: null },
      "microsoft-onedrive:get_file": { ok: true, output: { name: `${MARKER}folder`, kind: "folder" }, reason: null },
      "microsoft-onedrive:delete_item": { ok: true, output: { deleted: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:create_folder"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe("01ABC");
  });

  it("VERIFY_FAILED: read-back kind is file, not folder", async () => {
    const deps = depsWith({
      "microsoft-onedrive:create_folder": { ok: true, output: { itemId: "01ABC", name: `${MARKER}folder` }, reason: null },
      "microsoft-onedrive:get_file": { ok: true, output: { name: `${MARKER}folder`, kind: "file" }, reason: null },
      "microsoft-onedrive:delete_item": { ok: true, output: { deleted: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:create_folder"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });
});

// ─── OneDrive delete_item (absence verify) ────────────────────────────────────

describe("microsoft-onedrive:delete_item orchestration", () => {
  it("PASS: setup -> delete -> independent exists==false (cleaned, gone)", async () => {
    const deps = depsWith(
      {
        "microsoft-onedrive:create_folder": { ok: true, output: { itemId: "01ABC", name: `${MARKER}folder` }, reason: null },
        "microsoft-onedrive:delete_item": { ok: true, output: { deleted: true }, reason: null },
      },
      { "microsoft-onedrive:item_metadata": { ok: true, output: { exists: false }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:delete_item"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.filter((c) => c.action === "item_metadata")).toHaveLength(1);
  });

  it("VERIFY_FAILED: the item still exists on read-back", async () => {
    const deps = depsWith(
      {
        "microsoft-onedrive:create_folder": { ok: true, output: { itemId: "01ABC", name: `${MARKER}folder` }, reason: null },
        "microsoft-onedrive:delete_item": { ok: true, output: { deleted: true }, reason: null },
      },
      { "microsoft-onedrive:item_metadata": { ok: true, output: { exists: true }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:delete_item"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });
});

// ─── Upload fixtures: shape ───────────────────────────────────────────────────

describe("file-provider upload batch: shape", () => {
  const UPLOAD = ["dropbox:upload_file", "microsoft-onedrive:upload_file"] as const;

  it.each(UPLOAD)("%s is a destructiveSafe write fixture verified by an independent get", (key) => {
    const f = fixtureFor(key);
    expect(f).toBeDefined();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.captureResource?.kind).toBe("file");
    expect(f.writeHarness?.verify?.markerPath).toBe("name");
    // upload verify reuses the REGISTERED read action (not a smoke reader).
    expect(f.writeHarness?.verify?.smokeRead).toBeUndefined();
    expect(f.writeHarness?.cleanupKind).toBe("delete");
  });

  it("dropbox:upload_file consumes a self-contained v2_storage FileRef (no external URL)", () => {
    const f = fixtureFor("dropbox:upload_file");
    const file = f.config.file as Record<string, unknown>;
    expect(file.kind).toBe("v2_storage");
    expect(file.storagePath).toBe("{{env.SMOKE_DROPBOX_UPLOAD_STORAGE_PATH}}");
    // the staged path is a required (non-_CONNECTED) target -> BLOCKED_ENV if unset.
    expect(f.requiredEnv).toContain("SMOKE_DROPBOX_UPLOAD_STORAGE_PATH");
  });

  it("microsoft-onedrive:upload_file uses inline content (no FileRef, no staging)", () => {
    const f = fixtureFor("microsoft-onedrive:upload_file");
    expect(f.config.content).toBe("{{smokeMarker}}content");
    expect(f.config.contentEncoding).toBe("utf8");
    expect(f.config.file).toBeUndefined();
    // connection signal only — needs no smoke-target env.
    expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"]);
  });
});

// ─── Dropbox upload_file orchestration ────────────────────────────────────────

describe("dropbox:upload_file orchestration", () => {
  // The staged-file target env must resolve, else the harness returns BLOCKED_ENV.
  const env = (n: string) => (n === "SMOKE_DROPBOX_UPLOAD_STORAGE_PATH" ? "smoke/x.png" : undefined);

  it("PASS: upload -> independent get marker+isFolder=false -> delete (cleaned)", async () => {
    const deps = depsWith({
      "dropbox:upload_file": { ok: true, output: { id: "id:9", name: `${MARKER}upload.png`, path: `/${MARKER}upload.png` }, reason: null },
      "dropbox:get_file_metadata": { ok: true, output: { name: `${MARKER}upload.png`, isFolder: false }, reason: null },
      "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("dropbox:upload_file"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    // delete targeted the PERSISTED path captured from the upload output.
    expect(deps.calls.find((c) => c.action === "delete_file")?.config.path).toBe(`/${MARKER}upload.png`);
  });

  it("BLOCKED_ENV when the staged-file path is unset (never 'not connected', never mutates)", async () => {
    const deps = depsWith({});
    const res = await runWriteSmoke(fixtureFor("dropbox:upload_file"), { ...RUN, envLookup: () => undefined }, deps);
    expect(res.status).toBe("BLOCKED_ENV");
    expect(res.reason).toMatch(/SMOKE_DROPBOX_UPLOAD_STORAGE_PATH/);
    expect(deps.calls).toHaveLength(0);
  });

  it("VERIFY_FAILED: read-back lacks the marker (cleanup still runs)", async () => {
    const deps = depsWith({
      "dropbox:upload_file": { ok: true, output: { name: "x", path: "/x" }, reason: null },
      "dropbox:get_file_metadata": { ok: true, output: { name: "x", isFolder: false }, reason: null },
      "dropbox:delete_file": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("dropbox:upload_file"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_file")).toBe(true);
  });
});

// ─── OneDrive upload_file orchestration ───────────────────────────────────────

describe("microsoft-onedrive:upload_file orchestration", () => {
  it("PASS: upload -> independent get marker+kind=file -> delete (cleaned)", async () => {
    const deps = depsWith({
      "microsoft-onedrive:upload_file": { ok: true, output: { itemId: "01F", name: `${MARKER}upload.txt` }, reason: null },
      "microsoft-onedrive:get_file": { ok: true, output: { name: `${MARKER}upload.txt`, kind: "file" }, reason: null },
      "microsoft-onedrive:delete_item": { ok: true, output: { deleted: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:upload_file"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe("01F");
  });

  it("VERIFY_FAILED: read-back kind is folder, not file", async () => {
    const deps = depsWith({
      "microsoft-onedrive:upload_file": { ok: true, output: { itemId: "01F", name: `${MARKER}upload.txt` }, reason: null },
      "microsoft-onedrive:get_file": { ok: true, output: { name: `${MARKER}upload.txt`, kind: "folder" }, reason: null },
      "microsoft-onedrive:delete_item": { ok: true, output: { deleted: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:upload_file"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });
});
