/**
 * @jest-environment node
 *
 * Write smoke harness — Outlook mail finisher batch (send_email, reply_to_email,
 * forward_email, add_categories, move_email, delete_email, get_attachment).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE
 * boundary. Protects the contracts that matter:
 *   - Graph mail mutations return 202 with NO id, so send/reply/forward capture
 *     their created copies from the find_messages seam's `matches` (idsPath) and
 *     cleanupEach permanently deletes exactly those captured ids;
 *   - categories/move/trash run on smoke-owned DRAFTS (create_draft_email setup);
 *   - move_email re-keys: the execute capture REPLACES the ledger entry (same
 *     resourceKey) so cleanup targets the live newId;
 *   - delete_email(trash) is executeIsCleanup with a POSITIVE deleteditems
 *     folder-poll proof;
 *   - get_attachment stages to v2_storage and verifies via the metadata-only
 *     staged_file seam (file-output contract: no bytes anywhere);
 *   - wrong/empty read-backs are VERIFY_FAILED (no vacuous pass);
 *   - env-dependent fixtures gate BLOCKED_ENV without their seed/self env.
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
const SELF = "smoke@self.test";
const SEED_REPLY = "seed-reply-1";
const SEED_FWD = "seed-fwd-1";
const SEED_ATTACH = "seed-attach-1";
const STAGED_PATH = "u1/w1/r1/n1/crsmoke-T1-attach.txt";

const env = (n: string): string | undefined =>
  n === "SMOKE_MICROSOFT_OUTLOOK_CONNECTED"
    ? "true"
    : n === "SMOKE_OUTLOOK_SELF"
      ? SELF
      : n === "SMOKE_OUTLOOK_SEED_REPLY_ID"
        ? SEED_REPLY
        : n === "SMOKE_OUTLOOK_SEED_FWD_ID"
          ? SEED_FWD
          : n === "SMOKE_OUTLOOK_ATTACHMENT_MESSAGE_ID"
            ? SEED_ATTACH
            : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/** Fake boundary; `reads` overrides a smoke-read action's output. */
