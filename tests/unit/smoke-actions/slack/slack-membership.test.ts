/**
 * @jest-environment node
 *
 * Write smoke harness — Slack membership + channel-state batch (join / leave /
 * unarchive / invite / remove).
 *
 * Drives each new WRITE fixture through the pure `runWriteSmoke` orchestrator over a
 * FAKE boundary (mock only the external seam; run the real gate / ledger / phase /
 * verify logic). Protects the contracts that matter:
 *   - join_channel   : setup create + LEAVE (a genuine non-member) -> join -> verify
 *     is_member==true via the channel_state smoke read-back -> archive cleanup.
 *   - leave_channel  : setup create -> leave -> verify is_member==false -> archive.
 *   - unarchive_channel: setup create + archive -> unarchive -> verify
 *     is_archived==false -> re-archive cleanup.
 *   - invite_users_to_channel  : create -> invite -> channel_members CONTAINS the
 *     discovered smoke user id -> archive. Needs SMOKE_SLACK_INVITE_USER_ID (else
 *     BLOCKED_ENV — never "not connected", never a mutation).
 *   - remove_user_from_channel : create + invite -> kick -> channel_members ABSENT the
 *     user id -> archive.
 *   - all are writeSafe with cleanupKind "archive" (Slack has no hard channel delete),
 *     so a passing run reports artifact "archived", leaked 0.
 *   - a read-back with the WRONG membership state is VERIFY_FAILED (no vacuous pass).
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const CHANNEL_ID = "C_SMOKE1";
const USER_ID = "UHUMAN1";

const env = (n: string): string | undefined =>
  n === "SMOKE_SLACK_CONNECTED"
    ? "1"
    : n === "SMOKE_SLACK_CHANNEL_ID"
      ? CHANNEL_ID
      : n === "SMOKE_SLACK_INVITE_USER_ID"
        ? USER_ID
        : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
  readonly reads: { provider: string; action: string; config: Record<string, unknown> }[];
}

/**
 * Fake boundary: create_channel captures a stable id; every other write step is ok.
 * `readPlan` scripts the smoke read-back (channel_state / channel_members) outputs.
 */
