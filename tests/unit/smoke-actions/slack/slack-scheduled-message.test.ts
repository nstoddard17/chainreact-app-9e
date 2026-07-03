/**
 * @jest-environment node
 *
 * Write smoke harness — Slack scheduled-message batch (schedule + cancel).
 *
 * Drives each new WRITE fixture through the pure `runWriteSmoke` orchestrator over a
 * FAKE boundary (mock only the external seam; run the real gate / ledger / phase /
 * verify logic). Protects the contracts that matter:
 *   - schedule_message : join -> schedule (capture scheduledMessageId) -> INDEPENDENT
 *     list_scheduled_messages read-back proves the run marker is queued -> cancel
 *     disposition (scheduled message gone, cleanupKind delete -> artifact cleaned).
 *   - cancel_scheduled_message : join + schedule -> cancel (executeIsCleanup) ->
 *     list_scheduled_messages read-back proves the marker is ABSENT.
 *   - the scheduled-message read-back, never the action echo, is the proof.
 *   - a read-back with the WRONG queue state is VERIFY_FAILED (no vacuous pass).
 *   - the future post_at env gates with BLOCKED_ENV (never "not connected", never a
 *     mutation) when unset.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const CHANNEL_ID = "C_SMOKE1";
const SCHED_ID = "Q1234567";

const env = (n: string): string | undefined =>
  n === "SMOKE_SLACK_CONNECTED"
    ? "1"
    : n === "SMOKE_SLACK_CHANNEL_ID"
      ? CHANNEL_ID
      : n === "SMOKE_SLACK_POST_AT"
        ? "1799999999"
        : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/**
 * Fake boundary. schedule_message captures a stable scheduledMessageId; the
 * `listMessages` factory decides what list_scheduled_messages returns (present /
 * absent) so a verify can be exercised both ways. join + cancel are ok.
 */
function depsWith(listMessages: readonly Record<string, unknown>[]): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "schedule_message") {
        return {
          ok: true,
          output: { channel: CHANNEL_ID, scheduledMessageId: SCHED_ID, postAt: 1799999999 },
          reason: null,
        };
      }
      if (input.action === "list_scheduled_messages") {
        return { ok: true, output: { messages: listMessages, count: listMessages.length }, reason: null };
      }
      return { ok: true, output: null, reason: null };
    },
  };
}

const queued = (suffix: string) => [{ id: SCHED_ID, channel_id: CHANNEL_ID, text: `${MARKER}${suffix} hi` }];

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("slack scheduled-message batch: shape", () => {
  it("schedule_message is a writeSafe fixture that cancels as cleanup", () => {
    const f = fixtureFor("slack:schedule_message");
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("writeSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.captureResource?.idPath).toBe("scheduledMessageId");
    expect(f.writeHarness?.cleanup?.action).toBe("cancel_scheduled_message");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
    expect(f.writeHarness?.verify?.action).toBe("list_scheduled_messages");
  });

  it("cancel_scheduled_message is a destructiveSafe execute-is-cleanup fixture", () => {
    const f = fixtureFor("slack:cancel_scheduled_message");
    expect(f.risk).toBe("destructive");
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.executeIsCleanup).toBe(true);
    expect(f.writeHarness?.setup?.map((s) => s.action)).toEqual(["join_channel", "schedule_message"]);
    expect(f.writeHarness?.verify?.action).toBe("list_scheduled_messages");
  });
});

// ─── schedule_message ─────────────────────────────────────────────────────────

describe("slack:schedule_message", () => {
  it("joins, schedules, proves the marker is queued, then cancels (artifact cleaned)", async () => {
    const deps = depsWith(queued("sched"));
    const r = await runWriteSmoke(fixtureFor("slack:schedule_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "join_channel",
      "schedule_message",
      "list_scheduled_messages",
      "cancel_scheduled_message",
    ]);
    // cancel targets the captured scheduled-message id (never a literal).
    const cancel = deps.calls.find((c) => c.action === "cancel_scheduled_message")!;
    expect(cancel.config.scheduledMessageId).toBe(SCHED_ID);
  });

  it("is VERIFY_FAILED when the scheduled marker is NOT in the list read-back", async () => {
    const deps = depsWith([]); // list returns nothing -> marker absent
    const r = await runWriteSmoke(fixtureFor("slack:schedule_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    // cleanup still cancels the smoke-owned scheduled message -> never a leak.
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
  });

  it("is BLOCKED_ENV (never a mutation) when the future post_at is unset", async () => {
    const deps = depsWith(queued("sched"));
    const noPostAt = (n: string) => (n === "SMOKE_SLACK_POST_AT" ? undefined : env(n));
    const r = await runWriteSmoke(fixtureFor("slack:schedule_message"), { ...RUN, envLookup: noPostAt }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});

// ─── cancel_scheduled_message ─────────────────────────────────────────────────

describe("slack:cancel_scheduled_message", () => {
  it("schedules then cancels, proves the marker is gone (executeIsCleanup, cleaned)", async () => {
    const deps = depsWith([]); // after cancel, the list is empty -> marker absent
    const r = await runWriteSmoke(fixtureFor("slack:cancel_scheduled_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "join_channel",
      "schedule_message",
      "cancel_scheduled_message",
      "list_scheduled_messages",
    ]);
    const cancel = deps.calls.find((c) => c.action === "cancel_scheduled_message")!;
    expect(cancel.config.scheduledMessageId).toBe(SCHED_ID);
  });

  it("is VERIFY_FAILED when the scheduled marker is STILL queued after cancel", async () => {
    const deps = depsWith(queued("cancel")); // list still shows our message
    const r = await runWriteSmoke(fixtureFor("slack:cancel_scheduled_message"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
