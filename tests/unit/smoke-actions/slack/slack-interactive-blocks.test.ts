/**
 * @jest-environment node
 *
 * Write smoke harness — Slack post_interactive_blocks (writeSafe).
 *
 * Drives the fixture through the pure `runWriteSmoke` orchestrator over a FAKE boundary
 * (mock only the external seam; run the real gate / ledger / phase / verify logic).
 * Protects the contracts that matter:
 *   - a MINIMAL VALID Block Kit payload with the marker INSIDE the block text (no
 *     top-level fallback) — a read-back hit proves the block round-tripped;
 *   - post_interactive_blocks posts + captures the message ts;
 *   - an INDEPENDENT get_messages read-back proves the block marker delivered (the post
 *     echo is never trusted);
 *   - a read-back WITHOUT the marker is VERIFY_FAILED (no vacuous pass);
 *   - delete_message cleanup removes the block message (cleanupKind delete -> cleaned);
 *   - the smoke-channel env gates with BLOCKED_ENV (never "not connected", never a post).
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const CHANNEL_ID = "C_SMOKE1";
const TS = "1730000000.000100";

const env = (n: string): string | undefined =>
  n === "SMOKE_SLACK_CONNECTED" ? "1" : n === "SMOKE_SLACK_CHANNEL_ID" ? CHANNEL_ID : undefined;

const fixture = (): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "slack:post_interactive_blocks")!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/** Fake boundary: the block post returns a ts; get_messages returns `listMessages`. */
function depsWith(listMessages: readonly Record<string, unknown>[]): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "post_interactive_blocks") {
        return { ok: true, output: { channel: CHANNEL_ID, ts: TS, message: {} }, reason: null };
      }
      if (input.action === "get_messages") {
        return { ok: true, output: { messages: listMessages, count: listMessages.length }, reason: null };
      }
      return { ok: true, output: null, reason: null };
    },
  };
}

// A conversations.history entry echoing the marker inside the section block text.
const blockMsg = () => [
  { ts: TS, blocks: [{ type: "section", text: { type: "mrkdwn", text: `${MARKER}blocks hi` } }] },
];

describe("slack:post_interactive_blocks: shape", () => {
  it("is a writeSafe fixture with a minimal valid block payload and delete cleanup", () => {
    const f = fixture();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("writeSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.captureResource?.idPath).toBe("ts");
    expect(f.writeHarness?.cleanup?.action).toBe("delete_message");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
    // minimal valid blocks payload: a section block with a non-empty string `type`,
    // and the marker lives INSIDE the block (no top-level fallback `text`).
    const blocks = f.config.blocks as { type: string; text: { text: string } }[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("section");
    expect(blocks[0]!.text.text).toContain("{{smokeMarker}}blocks");
    expect(f.config.text).toBeUndefined();
    expect(f.writeHarness?.verify?.markerSuffix).toBe("blocks");
  });
});

describe("slack:post_interactive_blocks", () => {
  it("posts the block, proves the block marker via get_messages, then deletes (cleaned)", async () => {
    const deps = depsWith(blockMsg());
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
    expect(r.ledger.cleaned).toBe(r.ledger.created);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "join_channel",
      "post_interactive_blocks",
      "get_messages",
      "delete_message",
    ]);
    // the marker resolved inside the nested block text (not a top-level fallback).
    const post = deps.calls.find((c) => c.action === "post_interactive_blocks")!;
    const blocks = post.config.blocks as { text: { text: string } }[];
    expect(blocks[0]!.text.text).toContain(`${MARKER}blocks`);
    // cleanup deletes the captured ts.
    expect(deps.calls.find((c) => c.action === "delete_message")!.config.ts).toBe(TS);
  });

  it("is VERIFY_FAILED when the block marker is not in the read-back", async () => {
    const deps = depsWith([]); // history returns nothing -> marker absent
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    // cleanup still deletes the smoke-owned message -> never a leak.
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
  });

  it("is BLOCKED_ENV (never a post) when the smoke channel is unset", async () => {
    const deps = depsWith(blockMsg());
    const noChannel = (n: string) => (n === "SMOKE_SLACK_CHANNEL_ID" ? undefined : env(n));
    const r = await runWriteSmoke(fixture(), { ...RUN, envLookup: noChannel }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});
