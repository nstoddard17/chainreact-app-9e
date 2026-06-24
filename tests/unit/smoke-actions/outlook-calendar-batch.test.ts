/**
 * @jest-environment node
 *
 * Write smoke harness — Outlook Calendar create/update/delete batch (SMOKE-WRITE-24).
 *
 * Mirrors the certified google-calendar batch: each fixture is smoke-owned on the
 * user's default calendar with NO attendees + responseRequested:false (zero invites),
 * verified by an INDEPENDENT events.get smoke read-back (not the create/update echo,
 * whose `subject` falls back to config), and hard-deleted. Driven through the pure
 * `runWriteSmoke` over a FAKE boundary.
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
const P = "microsoft-outlook-calendar";

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(
  plan: Record<string, StepRunOutcome>,
  smokePlan: Record<string, StepRunOutcome> = {},
): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
    },
    async smokeReadBack(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      return smokePlan[`${input.provider}:${input.action}`] ?? { ok: false, output: null, reason: "no reader" };
    },
  };
}

describe("outlook-calendar write batch: shape", () => {
  const KEYS = [`${P}:create_event`, `${P}:update_event`, `${P}:delete_event`] as const;

  it.each(KEYS)("%s is a destructiveSafe write fixture, no attendees, verified via events_get", (key) => {
    const f = fixtureFor(key);
    expect(f).toBeDefined();
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.config.attendees).toBeUndefined();
    expect(f.writeHarness?.verify?.smokeRead).toBe(true);
    expect(f.writeHarness?.verify?.action).toBe("events_get");
  });
});

describe("outlook-calendar:create_event orchestration", () => {
  it("PASS: create -> independent events.get marker on subject -> delete (cleaned)", async () => {
    const deps = depsWith(
      {
        [`${P}:create_event`]: { ok: true, output: { id: "evt_1" }, reason: null },
        [`${P}:delete_event`]: { ok: true, output: { deleted: true }, reason: null },
      },
      { [`${P}:events_get`]: { ok: true, output: { exists: true, subject: `${MARKER}event` }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor(`${P}:create_event`), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.find((c) => c.action === "delete_event")?.config.eventId).toBe("evt_1");
    expect(deps.calls.filter((c) => c.action === "events_get")).toHaveLength(1);
  });

  it("VERIFY_FAILED: read-back subject lacks the marker (cleanup still runs)", async () => {
    const deps = depsWith(
      {
        [`${P}:create_event`]: { ok: true, output: { id: "evt_1" }, reason: null },
        [`${P}:delete_event`]: { ok: true, output: { deleted: true }, reason: null },
      },
      { [`${P}:events_get`]: { ok: true, output: { exists: true, subject: "someone else" }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor(`${P}:create_event`), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_event")).toBe(true);
  });
});

describe("outlook-calendar:update_event orchestration", () => {
  it("PASS: setup -> update -> events.get marker+updated -> delete (cleaned)", async () => {
    const deps = depsWith(
      {
        [`${P}:create_event`]: { ok: true, output: { id: "evt_2" }, reason: null },
        [`${P}:update_event`]: { ok: true, output: { id: "evt_2" }, reason: null },
        [`${P}:delete_event`]: { ok: true, output: { deleted: true }, reason: null },
      },
      { [`${P}:events_get`]: { ok: true, output: { exists: true, subject: `${MARKER}updated` }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor(`${P}:update_event`), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
  });

  it("VERIFY_FAILED: a no-op update leaves the seed subject (markerSuffix absent)", async () => {
    const deps = depsWith(
      {
        [`${P}:create_event`]: { ok: true, output: { id: "evt_2" }, reason: null },
        [`${P}:update_event`]: { ok: true, output: { id: "evt_2" }, reason: null },
        [`${P}:delete_event`]: { ok: true, output: { deleted: true }, reason: null },
      },
      { [`${P}:events_get`]: { ok: true, output: { exists: true, subject: `${MARKER}event` }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor(`${P}:update_event`), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });
});

describe("outlook-calendar:delete_event orchestration", () => {
  it("PASS: setup -> delete -> independent exists==false (cleaned, gone)", async () => {
    const deps = depsWith(
      {
        [`${P}:create_event`]: { ok: true, output: { id: "evt_3" }, reason: null },
        [`${P}:delete_event`]: { ok: true, output: { deleted: true }, reason: null },
      },
      { [`${P}:events_get`]: { ok: true, output: { exists: false }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor(`${P}:delete_event`), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
  });

  it("VERIFY_FAILED: the event still exists on read-back (delete echo cannot vacuously pass)", async () => {
    const deps = depsWith(
      {
        [`${P}:create_event`]: { ok: true, output: { id: "evt_3" }, reason: null },
        [`${P}:delete_event`]: { ok: true, output: { deleted: true }, reason: null },
      },
      { [`${P}:events_get`]: { ok: true, output: { exists: true, subject: `${MARKER}event` }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor(`${P}:delete_event`), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });
});
