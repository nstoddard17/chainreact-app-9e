/**
 * @jest-environment node
 *
 * Write smoke harness — Slack pin batch (pin_message + unpin_message).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE boundary
 * (mock only the external seam; run the real gate / ledger / phase / verify logic).
 * Protects the contracts that matter:
 *   - pin_message posts a message, pins it, and an INDEPENDENT message_state read-back
 *     proves `pinned == true` (derived from Slack's pinned_to, so NO pins:read needed);
 *   - unpin_message pins in setup, unpins, and message_state proves `pinned == false`;
 *   - the pin/unpin echo is never trusted (a wrong read-back is VERIFY_FAILED);
 *   - both delete the smoke message (cleanupKind delete -> cleaned, 0 leaked);
 *   - the smoke-channel env gates with BLOCKED_ENV when unset.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const CHANNEL_ID = "C_SMOKE1";
const TS = "1730000000.000100";

const env = (n: string): string | undefined =>
  n === "SMOKE_SLACK_CONNECTED" ? "1" : n === "SMOKE_SLACK_CHANNEL_ID" ? CHANNEL_ID : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/** Fake boundary: send captures a ts; message_state reports the scripted pinned state. */
function depsWith(pinnedReadBack: boolean): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "send_channel_message") {
        return { ok: true, output: { channel: CHANNEL_ID, ts: TS }, reason: null };
      }
      return { ok: true, output: null, reason: null };
    },
    async smokeReadBack(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "message_state") {
        return { ok: true, output: { found: true, text: "", reactions: [], pinned: pinnedReadBack }, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

describe("slack pin batch: shape", () => {
  it.each(["slack:pin_message", "slack:unpin_message"] as const)(
    "%s is a writeSafe fixture verified via message_state pinned + delete cleanup",
    (key) => {
      const f = fixtureFor(key);
      expect(f.risk).toBe("write");
      expect(f.writeHarness?.liveClass).toBe("writeSafe");
      expect(f.writeHarness?.verify?.action).toBe("message_state");
      expect(f.writeHarness?.verify?.expectEquals?.path).toBe("pinned");
      expect(f.writeHarness?.cleanup?.action).toBe("delete_message");
      expect(f.writeHarness?.cleanupKind).toBe("delete");
    },
  );

  it("unpin_message pins the message in setup before unpinning", () => {
    expect(fixtureFor("slack:unpin_message").writeHarness?.setup?.map((s) => s.action)).toEqual([
      "join_channel",
      "send_channel_message",
      "pin_message",
    ]);
  });
});

describe("slack:pin_message", () => {
  it("posts, pins, proves pinned==true, then deletes (cleaned)", async () => {
    const deps = depsWith(true);
    const r = await runWriteSmoke(fixtureFor("slack:pin_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "join_channel",
      "send_channel_message",
      "pin_message",
      "message_state",
      "delete_message",
    ]);
  });

  it("is VERIFY_FAILED when the read-back does not show the message pinned", async () => {
    const deps = depsWith(false);
    const r = await runWriteSmoke(fixtureFor("slack:pin_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    expect(r.artifact).toBe("cleaned"); // cleanup still deletes the smoke message
  });

  it("is BLOCKED_ENV (never a pin) when the smoke channel is unset", async () => {
    const deps = depsWith(true);
    const noChannel = (n: string) => (n === "SMOKE_SLACK_CHANNEL_ID" ? undefined : env(n));
    const r = await runWriteSmoke(fixtureFor("slack:pin_message"), { ...RUN, envLookup: noChannel }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});

describe("slack:unpin_message", () => {
  it("pins in setup, unpins, proves pinned==false, then deletes (cleaned)", async () => {
    const deps = depsWith(false);
    const r = await runWriteSmoke(fixtureFor("slack:unpin_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "join_channel",
      "send_channel_message",
      "pin_message",
      "unpin_message",
      "message_state",
      "delete_message",
    ]);
  });

  it("is VERIFY_FAILED when the read-back still shows the message pinned", async () => {
    const deps = depsWith(true);
    const r = await runWriteSmoke(fixtureFor("slack:unpin_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
