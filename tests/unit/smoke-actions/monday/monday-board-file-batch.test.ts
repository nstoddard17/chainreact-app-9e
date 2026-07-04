/**
 * @jest-environment node
 *
 * Write smoke harness — Monday board/file finisher batch (create_board,
 * duplicate_board, create_group, add_column, add_file, download_file).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a
 * FAKE boundary. Protects the contracts that matter:
 *   - every fixture is fully self-contained on per-run smoke-owned crsmoke-
 *     boards (setup create_board first; execute targets {{ledger.*}} ids only);
 *   - NO fixture declares a cleanup (Monday has no registered board/group/
 *     column delete) -> artifact honestly "left";
 *   - verifies are INDEPENDENT read-backs (get_board / list_groups / get_item /
 *     the staged_file seam), never the write echo;
 *   - a wrong read-back is VERIFY_FAILED (no vacuous pass);
 *   - download_file captures the staged FileRef's storagePath and proves the
 *     object exists via the metadata-only staged_file seam (file-output
 *     contract: no bytes anywhere);
 *   - the file fixtures gate BLOCKED_ENV without the staged upload source.
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
const UPLOAD_PATH = "smoke/monday-upload/src.png";
const STAGED_PATH = "u1/w1/r1/n1/crsmoke-T1-upload.png";

const env = (n: string): string | undefined =>
  n === "SMOKE_MONDAY_UPLOAD_STORAGE_PATH" ? UPLOAD_PATH : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

const BATCH = [
  "monday:create_board",
  "monday:duplicate_board",
  "monday:create_group",
  "monday:add_column",
  "monday:add_file",
  "monday:download_file",
] as const;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/** Fake engine boundary; `reads` overrides a read-back action's output. */
function depsWith(reads: Record<string, Record<string, unknown>> = {}): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (reads[input.action]) return { ok: true, output: reads[input.action]!, reason: null };
      switch (input.action) {
        case "create_board":
          return { ok: true, output: { boardId: "b-1", boardName: input.config.boardName }, reason: null };
        case "duplicate_board":
          return {
            ok: true,
            output: { newBoardId: "b-2", newBoardName: input.config.newBoardName, originalBoardId: input.config.boardId },
            reason: null,
          };
        case "create_group":
          return { ok: true, output: { groupId: "g-1", groupTitle: input.config.groupTitle }, reason: null };
        case "add_column":
          return { ok: true, output: { columnId: "c-1", columnTitle: input.config.columnTitle }, reason: null };
        case "create_item":
          return { ok: true, output: { itemId: "i-1", itemName: input.config.itemName }, reason: null };
        case "add_file":
          return {
            ok: true,
            output: { fileId: "a-1", fileName: input.config.filename, itemId: input.config.itemId },
            reason: null,
          };
        case "download_file":
          return {
            ok: true,
            output: {
              file: { kind: "v2_storage", name: `${MARKER}upload.png`, mimeType: "application/octet-stream", storagePath: STAGED_PATH },
              fileId: input.config.fileId,
              fileName: `${MARKER}upload.png`,
              sizeBytes: 68,
            },
            reason: null,
          };
        case "get_board":
          return {
            ok: true,
            output: {
              boardId: input.config.boardId,
              boardName: `${MARKER}board`,
              columns: [{ columnId: "c-1", title: `${MARKER}col`, type: "text" }],
              groups: [{ groupId: "g-0", title: "Group Title" }],
            },
            reason: null,
          };
        case "list_groups":
          return {
            ok: true,
            output: { boardId: input.config.boardId, groups: [{ groupId: "g-1", title: `${MARKER}group` }], count: 1 },
            reason: null,
          };
        case "get_item":
          return {
            ok: true,
            output: {
              itemId: input.config.itemId,
              itemName: `${MARKER}fileitem`,
              columnValues: [
                { id: "c-1", type: "file", text: null, value: `{"files":[{"name":"${MARKER}upload.png","assetId":"a-1"}]}` },
              ],
            },
            reason: null,
          };
        default:
          return { ok: false, output: null, reason: `no plan for ${input.action}` };
      }
    },
    async smokeReadBack(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (reads[input.action]) return { ok: true, output: reads[input.action]!, reason: null };
      if (input.action === "staged_file") {
        return { ok: true, output: { exists: true, sizeBytes: 68 }, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("monday board/file batch — shape", () => {
  it("all six are writeSafe with NO cleanup (no registered board delete)", () => {
    for (const key of BATCH) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.liveClass).toBe("writeSafe");
      expect(f.writeHarness?.cleanup).toBeUndefined();
      expect(f.writeHarness?.cleanupEach).toBeUndefined();
      expect(f.writeHarness?.cleanupAll).toBeUndefined();
      expect(f.writeHarness?.cleanupKind).toBeUndefined();
      expect(f.liveSafe).toBe(false);
      expect(f.liveRisk).toBe("write");
    }
  });

  it("every non-create_board fixture creates its OWN host board in setup", () => {
    for (const key of BATCH.filter((k) => k !== "monday:create_board")) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.setup?.[0]?.action).toBe("create_board");
      expect(f.writeHarness?.setup?.[0]?.captureResource?.resourceKey).toBe("board");
    }
  });

  it("the file fixtures require the staged upload source env", () => {
    for (const key of ["monday:add_file", "monday:download_file"] as const) {
      expect(fixtureFor(key).requiredEnv).toEqual(["SMOKE_MONDAY_UPLOAD_STORAGE_PATH"]);
    }
  });

  it("download_file verifies via the metadata-only staged_file seam", () => {
    const f = fixtureFor("monday:download_file");
    expect(f.writeHarness?.verify?.smokeRead).toBe(true);
    expect(f.writeHarness?.verify?.action).toBe("staged_file");
    expect(f.writeHarness?.verify?.expectEquals).toEqual({ path: "exists", value: true });
    expect(f.writeHarness?.captureResource).toEqual({
      resourceKey: "staged",
      idPath: "file.storagePath",
      kind: "staged_file",
    });
  });
});

