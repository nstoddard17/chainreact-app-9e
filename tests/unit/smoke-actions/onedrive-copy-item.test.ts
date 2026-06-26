/**
 * @jest-environment node
 *
 * Write smoke harness — OneDrive copy_item (SMOKE-WRITE-33).
 *
 * Drives the async-copy WRITE fixture through the pure `runWriteSmoke` orchestrator
 * over FAKE boundaries (the testing-strategy rule: mock only the external seams —
 * the engine `runActionStep` AND the smoke `smokeReadBack` poll — run the real gate /
 * ledger / phase / completeAsync / verify logic). Protects the contracts that matter:
 *   - setup creates a smoke folder THEN uploads a smoke source INTO it;
 *   - execute returns {status:"pending", monitorUrl} with NO copied-item id;
 *   - completeAsync polls the monitor URL via the smoke seam and CAPTURES the copied
 *     item's real id into the ledger (so it can be verified + cleaned);
 *   - verify is an INDEPENDENT get_file proving name marker+suffix "copy", kind==file,
 *     and parentReference.id == the captured smoke folder;
 *   - any completeAsync/verify failure is VERIFY_FAILED (no vacuous pass, no leak);
 *   - all three smoke items are deleted -> leaked 0, cleaned == created (3).
 *
 * Production behavior is unchanged — polling lives ONLY in the smoke seam.
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
const SOURCE_ID = "01SOURCE";
const COPY_ID = "01COPY";
const MONITOR_URL = "https://graph.microsoft.com/v1.0/operations/op-42";

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  readonly reads: { provider: string; action: string; config: Record<string, unknown> }[];
}

/** Build deps from an engine plan + a poll outcome for copy_monitor. */
function depsWith(
  plan: Record<string, StepRunOutcome>,
  monitor: StepRunOutcome | "absent" = { ok: true, output: { itemId: COPY_ID }, reason: null },
): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  const reads: RecordingDeps["reads"] = [];
  const deps: RecordingDeps = {
    calls,
    reads,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
    },
  };
  if (monitor !== "absent") {
    deps.smokeReadBack = async (input) => {
      reads.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "copy_monitor") return monitor;
      return { ok: false, output: null, reason: `no reader for ${input.action}` };
    };
  }
  return deps;
}

/** A passing-by-default engine plan; each test overrides only the leg it stresses. */
const okPlan = (): Record<string, StepRunOutcome> => ({
  "microsoft-onedrive:create_folder": { ok: true, output: { itemId: FOLDER_ID, name: `${MARKER}copy-folder` }, reason: null },
  "microsoft-onedrive:upload_file": { ok: true, output: { itemId: SOURCE_ID, name: `${MARKER}src.txt` }, reason: null },
  "microsoft-onedrive:copy_item": { ok: true, output: { status: "pending", monitorUrl: MONITOR_URL }, reason: null },
  "microsoft-onedrive:get_file": {
    ok: true,
    output: { name: `${MARKER}copy.txt`, kind: "file", parentReference: { id: FOLDER_ID } },
    reason: null,
  },
  "microsoft-onedrive:delete_item": { ok: true, output: { deleted: true }, reason: null },
});

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("microsoft-onedrive:copy_item: shape", () => {
  it("is a registered destructiveSafe write fixture (connection-only env)", () => {
    const f = fixtureFor("microsoft-onedrive:copy_item");
    expect(f).toBeDefined();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.smokeMarker).toBe("crsmoke-");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
    expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"]);
  });

  it("creates the FOLDER before uploading the SOURCE into it", () => {
    const f = fixtureFor("microsoft-onedrive:copy_item");
    const setup = f.writeHarness!.setup!;
    expect(setup).toHaveLength(2);
    expect(setup[0]!.action).toBe("create_folder");
    expect(setup[0]!.captureResource?.resourceKey).toBe("folder");
    expect(setup[1]!.action).toBe("upload_file");
    expect(setup[1]!.captureResource?.resourceKey).toBe("source");
    expect(setup[1]!.config.parentItemId).toBe("{{ledger.folder.id}}");
  });

  it("completes the async copy by polling the monitor URL and capturing the copied id", () => {
    const f = fixtureFor("microsoft-onedrive:copy_item");
    expect(f.config.itemId).toBe("{{ledger.source.id}}");
    expect(f.config.targetParentItemId).toBe("{{ledger.folder.id}}");
    expect(f.config.newName).toBe("{{smokeMarker}}copy.txt");
    const ca = f.writeHarness!.completeAsync!;
    expect(ca.monitorUrlPath).toBe("monitorUrl");
    expect(ca.action).toBe("copy_monitor");
    expect(ca.captureResource).toEqual({ resourceKey: "copy", idPath: "itemId", kind: "file" });
  });

  it("verifies the COPY independently (name+suffix copy, kind, parent) and cleans each", () => {
    const f = fixtureFor("microsoft-onedrive:copy_item");
    const v = f.writeHarness!.verify!;
    expect(v.action).toBe("get_file");
    expect(v.config.itemId).toBe("{{ledger.copy.id}}");
    expect(v.markerPath).toBe("name");
    expect(v.markerSuffix).toBe("copy");
    expect(v.expectEquals).toEqual({ path: "kind", value: "file" });
    expect(v.expectContains).toEqual({ path: "parentReference.id", value: "{{ledger.folder.id}}" });
    expect(f.writeHarness?.cleanupEach?.action).toBe("delete_item");
    expect(f.writeHarness?.cleanupEach?.config.itemId).toBe("{{each.id}}");
  });
});

