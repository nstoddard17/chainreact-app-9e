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
