/**
 * @jest-environment node
 *
 * Write smoke harness — OneDrive move_item (SMOKE-WRITE-26).
 *
 * Pins the new OneDrive atomic move+rename WRITE fixture WITHOUT a real
 * DB/provider, driving it through the pure `runWriteSmoke` orchestrator over a
 * FAKE boundary (the testing-strategy rule: mock only the external seam, run the
 * real gate / ledger / phase / verify logic). Protects the contracts that matter:
 *   - setup uploads a smoke source AND creates a smoke destination folder, with the
 *     FILE captured BEFORE the FOLDER so cleanup deletes the moved file first and
 *     its parent folder second (no recursive-delete 404);
 *   - move_item is verified by an INDEPENDENT get_file proving THREE things — the
 *     marker+suffix "moved" on the persisted name (rename landed), kind == file, and
 *     parentReference.id == the captured smoke folder id (move landed);
 *   - any one of those failing on the read-back is VERIFY_FAILED (no vacuous pass);
 *   - both smoke items are deleted -> leaked 0, cleaned == created (2).
 *
 * copy_item is now fixtured via the harness `completeAsync` phase (SMOKE-WRITE-33,
 * see onedrive-copy-item.test.ts) — a guard test below asserts it is registered.
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
const FOLDER_ID = "01FOLDER";
const FILE_ID = "01FILE";

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

/** A passing-by-default plan; each test overrides only the leg it stresses. */
const okPlan = (): Record<string, StepRunOutcome> => ({
  "microsoft-onedrive:upload_file": { ok: true, output: { itemId: FILE_ID, name: `${MARKER}src.txt` }, reason: null },
  "microsoft-onedrive:create_folder": { ok: true, output: { itemId: FOLDER_ID, name: `${MARKER}dest` }, reason: null },
  "microsoft-onedrive:move_item": { ok: true, output: { itemId: FILE_ID, name: `${MARKER}moved.txt` }, reason: null },
  "microsoft-onedrive:get_file": {
    ok: true,
    output: { name: `${MARKER}moved.txt`, kind: "file", parentReference: { id: FOLDER_ID } },
    reason: null,
  },
  "microsoft-onedrive:delete_item": { ok: true, output: { deleted: true }, reason: null },
});

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("microsoft-onedrive:move_item: shape", () => {
  it("is a registered destructiveSafe write fixture (connection-only env)", () => {
    const f = fixtureFor("microsoft-onedrive:move_item");
    expect(f).toBeDefined();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.smokeMarker).toBe("crsmoke-");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
    expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"]);
  });

  it("sets up the FILE before the FOLDER (cleanup deletes child before parent)", () => {
    const f = fixtureFor("microsoft-onedrive:move_item");
    const setup = f.writeHarness!.setup!;
    expect(setup).toHaveLength(2);
    expect(setup[0]!.action).toBe("upload_file");
    expect(setup[0]!.captureResource?.resourceKey).toBe("file");
    expect(setup[1]!.action).toBe("create_folder");
    expect(setup[1]!.captureResource?.resourceKey).toBe("folder");
  });

  it("moves into the smoke folder + renames, and verifies name+kind+parent independently", () => {
    const f = fixtureFor("microsoft-onedrive:move_item");
    expect(f.config.itemId).toBe("{{ledger.file.id}}");
    expect(f.config.targetParentItemId).toBe("{{ledger.folder.id}}");
    expect(f.config.newName).toBe("{{smokeMarker}}moved.txt");
    const v = f.writeHarness!.verify!;
    expect(v.action).toBe("get_file");
    expect(v.smokeRead).toBeUndefined(); // registered read, not a smoke reader
    expect(v.markerPath).toBe("name");
    expect(v.markerSuffix).toBe("moved");
    expect(v.expectEquals).toEqual({ path: "kind", value: "file" });
    expect(v.expectContains).toEqual({ path: "parentReference.id", value: "{{ledger.folder.id}}" });
    expect(f.writeHarness?.cleanupEach?.action).toBe("delete_item");
    expect(f.writeHarness?.cleanupEach?.config.itemId).toBe("{{each.id}}");
  });
});

