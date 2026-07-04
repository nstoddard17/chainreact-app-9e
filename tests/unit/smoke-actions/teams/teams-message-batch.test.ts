/**
 * @jest-environment node
 *
 * Write smoke harness — Teams message finisher batch (send_channel_message,
 * reply_to_channel_message, send_chat_message).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE
 * boundary. Protects the contracts that matter:
 *   - all three are sendSafe with NO cleanup (no registered Teams message delete)
 *     -> artifact honestly "left";
 *   - verifies go through the per-message body seams (channel_message_state /
 *     chat_message_state) because the registered list read is header-only;
 *   - the reply verify passes parentMessageId (Graph serves replies only under
 *     the parent's /replies subpath) and proves BOTH the marker(+suffix) body
 *     AND replyToId == the captured parent id;
 *   - a wrong/missing read-back is VERIFY_FAILED (no vacuous pass);
 *   - all gate BLOCKED_ENV without their target env.
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
const TEAM = "team-1";
const CHANNEL = "chan-1";
const CHAT = "chat-1";

const env = (n: string): string | undefined =>
  n === "SMOKE_MICROSOFT_TEAMS_CONNECTED"
    ? "true"
    : n === "SMOKE_TEAMS_TEAM_ID"
      ? TEAM
      : n === "SMOKE_TEAMS_CHANNEL_ID"
        ? CHANNEL
        : n === "SMOKE_TEAMS_CHAT_ID"
          ? CHAT
          : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

const BATCH = [
  "microsoft-teams:send_channel_message",
  "microsoft-teams:reply_to_channel_message",
  "microsoft-teams:send_chat_message",
] as const;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/** Fake boundary; `reads` overrides a seam action's output. */
function depsWith(reads: Record<string, Record<string, unknown>> = {}): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  let sendCount = 0;
  return {
    calls,
    async runActionStep(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "send_channel_message":
          sendCount += 1;
          return {
            ok: true,
            output: { messageId: `m-${sendCount}`, bodyContent: input.config.content, replyToId: null },
            reason: null,
          };
        case "reply_to_channel_message":
          return {
            ok: true,
            output: {
              messageId: "r-1",
              bodyContent: input.config.content,
              replyToId: input.config.messageId,
              parentMessageId: input.config.messageId,
            },
            reason: null,
          };
        case "send_chat_message":
          return {
            ok: true,
            output: { messageId: "cm-1", bodyContent: input.config.content, chatId: input.config.chatId },
            reason: null,
          };
        default:
          return { ok: false, output: null, reason: `no plan for ${input.action}` };
      }
    },
    async smokeReadBack(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (reads[input.action]) return { ok: true, output: reads[input.action]!, reason: null };
      if (input.action === "channel_message_state") {
        // Default: echo a body carrying the marker; reply flavor when parent given.
        const isReply = typeof input.config.parentMessageId === "string";
        return {
          ok: true,
          output: {
            found: true,
            bodyContent: isReply ? `${MARKER}reply - safe to ignore` : `${MARKER}channel message - safe to ignore`,
            replyToId: isReply ? input.config.parentMessageId : null,
          },
          reason: null,
        };
      }
      if (input.action === "chat_message_state") {
        return {
          ok: true,
          output: { found: true, bodyContent: `${MARKER}chat message - safe to ignore`, replyToId: null },
          reason: null,
        };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("teams message batch — shape", () => {
  it("all three are sendSafe with NO cleanup (no registered Teams message delete)", () => {
    for (const key of BATCH) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.liveClass).toBe("sendSafe");
      expect(f.writeHarness?.cleanup).toBeUndefined();
      expect(f.writeHarness?.cleanupEach).toBeUndefined();
      expect(f.writeHarness?.cleanupKind).toBeUndefined();
      expect(f.writeHarness?.verify?.smokeRead).toBe(true);
      expect(f.liveSafe).toBe(false);
      expect(f.liveRisk).toBe("write");
    }
  });

  it("channel sends verify via channel_message_state; chat via chat_message_state", () => {
    expect(fixtureFor("microsoft-teams:send_channel_message").writeHarness?.verify?.action).toBe("channel_message_state");
    expect(fixtureFor("microsoft-teams:reply_to_channel_message").writeHarness?.verify?.action).toBe("channel_message_state");
    expect(fixtureFor("microsoft-teams:send_chat_message").writeHarness?.verify?.action).toBe("chat_message_state");
  });

  it("the reply verify threads through the parent subpath and asserts replyToId", () => {
    const f = fixtureFor("microsoft-teams:reply_to_channel_message");
    expect(f.writeHarness?.verify?.config.parentMessageId).toBe("{{ledger.parent.id}}");
    expect(f.writeHarness?.verify?.markerSuffix).toBe("reply");
    expect(f.writeHarness?.verify?.expectEquals).toEqual({
      path: "replyToId",
      value: "{{ledger.parent.id}}",
    });
  });
});

// ─── Flows ───────────────────────────────────────────────────────────────────

describe("teams message batch — flows", () => {
  it("send_channel_message: PASS, seam read-back on the captured id, artifact left", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("microsoft-teams:send_channel_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    const verify = deps.calls.find((c) => c.action === "channel_message_state");
    expect(verify?.config.messageId).toBe("m-1"); // ledger-resolved capture
    expect(verify?.config.teamId).toBe(TEAM);
  });

  it("send_channel_message: a read-back without the marker is VERIFY_FAILED", async () => {
    const deps = depsWith({
      channel_message_state: { found: true, bodyContent: "someone elses message", replyToId: null },
    });
    const r = await runWriteSmoke(fixtureFor("microsoft-teams:send_channel_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("reply_to_channel_message: parent then reply; verify proves body + threading", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("microsoft-teams:reply_to_channel_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "send_channel_message",
      "reply_to_channel_message",
      "channel_message_state",
    ]);
    const exec = deps.calls.find((c) => c.action === "reply_to_channel_message");
    expect(exec?.config.messageId).toBe("m-1"); // the captured parent
    const verify = deps.calls.find((c) => c.action === "channel_message_state");
    expect(verify?.config.messageId).toBe("r-1");
    expect(verify?.config.parentMessageId).toBe("m-1");
    expect(r.ledger.created).toBe(2); // parent + reply, both honestly left
    expect(r.artifact).toBe("left");
  });

  it("reply_to_channel_message: a read-back with the wrong replyToId is VERIFY_FAILED", async () => {
    const deps = depsWith({
      channel_message_state: {
        found: true,
        bodyContent: `${MARKER}reply - safe to ignore`,
        replyToId: "some-other-parent",
      },
    });
    const r = await runWriteSmoke(fixtureFor("microsoft-teams:reply_to_channel_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("send_chat_message: PASS against the discovered chat; artifact left", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("microsoft-teams:send_chat_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    const exec = deps.calls.find((c) => c.action === "send_chat_message");
    expect(exec?.config.chatId).toBe(CHAT);
    const verify = deps.calls.find((c) => c.action === "chat_message_state");
    expect(verify?.config.messageId).toBe("cm-1");
  });

  it("send_chat_message: BLOCKED_ENV without a discovered chat", async () => {
    const deps = depsWith();
    const noChat = (n: string): string | undefined => (n === "SMOKE_TEAMS_CHAT_ID" ? undefined : env(n));
    const r = await runWriteSmoke(fixtureFor("microsoft-teams:send_chat_message"), { ...RUN, envLookup: noChat }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});
