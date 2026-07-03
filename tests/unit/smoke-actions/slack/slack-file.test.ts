/**
 * @jest-environment node
 *
 * Write smoke harness — Slack file batch (upload_file + download_file).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE boundary
 * (mock only the external seam; run the real gate / ledger / phase / verify logic).
 * Protects the contracts that matter:
 *   - upload_file consumes a self-contained v2_storage FileRef, captures the Slack
 *     fileId, and an INDEPENDENT get_file_info read-back proves the marker on the
 *     persisted fileName (the upload echo is never trusted); no cleanup (no registered
 *     Slack delete-file) -> the uploaded file is a harmless artifact left;
 *   - download_file uploads (setup) to get a real fileId, stages bytes to v2_storage,
 *     proves the returned fileName via markerEchoPath AND the staged object EXISTS via
 *     the staged_file seam (bytes never surface -> file-output contract);
 *   - a read-back WITHOUT the marker / a missing staged object is VERIFY_FAILED;
 *   - the staged-source env gates with BLOCKED_ENV (never a mutation) when unset.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const CHANNEL_ID = "C_SMOKE1";
const FILE_ID = "F1234567";
const STAGED_PATH = "smoke/slack-download/abc.png";

const env = (n: string): string | undefined =>
  n === "SMOKE_SLACK_CONNECTED"
    ? "1"
    : n === "SMOKE_SLACK_CHANNEL_ID"
      ? CHANNEL_ID
      : n === "SMOKE_SLACK_UPLOAD_STORAGE_PATH"
        ? "smoke/slack-upload/src.png"
        : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/**
 * Fake boundary. `overrides` scripts individual step outputs; defaults model a healthy
 * upload -> get_file_info(marker) -> download(staged) -> staged_file(exists) flow.
 */
function depsWith(overrides: {
  fileName?: string;
  stagedExists?: boolean;
} = {}): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  const fileName = overrides.fileName ?? `${MARKER}upload.png`;
  const stagedExists = overrides.stagedExists ?? true;
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "upload_file") {
        return { ok: true, output: { channel: CHANNEL_ID, fileId: FILE_ID, permalink: null, channelIds: [CHANNEL_ID] }, reason: null };
      }
      if (input.action === "get_file_info") {
        return { ok: true, output: { fileId: FILE_ID, fileName, file: { name: fileName } }, reason: null };
      }
      if (input.action === "download_file") {
        return {
          ok: true,
          output: { file: { kind: "v2_storage", storagePath: STAGED_PATH, name: fileName }, fileId: FILE_ID, fileName, mimeType: "image/png", sizeBytes: 4 },
          reason: null,
        };
      }
      return { ok: true, output: null, reason: null };
    },
    async smokeReadBack(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "staged_file") {
        return { ok: true, output: { exists: stagedExists, sizeBytes: stagedExists ? 4 : 0 }, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

// ─── upload_file ──────────────────────────────────────────────────────────────

describe("slack:upload_file", () => {
  it("is a sendSafe fixture with a v2_storage source, get_file_info verify, and no cleanup", () => {
    const f = fixtureFor("slack:upload_file");
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("sendSafe");
    expect(f.liveSafe).toBe(false);
    expect((f.config.file as { kind: string }).kind).toBe("v2_storage");
    expect(f.writeHarness?.captureResource?.idPath).toBe("fileId");
    expect(f.writeHarness?.verify?.action).toBe("get_file_info");
    expect(f.writeHarness?.cleanup).toBeUndefined();
  });

  it("uploads, proves the marker via get_file_info, leaves a harmless file artifact", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("slack:upload_file"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left"); // no registered Slack delete-file
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["join_channel", "upload_file", "get_file_info"]);
    // the read-back targets the captured Slack fileId.
    expect(deps.calls.find((c) => c.action === "get_file_info")!.config.fileId).toBe(FILE_ID);
  });

  it("is VERIFY_FAILED when files.info does not carry the marker", async () => {
    const deps = depsWith({ fileName: "unrelated.png" });
    const r = await runWriteSmoke(fixtureFor("slack:upload_file"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is BLOCKED_ENV (never an upload) when the staged source path is unset", async () => {
    const deps = depsWith();
    const noPath = (n: string) => (n === "SMOKE_SLACK_UPLOAD_STORAGE_PATH" ? undefined : env(n));
    const r = await runWriteSmoke(fixtureFor("slack:upload_file"), { ...RUN, envLookup: noPath }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});

// ─── download_file ──────────────────────────────────────────────────────────────

describe("slack:download_file", () => {
  it("is a writeSafe fixture that uploads in setup, echoes fileName, and verifies the staged object", () => {
    const f = fixtureFor("slack:download_file");
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("writeSafe");
    expect(f.writeHarness?.setup?.map((s) => s.action)).toEqual(["join_channel", "upload_file"]);
    expect(f.writeHarness?.markerEchoPath).toBe("fileName");
    expect(f.writeHarness?.captureResource?.idPath).toBe("file.storagePath");
    expect(f.writeHarness?.verify?.action).toBe("staged_file");
  });

  it("downloads, proves fileName + the staged object exists (no bytes in output)", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("slack:download_file"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "join_channel",
      "upload_file",
      "download_file",
      "staged_file",
    ]);
    // download targets the captured Slack fileId; staged_file targets the captured path.
    expect(deps.calls.find((c) => c.action === "download_file")!.config.fileId).toBe(FILE_ID);
    expect(deps.calls.find((c) => c.action === "staged_file")!.config.storagePath).toBe(STAGED_PATH);
  });

  it("is VERIFY_FAILED when the staged object does not exist", async () => {
    const deps = depsWith({ stagedExists: false });
    const r = await runWriteSmoke(fixtureFor("slack:download_file"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is VERIFY_FAILED when the downloaded fileName does not carry the marker", async () => {
    const deps = depsWith({ fileName: "unrelated.png" });
    const r = await runWriteSmoke(fixtureFor("slack:download_file"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