// ─── Orchestration ────────────────────────────────────────────────────────────

describe("microsoft-onedrive:move_item orchestration", () => {
  it("PASS: upload+folder -> move+rename into folder -> independent get(name+kind+parent) -> delete BOTH (cleaned)", async () => {
    const deps = depsWith(okPlan());
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:move_item"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(2); // file + folder
    expect(res.ledger.cleaned).toBe(2);
    expect(res.ledger.leaked).toBe(0);
    // move read the smoke source id; target is the smoke folder id; renamed with marker.
    const mv = deps.calls.find((c) => c.action === "move_item");
    expect(mv?.config.itemId).toBe(FILE_ID);
    expect(mv?.config.targetParentItemId).toBe(FOLDER_ID);
    expect(mv?.config.newName).toBe(`${MARKER}moved.txt`);
    // cleanup order: file (child) BEFORE folder (parent) — no recursive-delete 404.
    const deletes = deps.calls.filter((c) => c.action === "delete_item").map((c) => c.config.itemId);
    expect(deletes).toEqual([FILE_ID, FOLDER_ID]);
  });

  it("VERIFY_FAILED: read-back name lacks the 'moved' suffix (still the source name)", async () => {
    const plan = okPlan();
    plan["microsoft-onedrive:get_file"] = {
      ok: true,
      output: { name: `${MARKER}src.txt`, kind: "file", parentReference: { id: FOLDER_ID } },
      reason: null,
    };
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:move_item"), RUN, depsWith(plan));
    expect(res.status).toBe("VERIFY_FAILED");
  });

  it("VERIFY_FAILED: parentReference.id is NOT the smoke folder (move did not land in our folder)", async () => {
    const plan = okPlan();
    plan["microsoft-onedrive:get_file"] = {
      ok: true,
      output: { name: `${MARKER}moved.txt`, kind: "file", parentReference: { id: "01SOMEONE-ELSE" } },
      reason: null,
    };
    const deps = depsWith(plan);
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:move_item"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    // cleanup still removes both smoke items (a verify failure never leaks them).
    expect(deps.calls.filter((c) => c.action === "delete_item")).toHaveLength(2);
  });

  it("VERIFY_FAILED: read-back kind is folder, not file", async () => {
    const plan = okPlan();
    plan["microsoft-onedrive:get_file"] = {
      ok: true,
      output: { name: `${MARKER}moved.txt`, kind: "folder", parentReference: { id: FOLDER_ID } },
      reason: null,
    };
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:move_item"), RUN, depsWith(plan));
    expect(res.status).toBe("VERIFY_FAILED");
  });

  it("FAIL: setup upload fails -> no folder, no move, nothing created/leaked", async () => {
    const deps = depsWith({
      "microsoft-onedrive:upload_file": { ok: false, output: null, reason: "upload boom" },
    });
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:move_item"), RUN, deps);
    expect(res.status).toBe("FAIL");
    expect(res.ledger.created).toBe(0);
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.some((c) => c.action === "move_item")).toBe(false);
    expect(deps.calls.some((c) => c.action === "create_folder")).toBe(false); // setup short-circuits
  });
});

// ─── copy_item is now fixtured via completeAsync (SMOKE-WRITE-33) ──────────────

describe("microsoft-onedrive:copy_item is now fixtured (async blocker resolved)", () => {
  it("has a write fixture with a completeAsync monitor-poll phase", () => {
    const f = WRITE_SMOKE_FIXTURES.find((x) => `${x.provider}:${x.action}` === "microsoft-onedrive:copy_item");
    expect(f).toBeDefined();
    // The async copy is completed by polling the trusted Graph monitor URL; the
    // copied item id is captured into the ledger so it can be verified + cleaned.
    expect(f!.writeHarness?.completeAsync?.action).toBe("copy_monitor");
    expect(f!.writeHarness?.completeAsync?.captureResource.resourceKey).toBe("copy");
  });
});