// ─── Orchestration ────────────────────────────────────────────────────────────

describe("microsoft-onedrive:copy_item orchestration", () => {
  it("PASS: folder+source -> copy(pending) -> poll monitor -> capture copy -> verify -> delete ALL THREE", async () => {
    const deps = depsWith(okPlan());
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:copy_item"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(3); // folder + source + copy
    expect(res.ledger.cleaned).toBe(3);
    expect(res.ledger.leaked).toBe(0);

    // copy ran against the smoke source id, into the smoke folder, renamed with marker.
    const cp = deps.calls.find((c) => c.action === "copy_item");
    expect(cp?.config.itemId).toBe(SOURCE_ID);
    expect(cp?.config.targetParentItemId).toBe(FOLDER_ID);
    expect(cp?.config.newName).toBe(`${MARKER}copy.txt`);

    // the monitor poll received the TRUSTED monitor URL from the execute output.
    const poll = deps.reads.find((r) => r.action === "copy_monitor");
    expect(poll?.config.monitorUrl).toBe(MONITOR_URL);

    // verify read the CAPTURED copy id (the polled resourceId), never the source.
    const gv = deps.calls.find((c) => c.action === "get_file");
    expect(gv?.config.itemId).toBe(COPY_ID);

    // cleanup removed all three smoke items.
    const deletes = deps.calls.filter((c) => c.action === "delete_item").map((c) => c.config.itemId);
    expect(deletes.sort()).toEqual([COPY_ID, FOLDER_ID, SOURCE_ID].sort());
  });

  it("VERIFY_FAILED: execute returns no monitor URL -> copy never captured (folder+source cleaned)", async () => {
    const plan = okPlan();
    plan["microsoft-onedrive:copy_item"] = { ok: true, output: { status: "pending" }, reason: null };
    const deps = depsWith(plan);
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:copy_item"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(res.ledger.created).toBe(2); // folder + source only; no copy captured
    expect(res.ledger.leaked).toBe(0); // both still cleaned
    expect(deps.reads.some((r) => r.action === "copy_monitor")).toBe(false); // never polled
    expect(deps.calls.some((c) => c.action === "get_file")).toBe(false); // never verified
  });

  it("VERIFY_FAILED: the monitor poll fails (copy operation failed) -> no copy captured", async () => {
    const deps = depsWith(okPlan(), { ok: false, output: null, reason: "async copy reported terminal failure (failed)" });
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:copy_item"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(res.ledger.created).toBe(2); // copy not captured
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.some((c) => c.action === "get_file")).toBe(false);
  });

  it("VERIFY_FAILED: the poll completes but yields no resource id", async () => {
    const deps = depsWith(okPlan(), { ok: true, output: { itemId: null }, reason: null });
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:copy_item"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(res.ledger.created).toBe(2);
    expect(res.ledger.leaked).toBe(0);
  });

  it("VERIFY_FAILED: the smoke poll seam is unavailable", async () => {
    const deps = depsWith(okPlan(), "absent");
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:copy_item"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(res.ledger.created).toBe(2);
    expect(res.ledger.leaked).toBe(0);
  });

  it("VERIFY_FAILED: read-back name lacks the 'copy' suffix (read the source by mistake)", async () => {
    const plan = okPlan();
    plan["microsoft-onedrive:get_file"] = {
      ok: true,
      output: { name: `${MARKER}src.txt`, kind: "file", parentReference: { id: FOLDER_ID } },
      reason: null,
    };
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:copy_item"), RUN, depsWith(plan));
    expect(res.status).toBe("VERIFY_FAILED");
  });

  it("VERIFY_FAILED: parentReference.id is NOT the smoke folder (copy landed elsewhere)", async () => {
    const plan = okPlan();
    plan["microsoft-onedrive:get_file"] = {
      ok: true,
      output: { name: `${MARKER}copy.txt`, kind: "file", parentReference: { id: "01SOMEONE-ELSE" } },
      reason: null,
    };
    const deps = depsWith(plan);
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:copy_item"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    // all three smoke items are still cleaned (a verify failure never leaks them).
    expect(deps.calls.filter((c) => c.action === "delete_item")).toHaveLength(3);
  });

  it("FAIL: setup create_folder fails -> no upload, no copy, nothing created/leaked", async () => {
    const deps = depsWith({
      "microsoft-onedrive:create_folder": { ok: false, output: null, reason: "folder boom" },
    });
    const res = await runWriteSmoke(fixtureFor("microsoft-onedrive:copy_item"), RUN, deps);
    expect(res.status).toBe("FAIL");
    expect(res.ledger.created).toBe(0);
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.some((c) => c.action === "upload_file")).toBe(false); // setup short-circuits
    expect(deps.calls.some((c) => c.action === "copy_item")).toBe(false);
  });
});
