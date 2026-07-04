/**
 * @jest-environment node
 *
 * Write smoke harness — Mailchimp finisher batch (add_note,
 * create_custom_event, create_audience, create_segment).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a
 * FAKE boundary. Protects the contracts that matter:
 *   - add_note / create_custom_event seed a member, verify via INDEPENDENT
 *     notes / contact-events read-backs, and clean via remove_subscriber
 *     delete_permanent (REQUIRED delete-kind cleanup);
 *   - the custom event NAME rides the env overlay (Mailchimp's
 *     ^[a-z][a-z0-9_]{0,29}$ regex rejects the dashed marker) and is proven
 *     via expectContains on the persisted timeline;
 *   - create_audience / create_segment verify via independent state
 *     read-backs and honestly LEAVE their artifact (no registered delete);
 *   - a wrong read-back is VERIFY_FAILED (no vacuous pass);
 *   - all gate BLOCKED_ENV without their discovery env.
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
const AUD = "aud-1";
const NEW_AUD = "aud-new";
const SEGMENT_ID = "555";
const EVENT_NAME = "crsmoke_t1_ev";
const NOTE_EMAIL = `owner+${MARKER}note@mail.test`;
const EVENT_EMAIL = `owner+${MARKER}evt@mail.test`;
const OWNER = "owner@mail.test";

const env = (n: string): string | undefined =>
  n === "SMOKE_MAILCHIMP_AUDIENCE_ID"
    ? AUD
    : n === "SMOKE_MAILCHIMP_SUB_EMAIL_NOTE"
      ? NOTE_EMAIL
      : n === "SMOKE_MAILCHIMP_SUB_EMAIL_EVENT"
        ? EVENT_EMAIL
        : n === "SMOKE_MAILCHIMP_EVENT_NAME"
          ? EVENT_NAME
          : n === "SMOKE_MAILCHIMP_OWNER_EMAIL"
            ? OWNER
            : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(seam: Record<string, Record<string, unknown>>): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "add_subscriber":
          return { ok: true, output: { subscriberId: "m-1", email: input.config.email }, reason: null };
        case "add_note":
          return { ok: true, output: { noteId: "n-1", email: input.config.email }, reason: null };
        case "create_custom_event":
          return { ok: true, output: { eventName: input.config.event_name, subscriberEmail: input.config.email }, reason: null };
        case "create_audience":
          return { ok: true, output: { audienceId: NEW_AUD, name: input.config.name }, reason: null };
        case "create_segment":
          return { ok: true, output: { segmentId: SEGMENT_ID, name: input.config.name }, reason: null };
        case "remove_subscriber":
          return { ok: true, output: { email: input.config.email, removed: true }, reason: null };
        default:
          return { ok: false, output: null, reason: `no plan for ${input.action}` };
      }
    },
    async smokeReadBack(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      const s = seam[input.action];
      if (s) return { ok: true, output: s, reason: null };
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("mailchimp finisher batch — shape", () => {
  it("add_note / create_custom_event clean via remove_subscriber delete_permanent", () => {
    for (const key of ["mailchimp:add_note", "mailchimp:create_custom_event"] as const) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.cleanup?.action).toBe("remove_subscriber");
      expect(f.writeHarness?.cleanup?.config.mode).toBe("delete_permanent");
      expect(f.writeHarness?.cleanupKind).toBe("delete");
      expect(f.writeHarness?.verify?.smokeRead).toBe(true);
      expect(f.writeHarness?.liveClass).toBe("writeSafe");
    }
  });

  it("create_audience / create_segment have NO cleanup (no registered delete) and verify by seam", () => {
    for (const key of ["mailchimp:create_audience", "mailchimp:create_segment"] as const) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.cleanup).toBeUndefined();
      expect(f.writeHarness?.cleanupKind).toBeUndefined();
      expect(f.writeHarness?.verify?.smokeRead).toBe(true);
      expect(f.writeHarness?.markerEchoPath).toBe("name");
    }
  });

  it("the custom event name rides the env overlay (regex-safe underscore form)", () => {
    const f = fixtureFor("mailchimp:create_custom_event");
    expect(f.configFromEnv?.event_name).toBe("SMOKE_MAILCHIMP_EVENT_NAME");
    expect(f.writeHarness?.verify?.expectContains).toEqual({
      path: "eventNames",
      value: "{{env.SMOKE_MAILCHIMP_EVENT_NAME}}",
    });
  });
});

// ─── add_note ─────────────────────────────────────────────────────────────────

describe("mailchimp:add_note", () => {
  it("seeds, attaches a marker note, proves it on the persisted notes, then deletes", async () => {
    const deps = depsWith({
      member_notes_state: { found: true, notes: [`${MARKER}note ChainReact action-smoke - safe to ignore`] },
    });
    const r = await runWriteSmoke(fixtureFor("mailchimp:add_note"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "add_subscriber",
      "add_note",
      "member_notes_state",
      "remove_subscriber",
    ]);
    expect(deps.calls.find((c) => c.action === "add_note")!.config.email).toBe(NOTE_EMAIL);
  });

  it("is VERIFY_FAILED when the persisted notes lack the marker", async () => {
    const deps = depsWith({ member_notes_state: { found: true, notes: ["someone elses note"] } });
    const r = await runWriteSmoke(fixtureFor("mailchimp:add_note"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

// ─── create_custom_event ─────────────────────────────────────────────────────

describe("mailchimp:create_custom_event", () => {
  it("seeds, fires the run-scoped event, proves it on the timeline, then deletes", async () => {
    const deps = depsWith({ custom_event_state: { found: true, eventNames: [EVENT_NAME] } });
    const r = await runWriteSmoke(fixtureFor("mailchimp:create_custom_event"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "add_subscriber",
      "create_custom_event",
      "custom_event_state",
      "remove_subscriber",
    ]);
    const fire = deps.calls.find((c) => c.action === "create_custom_event")!;
    expect(fire.config.event_name).toBe(EVENT_NAME);
    expect(fire.config.email).toBe(EVENT_EMAIL);
  });

  it("is VERIFY_FAILED when the timeline lacks the run-scoped event name", async () => {
    const deps = depsWith({ custom_event_state: { found: true, eventNames: ["other_event"] } });
    const r = await runWriteSmoke(fixtureFor("mailchimp:create_custom_event"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

// ─── create_audience ─────────────────────────────────────────────────────────

describe("mailchimp:create_audience", () => {
  it("creates a marked audience, proves exists+marker via lists read-back, leaves the artifact", async () => {
    const deps = depsWith({ audience_state: { exists: true, name: `${MARKER}audience` } });
    const r = await runWriteSmoke(fixtureFor("mailchimp:create_audience"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_audience", "audience_state"]);
    const create = deps.calls.find((c) => c.action === "create_audience")!;
    expect(create.config.name).toBe(`${MARKER}audience`);
    expect((create.config.campaign_defaults as Record<string, unknown>).from_email).toBe(OWNER);
    expect(deps.calls.find((c) => c.action === "audience_state")!.config.audienceId).toBe(NEW_AUD);
  });

  it("is VERIFY_FAILED when the lists read-back does not contain the new audience", async () => {
    const deps = depsWith({ audience_state: { exists: false, name: null } });
    const r = await runWriteSmoke(fixtureFor("mailchimp:create_audience"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is BLOCKED_ENV when the owner email was not discovered", async () => {
    const deps = depsWith({});
    const r = await runWriteSmoke(fixtureFor("mailchimp:create_audience"), { ...RUN, envLookup: () => undefined }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});

// ─── create_segment ──────────────────────────────────────────────────────────

describe("mailchimp:create_segment", () => {
  it("creates an empty static marker segment, proves it by GET-by-id, leaves the artifact", async () => {
    const deps = depsWith({ segment_state: { found: true, name: `${MARKER}segment` } });
    const r = await runWriteSmoke(fixtureFor("mailchimp:create_segment"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(deps.calls.map((c) => c.action)).toEqual(["create_segment", "segment_state"]);
    const create = deps.calls.find((c) => c.action === "create_segment")!;
    expect(create.config.mode).toBe("static");
    expect(create.config.audience_id).toBe(AUD);
    expect(deps.calls.find((c) => c.action === "segment_state")!.config.segmentId).toBe(SEGMENT_ID);
  });

  it("is VERIFY_FAILED when the segment read-back lacks the marker", async () => {
    const deps = depsWith({ segment_state: { found: true, name: "real segment" } });
    const r = await runWriteSmoke(fixtureFor("mailchimp:create_segment"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