function depsWith(reads: Record<string, Record<string, unknown>> = {}): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "create_draft_email":
          return { ok: true, output: { draftId: "draft-1", subject: input.config.subject }, reason: null };
        case "send_email":
          return { ok: true, output: { sent: true, subject: input.config.subject }, reason: null };
        case "reply_to_email":
          return { ok: true, output: { replied: true, replyAll: false, originalEmailId: input.config.emailId }, reason: null };
        case "forward_email":
          return { ok: true, output: { forwarded: true, originalEmailId: input.config.emailId }, reason: null };
        case "add_categories":
          return { ok: true, output: { categorized: true, emailId: input.config.emailId, categories: [`${MARKER}cat`] }, reason: null };
        case "move_email":
          return { ok: true, output: { moved: true, emailId: input.config.emailId, newId: "draft-1-moved", destinationFolderId: input.config.destinationFolderId }, reason: null };
        case "delete_email":
          return { ok: true, output: { deleted: true, emailId: input.config.emailId, mode: input.config.deleteMode }, reason: null };
        case "get_attachment":
          return {
            ok: true,
            output: {
              attachments: [
                {
                  file: { kind: "v2_storage", name: `${MARKER}attach.txt`, mimeType: "text/plain", storagePath: STAGED_PATH },
                  id: "att-1",
                  name: `${MARKER}attach.txt`,
                  contentType: "text/plain",
                  size: 42,
                  subtype: "fileAttachment",
                  skipped: false,
                },
              ],
              count: 1,
              downloadedCount: 1,
              totalSize: 42,
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
      switch (input.action) {
        case "find_messages":
          return {
            ok: true,
            output: {
              found: true,
              count: 2,
              matches: [{ id: "copy-a" }, { id: "copy-b" }],
              subjects: [`${MARKER}subject one`, `RE: ${MARKER}subject one`],
            },
            reason: null,
          };
        case "message_state":
          return {
            ok: true,
            output: { found: true, subject: `${MARKER}categories draft - safe to ignore`, categories: [`${MARKER}cat`], isRead: false },
            reason: null,
          };
        case "staged_file":
          return { ok: true, output: { exists: true, sizeBytes: 42 }, reason: null };
        default:
          return { ok: false, output: null, reason: "no plan" };
      }
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("outlook mail batch — shape", () => {
  it("send/reply/forward capture seam matches (idsPath) and cleanupEach with permanent delete", () => {
    for (const key of [
      "microsoft-outlook:send_email",
      "microsoft-outlook:reply_to_email",
      "microsoft-outlook:forward_email",
    ] as const) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.writeHarness?.verify?.smokeRead).toBe(true);
      expect(f.writeHarness?.verify?.action).toBe("find_messages");
      expect(f.writeHarness?.verify?.captureResource?.idsPath).toBe("matches");
      expect(f.writeHarness?.cleanupEach?.action).toBe("delete_email");
      expect(f.writeHarness?.cleanupEach?.config.deleteMode).toBe("permanent");
      expect(f.writeHarness?.cleanupKind).toBe("delete");
    }
  });

  it("reply/forward exclude their seed via the re/fw prefix filter", () => {
    expect(fixtureFor("microsoft-outlook:reply_to_email").writeHarness?.verify?.config.prefix).toBe("re");
    expect(fixtureFor("microsoft-outlook:forward_email").writeHarness?.verify?.config.prefix).toBe("fw");
  });

  it("categories/move/delete run on smoke-owned drafts created in setup", () => {
    for (const key of [
      "microsoft-outlook:add_categories",
      "microsoft-outlook:move_email",
      "microsoft-outlook:delete_email",
    ] as const) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.setup?.[0]?.action).toBe("create_draft_email");
      expect(f.writeHarness?.setup?.[0]?.captureResource?.resourceKey).toBe("draft");
      expect(f.config.emailId).toBe("{{ledger.draft.id}}");
    }
  });

  it("get_attachment verifies via the metadata-only staged_file seam", () => {
    const f = fixtureFor("microsoft-outlook:get_attachment");
    expect(f.writeHarness?.verify?.action).toBe("staged_file");
    expect(f.writeHarness?.verify?.expectEquals).toEqual({ path: "exists", value: true });
    expect(f.writeHarness?.captureResource?.idPath).toBe("attachments.0.file.storagePath");
    expect(f.writeHarness?.markerEchoPath).toBe("attachments.0.name");
    expect(f.writeHarness?.cleanup).toBeUndefined();
  });
});

// ─── Flows ───────────────────────────────────────────────────────────────────

