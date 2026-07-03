/**
 * @jest-environment node
 *
 * Write smoke harness — Slack send_direct_message (sendSafe).
 *
 * Drives the fixture through the pure `runWriteSmoke` orchestrator over a FAKE boundary
 * (mock only the external seam; run the real gate / ledger / phase / verify logic).
 * Protects the contracts that matter:
 *   - send_direct_message resolves + posts a DM, capturing the resolved DM channel id;
 *   - an INDEPENDENT get_messages read-back of that DM proves the run marker delivered
 *     (the send echo is never trusted);
 *   - a read-back WITHOUT the marker is VERIFY_FAILED (no vacuous pass);
 *   - sendSafe leaves the delivered DM as a harmless artifact (no cleanup);
 *   - the discovered-user env gates with BLOCKED_ENV (never "not connected", never a
 *     send) when unset.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const DM_CHANNEL = "D_SMOKE1";
const USER_ID = "UHUMAN1";

const env = (n: string): string | undefined =>
  n === "SMOKE_SLACK_CONNECTED" ? "1" : n === "SMOKE_SLACK_INVITE_USER_ID" ? USER_ID : undefined;

const fixture = (): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "slack:send_direct_message")!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/** Fake boundary: DM send resolves a channel id; get_messages returns `listMessages`. */
function depsWith(listMessages: readonly Record<string, unknown>[]): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "send_direct_message") {
        return { ok: true, output: { channel: DM_CHANNEL, ts: "1.1", userId: USER_ID }, reason: null };
      }
      if (input.action === "get_messages") {
        return { ok: true, output: { messages: listMessages, count: listMessages.length }, reason: null };
      }
      return { ok: true, output: null, reason: null };
    },
  };
}

describe("slack:send_direct_message: shape", () => {
  it("is a sendSafe fixture that captures the DM channel and verifies via get_messages", () => {
    const f = fixture();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("sendSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.captureResource?.idPath).toBe("channel");
    expect(f.writeHarness?.verify?.action).toBe("get_messages");
    expect(f.writeHarness?.verify?.markerSuffix).toBe("dm");
    // sendSafe: a delivered DM has no provider cleanup.
    expect(f.writeHarness?.cleanup).toBeUndefined();
    expect(f.writeHarness?.cleanupKind).toBeUndefined();
  });
});

describe("slack:send_direct_message", () => {
  it("sends a DM, proves the marker via get_messages read-back (delivered artifact left)", async () => {
    const deps = depsWith([{ text: `${MARKER}dm hi`, ts: "1.1" }]);
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    // A delivered DM is left as a harmless artifact (sendSafe: no cleanup).
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["send_direct_message", "get_messages"]);
    // the recipient user id came from env; the read-back targets the captured DM channel.
    expect(deps.calls[0]!.config.userId).toBe(USER_ID);
    expect(deps.calls[1]!.config.channel).toBe(DM_CHANNEL);
  });

  it("is VERIFY_FAILED when the DM marker is not in the read-back", async () => {
    const deps = depsWith([]); // get_messages returns nothing -> marker absent
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is BLOCKED_ENV (never a send) when the discovered user id is unset", async () => {
    const deps = depsWith([{ text: `${MARKER}dm hi` }]);
    const noUser = (n: string) => (n === "SMOKE_SLACK_INVITE_USER_ID" ? undefined : env(n));
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: noUser }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});
