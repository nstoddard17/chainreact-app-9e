/**
 * @jest-environment node
 *
 * Write smoke harness — Gmail send_email (writeSafe, self-send).
 *
 * Drives the fixture through the pure `runWriteSmoke` orchestrator over a FAKE boundary
 * (mock only the external seam; run the real gate / ledger / phase / verify logic).
 * Protects the contracts that matter:
 *   - send_email sends to SELF, captures the message id;
 *   - an INDEPENDENT message_labels read-back proves labelIds contains SENT + the marker
 *     on subject (the send echo is never trusted);
 *   - delete_email(trash) cleans the single self-message (cleanupKind delete -> cleaned);
 *   - a wrong read-back is VERIFY_FAILED (no vacuous pass);
 *   - the self-address env gates with BLOCKED_ENV (never a send) when unset.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const MSG_ID = "19f2abc";
const SELF = "smoke@example.com";

const env = (n: string): string | undefined =>
  n === "SMOKE_GMAIL_CONNECTED" ? "1" : n === "SMOKE_GMAIL_SELF" ? SELF : undefined;

const fixture = (): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "gmail:send_email")!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(readBack: { labelIds: string[]; subject: string }): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "send_email") {
        return { ok: true, output: { id: MSG_ID, threadId: MSG_ID, labelIds: ["UNREAD", "SENT", "INBOX"] }, reason: null };
      }
      return { ok: true, output: null, reason: null };
    },
    async smokeReadBack(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "message_labels") {
        return { ok: true, output: { found: true, ...readBack }, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

describe("gmail:send_email: shape", () => {
  it("is a writeSafe self-send verified via message_labels SENT + subject, cleaned by trash", () => {
    const f = fixture();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("writeSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.config.to).toBe("{{env.SMOKE_GMAIL_SELF}}");
    expect(f.writeHarness?.captureResource?.idPath).toBe("id");
    expect(f.writeHarness?.verify?.action).toBe("message_labels");
    expect(f.writeHarness?.verify?.expectContains?.value).toBe("SENT");
    expect(f.writeHarness?.cleanup?.action).toBe("delete_email");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
  });
});

describe("gmail:send_email", () => {
  it("sends to self, proves SENT + marker via message_labels, then trashes it (cleaned)", async () => {
    const deps = depsWith({ labelIds: ["UNREAD", "SENT", "INBOX"], subject: `${MARKER}send hi` });
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual(["send_email", "message_labels", "delete_email"]);
    expect(deps.calls.find((c) => c.action === "delete_email")!.config.messageId).toBe(MSG_ID);
    expect(deps.calls.find((c) => c.action === "send_email")!.config.to).toBe(SELF);
  });

  it("is VERIFY_FAILED when the read-back lacks SENT", async () => {
    const deps = depsWith({ labelIds: ["DRAFT"], subject: `${MARKER}send hi` });
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    expect(r.artifact).toBe("cleaned"); // cleanup still trashes the message
  });

  it("is VERIFY_FAILED when the read-back subject lacks the marker", async () => {
    const deps = depsWith({ labelIds: ["SENT"], subject: "unrelated" });
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is BLOCKED_ENV (never a send) when the self address is unset", async () => {
    const deps = depsWith({ labelIds: ["SENT"], subject: `${MARKER}send` });
    const noSelf = (n: string) => (n === "SMOKE_GMAIL_SELF" ? undefined : env(n));
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: noSelf }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});