// ─── Flows ───────────────────────────────────────────────────────────────────

describe("monday board/file batch — flows", () => {
  it("create_board: PASS, marker on echo + independent get_board read-back, artifact left", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("monday:create_board"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    const verify = deps.calls.find((c) => c.action === "get_board");
    expect(verify?.config.boardId).toBe("b-1"); // ledger-resolved, never a literal
  });

  it("create_board: a read-back without the marker is VERIFY_FAILED", async () => {
    const deps = depsWith({ get_board: { boardId: "b-1", boardName: "someone-elses-board", columns: [], groups: [] } });
    const r = await runWriteSmoke(fixtureFor("monday:create_board"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("duplicate_board: clones the smoke-owned source and verifies the NEW board", async () => {
    const deps = depsWith({
      get_board: { boardId: "b-2", boardName: `${MARKER}dup`, columns: [], groups: [] },
    });
    const r = await runWriteSmoke(fixtureFor("monday:duplicate_board"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    const exec = deps.calls.find((c) => c.action === "duplicate_board");
    expect(exec?.config.boardId).toBe("b-1"); // the setup-created source
    const verify = deps.calls.find((c) => c.action === "get_board");
    expect(verify?.config.boardId).toBe("b-2"); // the captured duplicate
    expect(r.ledger.created).toBe(2); // source + duplicate, both honestly left
    expect(r.artifact).toBe("left");
  });

  it("create_group: group lands on the smoke board; list_groups read-back proves the marker", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("monday:create_group"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    const exec = deps.calls.find((c) => c.action === "create_group");
    expect(exec?.config.boardId).toBe("b-1");
    expect(exec?.config.groupTitle).toBe(`${MARKER}group`);
  });

  it("add_column: column lands on the smoke board; get_board columns[] proves the marker", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("monday:add_column"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    const exec = deps.calls.find((c) => c.action === "add_column");
    expect(exec?.config.columnType).toBe("text");
  });

  it("add_column: a read-back whose columns lack the marker is VERIFY_FAILED", async () => {
    const deps = depsWith({
      get_board: { boardId: "b-1", boardName: `${MARKER}colboard`, columns: [{ columnId: "x", title: "Status" }], groups: [] },
    });
    const r = await runWriteSmoke(fixtureFor("monday:add_column"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("add_file: full smoke-owned chain, FileRef from the staged env source, get_item proves the marker", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("monday:add_file"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "create_board",
      "create_group",
      "add_column",
      "create_item",
      "add_file",
      "get_item",
    ]);
    const exec = deps.calls.find((c) => c.action === "add_file");
    expect(exec?.config.itemId).toBe("i-1");
    expect(exec?.config.columnId).toBe("c-1");
    expect((exec?.config.file as Record<string, unknown>).storagePath).toBe(UPLOAD_PATH);
    expect(r.ledger.created).toBe(5); // board/group/column/item/asset
    expect(r.artifact).toBe("left");
  });

  it("add_file: BLOCKED_ENV without the staged upload source", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("monday:add_file"), { ...RUN, envLookup: () => undefined }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0); // gated before ANY provider call
  });

  it("download_file: stages to v2_storage; staged_file seam proves the object exists", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("monday:download_file"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    const exec = deps.calls.find((c) => c.action === "download_file");
    expect(exec?.config.fileId).toBe("a-1"); // the setup-uploaded asset
    const seam = deps.calls.find((c) => c.action === "staged_file");
    expect(seam?.config.storagePath).toBe(STAGED_PATH); // captured from the output FileRef
    expect(r.artifact).toBe("left");
  });

  it("download_file: a missing staged object ({exists:false}) is VERIFY_FAILED", async () => {
    const deps = depsWith({ staged_file: { exists: false, sizeBytes: 0 } });
    const r = await runWriteSmoke(fixtureFor("monday:download_file"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
