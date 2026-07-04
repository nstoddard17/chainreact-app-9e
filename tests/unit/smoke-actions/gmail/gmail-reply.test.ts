/**
 * @jest-environment node
 *
 * Write smoke harness — Gmail reply lifecycle (reply_to_email / create_draft_reply).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE boundary
 * (mock only the external seam; run the real gate / ledger / phase / verify logic).
 * Protects the contracts that matter:
 *   - each seeds a self-sent message, then replies / draft-replies to it;
 *   - an INDEPENDENT message_labels read-back proves SENT (reply) or DRAFT (draft-reply),
 *     the same threadId as the seed, and the Re: marker on subject;
 *   - cleanupAll trashes BOTH the seed and the reply/draft (cleanupKind delete -> cleaned);
 *   - a wrong thread / wrong label read-back is VERIFY_FAILED (no vacuous pass);
 *   - the self-address env gates with BLOCKED_ENV (never a mutation) when unset.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const SEED_ID = "seed19f2"; // a first message's id == its threadId
const REPLY_ID = "reply19f3";
const SELF = "smoke@example.com";

const env = (n: string): string | undefined =>
  n === "SMOKE_GMAIL_CONNECTED" ? "1" : n === "SMOKE_GMAIL_SELF" ? SELF : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/** `read` scripts the message_labels read-back (threadId / labelIds / subject). */
function depsWith(read: { threadId: string; labelIds: string[]; subject: string }): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "send_email") {
        return { ok: true, output: { id: SEED_ID, threadId: SEED_ID, labelIds: ["SENT", "INBOX"] }, reason: null };
      }
      if (input.action === "reply_to_email") {
        return { ok: true, output: { id: REPLY_ID, threadId: SEED_ID, labelIds: ["SENT"] }, reason: null };
      }
      if (input.action === "create_draft_reply") {
        return { ok: true, output: { draftId: "r-1", messageId: REPLY_ID, threadId: SEED_ID }, reason: null };
      }
      return { ok: true, output: null, reason: null };
    },
    async smokeReadBack(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "message_labels") {
        return { ok: true, output: { found: true, ...read }, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

describe("gmail:reply_to_email", () => {
  it("seeds + replies, proves SENT + same thread + marker, then trashes both (cleaned)", async () => {
    const deps = depsWith({ threadId: SEED_ID, labelIds: ["SENT"], subject: `Re: ${MARKER}replyseed` });
    const r = await runWriteSmoke(fixtureFor("gmail:reply_to_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.created).toBe(2); // seed + reply
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "send_email",
      "reply_to_email",
      "message_labels",
      "delete_email", // seed
      "delete_email", // reply
    ]);
    expect(deps.calls.find((c) => c.action === "reply_to_email")!.config.originalMessageId).toBe(SEED_ID);
  });

  it("is VERIFY_FAILED when the reply is in a different thread", async () => {
    const deps = depsWith({ threadId: "OTHER", labelIds: ["SENT"], subject: `Re: ${MARKER}replyseed` });
    const r = await runWriteSmoke(fixtureFor("gmail:reply_to_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    expect(r.artifact).toBe("cleaned"); // cleanupAll still trashes both
  });

  it("is BLOCKED_ENV (never a send) when the self address is unset", async () => {
    const deps = depsWith({ threadId: SEED_ID, labelIds: ["SENT"], subject: "" });
    const noSelf = (n: string) => (n === "SMOKE_GMAIL_SELF" ? undefined : env(n));
    const r = await runWriteSmoke(fixtureFor("gmail:reply_to_email"), { ...RUN, envLookup: noSelf }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});

describe("gmail:create_draft_reply", () => {
  it("seeds + draft-replies, proves DRAFT + same thread + marker, then trashes both", async () => {
    const deps = depsWith({ threadId: SEED_ID, labelIds: ["DRAFT"], subject: `Re: ${MARKER}draftreplyseed` });
    const r = await runWriteSmoke(fixtureFor("gmail:create_draft_reply"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.created).toBe(2);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "send_email",
      "create_draft_reply",
      "message_labels",
      "delete_email",
      "delete_email",
    ]);
  });

  it("is VERIFY_FAILED when the draft-reply is not a DRAFT", async () => {
    const deps = depsWith({ threadId: SEED_ID, labelIds: ["SENT"], subject: `Re: ${MARKER}draftreplyseed` });
    const r = await runWriteSmoke(fixtureFor("gmail:create_draft_reply"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