describe("outlook mail batch — flows", () => {
  it("send_email: PASS, both seam-captured copies cleaned via permanent delete", async () => {
    const deps = depsWith({
      find_messages: {
        found: true,
        count: 2,
        matches: [{ id: "copy-a" }, { id: "copy-b" }],
        subjects: [`${MARKER}send one`, `${MARKER}send one`],
      },
    });
    const r = await runWriteSmoke(fixtureFor("microsoft-outlook:send_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.created).toBe(2);
    expect(r.ledger.cleaned).toBe(2);
    const deletes = deps.calls.filter((c) => c.action === "delete_email");
    expect(deletes.map((c) => c.config.emailId).sort()).toEqual(["copy-a", "copy-b"]);
    expect(deletes.every((c) => c.config.deleteMode === "permanent")).toBe(true);
  });

  it("send_email: a not-found seam result is VERIFY_FAILED (no vacuous pass)", async () => {
    const deps = depsWith({ find_messages: { found: false, count: 0, matches: [], subjects: [] } });
    const r = await runWriteSmoke(fixtureFor("microsoft-outlook:send_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("send_email: BLOCKED_ENV without SMOKE_OUTLOOK_SELF", async () => {
    const deps = depsWith();
    const noSelf = (n: string): string | undefined => (n === "SMOKE_OUTLOOK_SELF" ? undefined : env(n));
    const r = await runWriteSmoke(fixtureFor("microsoft-outlook:send_email"), { ...RUN, envLookup: noSelf }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });

  it("reply_to_email: targets the env seed and cleans the captured RE copies", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("microsoft-outlook:reply_to_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    const exec = deps.calls.find((c) => c.action === "reply_to_email");
    expect(exec?.config.emailId).toBe(SEED_REPLY);
    const find = deps.calls.find((c) => c.action === "find_messages");
    expect(find?.config.prefix).toBe("re");
    expect(r.ledger.cleaned).toBe(2);
  });

  it("forward_email: forwards the env seed to SELF and cleans the captured FW copies", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("microsoft-outlook:forward_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    const exec = deps.calls.find((c) => c.action === "forward_email");
    expect(exec?.config.emailId).toBe(SEED_FWD);
    expect(exec?.config.to).toBe(SELF);
    expect(r.ledger.cleaned).toBe(2);
  });

  it("add_categories: marker category proven by message_state; draft permanently deleted", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("microsoft-outlook:add_categories"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    const exec = deps.calls.find((c) => c.action === "add_categories");
    expect(exec?.config.emailId).toBe("draft-1"); // ledger-resolved
    const cleanup = deps.calls.filter((c) => c.action === "delete_email");
    expect(cleanup).toHaveLength(1);
    expect(cleanup[0]!.config.emailId).toBe("draft-1");
  });

  it("add_categories: a read-back missing the category is VERIFY_FAILED (cleanup still runs)", async () => {
    const deps = depsWith({
      message_state: { found: true, subject: `${MARKER}categories draft`, categories: ["Other"], isRead: false },
    });
    const r = await runWriteSmoke(fixtureFor("microsoft-outlook:add_categories"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_email")).toBe(true);
  });

  it("move_email: newId replaces the ledger entry; cleanup deletes the moved id", async () => {
    const deps = depsWith({
      find_messages: { found: true, count: 1, matches: [{ id: "draft-1-moved" }], subjects: [`${MARKER}move draft - safe to ignore`] },
    });
    const r = await runWriteSmoke(fixtureFor("microsoft-outlook:move_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.created).toBe(1); // re-key REPLACED the entry, not a second resource
    const cleanup = deps.calls.filter((c) => c.action === "delete_email");
    expect(cleanup[0]!.config.emailId).toBe("draft-1-moved");
  });

  it("delete_email: executeIsCleanup with a positive deleteditems folder proof", async () => {
    const deps = depsWith({
      find_messages: { found: true, count: 1, matches: [{ id: "x" }], subjects: [`${MARKER}trashdelete draft - safe to ignore`] },
    });
    const r = await runWriteSmoke(fixtureFor("microsoft-outlook:delete_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    const exec = deps.calls.find((c) => c.action === "delete_email");
    expect(exec?.config.deleteMode).toBe("trash");
    const find = deps.calls.find((c) => c.action === "find_messages");
    expect(find?.config.folders).toBe("deleteditems");
  });

  it("get_attachment: stages to v2_storage; staged_file proves the object; artifact left", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("microsoft-outlook:get_attachment"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    const exec = deps.calls.find((c) => c.action === "get_attachment");
    expect(exec?.config.emailId).toBe(SEED_ATTACH);
    expect(exec?.config.fileNameFilter).toBe(MARKER);
    const seam = deps.calls.find((c) => c.action === "staged_file");
    expect(seam?.config.storagePath).toBe(STAGED_PATH);
  });

  it("get_attachment: a missing staged object is VERIFY_FAILED", async () => {
    const deps = depsWith({ staged_file: { exists: false, sizeBytes: 0 } });
    const r = await runWriteSmoke(fixtureFor("microsoft-outlook:get_attachment"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
