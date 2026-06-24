/**
 * @jest-environment node
 *
 * Write smoke harness — Google Calendar create/update/delete batch (SMOKE-WRITE-21).
 *
 * Pins the three new Calendar WRITE fixtures WITHOUT a real DB/provider, driving
 * each through the pure `runWriteSmoke` orchestrator over a FAKE boundary (mock only
 * the external seam; the real gate / ledger / phase / verify logic runs). Protects
 * the contract that matters for these actions:
 *   - create/update verify the marker on an INDEPENDENT events.get read-back (not
 *     the create/update echo), and update requires the "updated" suffix so a no-op
 *     update fails;
 *   - delete verifies ABSENCE via the events.get existence probe (exists==false) —
 *     the handler's deleted/alreadyDeleted echo can never vacuously pass;
 *   - every flow is smoke-owned and ends cleaned (hard delete).
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

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("google-calendar write batch: shape", () => {
  const KEYS = [
    "google-calendar:create_event",
    "google-calendar:update_event",
    "google-calendar:delete_event",
  ] as const;

  it.each(KEYS)("%s is a destructiveSafe write fixture, no attendees, no-notify", (key) => {
    const f = fixtureFor(key);
    expect(f).toBeDefined();
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    // No attendees field anywhere (no invites possible).
    expect(f.config.attendees).toBeUndefined();
    // Every Calendar write must explicitly choose no notifications.
    expect(f.config.sendNotifications ?? f.writeHarness?.setup?.[0]?.config.sendNotifications).toBe("none");
    // Verification always routes through the independent events.get smoke reader.
    expect(f.writeHarness?.verify?.smokeRead).toBe(true);
    expect(f.writeHarness?.verify?.provider).toBe("google-calendar");
    expect(f.writeHarness?.verify?.action).toBe("events_get");
  });
});

// ─── create_event ─────────────────────────────────────────────────────────────

describe("google-calendar:create_event orchestration", () => {
  it("PASS: create -> independent events.get marker on summary -> delete (cleaned)", async () => {
    const deps = depsWith(
      {
        "google-calendar:create_event": { ok: true, output: { eventId: "evt_1" }, reason: null },
        "google-calendar:delete_event": { ok: true, output: { deleted: true }, reason: null },
      },
      { "google-calendar:events_get": { ok: true, output: { exists: true, summary: `${MARKER}event`, status: "confirmed" }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("google-calendar:create_event"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.find((c) => c.action === "delete_event")?.config.eventId).toBe("evt_1");
    // verification went through the smoke reader, never a normal engine action.
    expect(deps.calls.filter((c) => c.action === "events_get")).toHaveLength(1);
  });

  it("VERIFY_FAILED: read-back summary lacks the marker (cleanup still runs)", async () => {
    const deps = depsWith(
      {
        "google-calendar:create_event": { ok: true, output: { eventId: "evt_1" }, reason: null },
        "google-calendar:delete_event": { ok: true, output: { deleted: true }, reason: null },
      },
      { "google-calendar:events_get": { ok: true, output: { exists: true, summary: "someone else", status: "confirmed" }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("google-calendar:create_event"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_event")).toBe(true);
  });
});

// ─── update_event ─────────────────────────────────────────────────────────────

describe("google-calendar:update_event orchestration", () => {
  it("PASS: setup -> update -> events.get marker+updated -> delete (cleaned)", async () => {
    const deps = depsWith(
      {
        "google-calendar:create_event": { ok: true, output: { eventId: "evt_2" }, reason: null },
        "google-calendar:update_event": { ok: true, output: { eventId: "evt_2" }, reason: null },
        "google-calendar:delete_event": { ok: true, output: { deleted: true }, reason: null },
      },
      { "google-calendar:events_get": { ok: true, output: { exists: true, summary: `${MARKER}updated`, status: "confirmed" }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("google-calendar:update_event"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
  });

  it("VERIFY_FAILED: a no-op update leaves the seed summary (markerSuffix not present)", async () => {
    const deps = depsWith(
      {
        "google-calendar:create_event": { ok: true, output: { eventId: "evt_2" }, reason: null },
        "google-calendar:update_event": { ok: true, output: { eventId: "evt_2" }, reason: null },
        "google-calendar:delete_event": { ok: true, output: { deleted: true }, reason: null },
      },
      // read-back still shows the SEED summary ("...event") -> "updated" suffix absent
      { "google-calendar:events_get": { ok: true, output: { exists: true, summary: `${MARKER}event`, status: "confirmed" }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("google-calendar:update_event"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_event")).toBe(true);
  });
});

// ─── delete_event (absence verify) ────────────────────────────────────────────

describe("google-calendar:delete_event orchestration", () => {
  it("PASS: setup -> delete -> independent exists==false (cleaned, gone)", async () => {
    const deps = depsWith(
      {
        "google-calendar:create_event": { ok: true, output: { eventId: "evt_3" }, reason: null },
        "google-calendar:delete_event": { ok: true, output: { deleted: true }, reason: null },
      },
      { "google-calendar:events_get": { ok: true, output: { exists: false }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("google-calendar:delete_event"), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.filter((c) => c.action === "events_get")).toHaveLength(1);
  });

  it("VERIFY_FAILED: the event still exists on read-back (delete echo cannot vacuously pass)", async () => {
    const deps = depsWith(
      {
        "google-calendar:create_event": { ok: true, output: { eventId: "evt_3" }, reason: null },
        "google-calendar:delete_event": { ok: true, output: { deleted: true }, reason: null },
      },
      { "google-calendar:events_get": { ok: true, output: { exists: true, summary: `${MARKER}event`, status: "confirmed" }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("google-calendar:delete_event"), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });
});