function depsWith(readPlan: Record<string, StepRunOutcome>): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  const reads: RecordingDeps["reads"] = [];
  return {
    calls,
    reads,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "create_channel") {
        return { ok: true, output: { id: CHANNEL_ID, name: String(input.config.name ?? "") }, reason: null };
      }
      return { ok: true, output: null, reason: null };
    },
    async smokeReadBack(input) {
      reads.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      return readPlan[`${input.provider}:${input.action}`] ?? { ok: false, output: null, reason: "no plan" };
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("slack membership batch: shape", () => {
  const KEYS = [
    "slack:join_channel",
    "slack:leave_channel",
    "slack:unarchive_channel",
    "slack:invite_users_to_channel",
    "slack:remove_user_from_channel",
  ] as const;

  it.each(KEYS)("%s is a registered writeSafe fixture with an archive disposition", (key) => {
    const f = fixtureFor(key);
    expect(f).toBeDefined();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("writeSafe");
    expect(f.liveSafe).toBe(false); // write fixtures NEVER run via the read live runner
    expect(f.writeHarness?.smokeMarker).toBe("crsmoke-");
    expect(f.writeHarness?.cleanupKind).toBe("archive");
    // Disposition ends in archive_channel — either a single cleanup or the last step
    // of a cleanupAll chain (leave_channel must rejoin before it can archive).
    const wh = f.writeHarness!;
    const lastCleanupAction = wh.cleanupAll
      ? wh.cleanupAll[wh.cleanupAll.length - 1]!.action
      : wh.cleanup?.action;
    expect(lastCleanupAction).toBe("archive_channel");
  });

  it("slack:leave_channel disposes via a rejoin + archive cleanupAll chain", () => {
    const wh = fixtureFor("slack:leave_channel").writeHarness!;
    expect(wh.cleanup).toBeUndefined();
    expect(wh.cleanupAll?.map((s) => s.action)).toEqual(["join_channel", "archive_channel"]);
  });
});

// ─── join_channel ─────────────────────────────────────────────────────────────

describe("slack:join_channel", () => {
  it("creates + leaves, joins, proves is_member==true, then archives (artifact archived)", async () => {
    const deps = depsWith({
      "slack:channel_state": { ok: true, output: { found: true, is_member: true }, reason: null },
    });
    const r = await runWriteSmoke(fixtureFor("slack:join_channel"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("archived");
    expect(r.ledger.leaked).toBe(0);
    expect(r.ledger.created).toBe(1);
    // setup runs create THEN leave so the join is a genuine non-member -> member.
    expect(deps.calls.map((c) => c.action)).toEqual([
      "create_channel",
      "leave_channel",
      "join_channel",
      "archive_channel",
    ]);
    // membership is proven by the independent read-back, not the join echo.
    expect(deps.reads[0]).toMatchObject({ action: "channel_state", config: { channel: CHANNEL_ID } });
  });

  it("is VERIFY_FAILED when the read-back shows the bot is NOT a member", async () => {
    const deps = depsWith({
      "slack:channel_state": { ok: true, output: { found: true, is_member: false }, reason: null },
    });
    const r = await runWriteSmoke(fixtureFor("slack:join_channel"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    // cleanup still archives the smoke channel — never a leak.
    expect(r.artifact).toBe("archived");
    expect(r.ledger.leaked).toBe(0);
  });
});

// ─── leave_channel ────────────────────────────────────────────────────────────

describe("slack:leave_channel", () => {
  it("creates, leaves, proves is_member==false, then rejoins + archives", async () => {
    const deps = depsWith({
      "slack:channel_state": { ok: true, output: { found: true, is_member: false }, reason: null },
    });
    const r = await runWriteSmoke(fixtureFor("slack:leave_channel"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("archived");
    expect(r.ledger.leaked).toBe(0);
    // cleanupAll rejoins BEFORE archiving (archive rejects a non-member).
    expect(deps.calls.map((c) => c.action)).toEqual([
      "create_channel",
      "leave_channel",
      "join_channel",
      "archive_channel",
    ]);
  });

  it("leaves a harmless artifact (not a gate fail) when the rejoin step fails", async () => {
    const deps: RecordingDeps = {
      calls: [],
      reads: [],
      async runActionStep(input) {
        this.calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        if (input.action === "create_channel") {
          return { ok: true, output: { id: CHANNEL_ID }, reason: null };
        }
        if (input.action === "join_channel") return { ok: false, output: null, reason: "rejoin failed" };
        return { ok: true, output: null, reason: null };
      },
      async smokeReadBack(input) {
        this.reads.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        return { ok: true, output: { found: true, is_member: false }, reason: null };
      },
    };
    const r = await runWriteSmoke(fixtureFor("slack:leave_channel"), { ...RUN, envLookup: env }, deps);
    // best-effort archive: a broken disposition leaves a harmless artifact, still PASS.
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    // chain stops at the failed rejoin — archive_channel never runs.
    expect(deps.calls.map((c) => c.action)).toEqual(["create_channel", "leave_channel", "join_channel"]);
  });
});

// ─── unarchive_channel ────────────────────────────────────────────────────────

describe("slack:unarchive_channel", () => {
  it("creates + archives, unarchives, proves is_archived==false, then re-archives", async () => {
    const deps = depsWith({
      "slack:channel_state": { ok: true, output: { found: true, is_archived: false }, reason: null },
    });
    const r = await runWriteSmoke(fixtureFor("slack:unarchive_channel"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("archived");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "create_channel",
      "archive_channel", // setup archive (so there is something to unarchive)
      "unarchive_channel",
      "archive_channel", // cleanup re-archive disposition
    ]);
  });
});

// ─── invite_users_to_channel ──────────────────────────────────────────────────

describe("slack:invite_users_to_channel", () => {
  it("invites the smoke user, proves channel_members CONTAINS the id, then archives", async () => {
    const deps = depsWith({
      "slack:channel_members": { ok: true, output: { members: ["UBOT", USER_ID] }, reason: null },
    });
    const r = await runWriteSmoke(fixtureFor("slack:invite_users_to_channel"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("archived");
    // the invited user id came from env, resolved into the execute config.
    const invite = deps.calls.find((c) => c.action === "invite_users_to_channel")!;
    expect(invite.config.users).toBe(USER_ID);
    expect(invite.config.sendInviteNotification).toBe(true);
  });

  it("is BLOCKED_ENV (never a mutation) when the smoke user id is unset", async () => {
    const deps = depsWith({});
    const noUser = (n: string) => (n === "SMOKE_SLACK_INVITE_USER_ID" ? undefined : env(n));
    const r = await runWriteSmoke(fixtureFor("slack:invite_users_to_channel"), { ...RUN, envLookup: noUser }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0); // nothing created, nothing invited
  });
});

// ─── remove_user_from_channel ─────────────────────────────────────────────────

describe("slack:remove_user_from_channel", () => {
  it("invites then removes, proves channel_members no longer contains the id, then archives", async () => {
    const deps = depsWith({
      "slack:channel_members": { ok: true, output: { members: ["UBOT"] }, reason: null },
    });
    const r = await runWriteSmoke(fixtureFor("slack:remove_user_from_channel"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("archived");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "create_channel",
      "invite_users_to_channel",
      "remove_user_from_channel",
      "archive_channel",
    ]);
    const remove = deps.calls.find((c) => c.action === "remove_user_from_channel")!;
    expect(remove.config.user).toBe(USER_ID);
  });

  it("is VERIFY_FAILED when the removed user is STILL a member on read-back", async () => {
    const deps = depsWith({
      "slack:channel_members": { ok: true, output: { members: ["UBOT", USER_ID] }, reason: null },
    });
    const r = await runWriteSmoke(fixtureFor("slack:remove_user_from_channel"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    expect(r.artifact).toBe("archived"); // cleanup still archives — never a leak
  });
});
