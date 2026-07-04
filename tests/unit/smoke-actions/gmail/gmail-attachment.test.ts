/**
 * @jest-environment node
 *
 * Write smoke harness — Gmail get_attachment (writeSafe, staged to v2_storage).
 *
 * Drives the fixture through the pure `runWriteSmoke` orchestrator over a FAKE boundary
 * (mock only the external seam; run the real gate / ledger / phase / verify logic).
 * Protects the contracts that matter:
 *   - get_attachment stages bytes to v2_storage and returns FileRef(v2_storage) + metadata
 *     (no bytes -- enforced by the handler + its own unit tests);
 *   - markerEchoPath proves the returned fileName carries the run marker (OUR attachment);
 *   - the staged_file seam proves the staged object EXISTS (bytes actually landed);
 *   - a missing staged object / wrong fileName is VERIFY_FAILED (no vacuous pass);
 *   - the attachment-id env gates with BLOCKED_ENV (never a fetch) when unset.
 * Also validates the smoke helper builds a well-formed multipart MIME the extractor reads.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";
import { extractAttachmentMetadata } from "@/integrations/gmail/triggers/newAttachment/extractAttachmentMetadata";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const MSG_ID = "M1";
const ATT_ID = "att-1";
const STAGED_PATH = "smoke/gmail-attach/abc.txt";

const env = (n: string): string | undefined =>
  n === "SMOKE_GMAIL_CONNECTED"
    ? "1"
    : n === "SMOKE_GMAIL_ATTACHMENT_MESSAGE_ID"
      ? MSG_ID
      : n === "SMOKE_GMAIL_ATTACHMENT_ID"
        ? ATT_ID
        : undefined;

const fixture = (): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "gmail:get_attachment")!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(overrides: { fileName?: string; stagedExists?: boolean } = {}): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  const fileName = overrides.fileName ?? `${MARKER}attach.txt`;
  const stagedExists = overrides.stagedExists ?? true;
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "get_attachment") {
        return {
          ok: true,
          output: { file: { kind: "v2_storage", storagePath: STAGED_PATH, name: fileName }, messageId: MSG_ID, attachmentId: ATT_ID, fileName, mimeType: "text/plain", sizeBytes: 20 },
          reason: null,
        };
      }
      return { ok: true, output: null, reason: null };
    },
    async smokeReadBack(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "staged_file") {
        return { ok: true, output: { exists: stagedExists, sizeBytes: stagedExists ? 20 : 0 }, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

describe("gmail:get_attachment", () => {
  it("is a writeSafe fixture that echoes fileName and verifies the staged object", () => {
    const f = fixture();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("writeSafe");
    expect(f.writeHarness?.markerEchoPath).toBe("fileName");
    expect(f.writeHarness?.captureResource?.idPath).toBe("file.storagePath");
    expect(f.writeHarness?.verify?.action).toBe("staged_file");
    expect(f.writeHarness?.cleanup).toBeUndefined(); // v2_storage object has no delete action
  });

  it("fetches the attachment, proves fileName marker + the staged object exists", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(deps.calls.map((c) => c.action)).toEqual(["get_attachment", "staged_file"]);
    expect(deps.calls.find((c) => c.action === "get_attachment")!.config.attachmentId).toBe(ATT_ID);
    expect(deps.calls.find((c) => c.action === "staged_file")!.config.storagePath).toBe(STAGED_PATH);
  });

  it("is VERIFY_FAILED when the staged object does not exist", async () => {
    const deps = depsWith({ stagedExists: false });
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is VERIFY_FAILED when the fetched fileName lacks the run marker", async () => {
    const deps = depsWith({ fileName: "someone-elses.txt" });
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is BLOCKED_ENV (never a fetch) when the attachment id is unset", async () => {
    const deps = depsWith();
    const noAtt = (n: string) => (n === "SMOKE_GMAIL_ATTACHMENT_ID" ? undefined : env(n));
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: noAtt }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});

describe("smoke multipart attachment MIME is extractor-readable", () => {
  it("extractAttachmentMetadata finds the marker-named attachment part", () => {
    // Mirror the shape a format=full get returns for the helper's multipart message,
    // so the seam's attachmentId resolution is exercised without a live Gmail call.
    const message = {
      id: MSG_ID,
      threadId: MSG_ID,
      labelIds: ["SENT", "INBOX"],
      snippet: "",
      sizeEstimate: 0,
      payload: {
        mimeType: "multipart/mixed",
        headers: [],
        parts: [
          { mimeType: "text/plain", filename: "", headers: [], body: { size: 10 } },
          {
            mimeType: "text/plain",
            filename: `${MARKER}attach.txt`,
            headers: [],
            body: { attachmentId: ATT_ID, size: 20 },
          },
        ],
      },
    };
    const atts = extractAttachmentMetadata(message as never);
    expect(atts).toHaveLength(1);
    expect(atts[0]).toMatchObject({ attachmentId: ATT_ID, filename: `${MARKER}attach.txt` });
  });
});
