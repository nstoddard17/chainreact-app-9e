/**
 * @jest-environment node
 *
 * Write smoke harness — Google Calendar add_attendees (SMOKE-WRITE-45).
 *
 * Chains off certified create_event / delete_event: create a smoke-owned event (fixed
 * 2030 time, no attendees, no-notify) -> add a marker attendee (sendNotifications "none"
 * -> no invite) -> verify independently via certified list_events over the 2030 window
 * (the marker attendee email among events' raw attendees) -> cleanup hard-deletes the
 * whole event. Driven through the pure `runWriteSmoke` orchestrator over a FAKE boundary.
 *
 * NOT live-certified — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP. These offline tests pin the fixture shape + orchestration only.
 *
 * Protects:
 *   - setup creates + captures the event; execute adds the attendee with no-notify;
 *   - verify proves the unique marker attendee email (a no-op add fails);
 *   - cleanup hard-deletes the smoke-owned event (created 1 / cleaned 1 / 0 leaked).
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true, sleep: async () => {} } as const;
const MARKER = "crsmoke-T1-";
const EVENT_ID = "evt-1";
const ATTENDEE = `${MARKER}attendee@example.invalid`;
const env = (): string | undefined => "x"; // _CONNECTED signals are filtered from the target gate

const fixture = (): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "google-calendar:add_attendees")!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(plan: Record<string, readonly StepRunOutcome[]>): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  const idx: Record<string, number> = {};
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      const key = `${input.provider}:${input.action}`;
      const seq = plan[key] ?? [{ ok: true, output: null, reason: null }];
      const i = idx[key] ?? 0;
      idx[key] = i + 1;
      return seq[Math.min(i, seq.length - 1)]!;
    },
  };
}

const CREATE_OK: StepRunOutcome = { ok: true, output: { eventId: EVENT_ID, summary: `${MARKER}event` }, reason: null };
const ADD_OK: StepRunOutcome = { ok: true, output: { addedAttendees: [ATTENDEE], totalAttendees: 1 }, reason: null };
// list_events over the 2030 window returns the raw event incl. the added attendee.
const LIST_WITH_ATTENDEE: StepRunOutcome = {
  ok: true,
  output: {
    events: [{ id: EVENT_ID, summary: `${MARKER}event`, attendees: [{ email: ATTENDEE, responseStatus: "needsAction" }] }],
    count: 1,
  },
  reason: null,
};

describe("gcal:add_attendees — fixture shape", () => {
  it("is a destructiveSafe write that chains create_event -> add_attendees -> list_events verify -> delete_event", () => {
    const f = fixture();
    expect(f).toBeDefined();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.requiredEnv).toEqual(["SMOKE_GOOGLE_CALENDAR_CONNECTED"]);
    // setup creates + captures a smoke event (no attendees, no-notify).
    expect(f.writeHarness?.setup?.[0]?.action).toBe("create_event");
    expect(f.writeHarness?.setup?.[0]?.captureResource).toEqual({ resourceKey: "event", idPath: "eventId", kind: "event" });
    expect(f.writeHarness?.setup?.[0]?.config.sendNotifications).toBe("none");
    // execute adds a marker .invalid attendee with NO notifications.
    expect(f.config.eventId).toBe("{{ledger.event.id}}");
    expect(f.config.attendees).toEqual(["{{smokeMarker}}attendee@example.invalid"]);
    expect(f.config.sendNotifications).toBe("none");
    // verify is an INDEPENDENT certified list_events over the fixed 2030 window.
    expect(f.writeHarness?.verify?.action).toBe("list_events");
    expect(f.writeHarness?.verify?.config).toMatchObject({ timeMin: "2030-01-01T00:00:00Z", timeMax: "2030-01-02T00:00:00Z" });
    expect(f.writeHarness?.verify?.markerPath).toBe("events");
    expect(f.writeHarness?.verify?.markerSuffix).toBe("attendee@example.invalid");
    // cleanup hard-deletes the event, no-notify, same provider.
    expect(f.writeHarness?.cleanup?.action).toBe("delete_event");
    expect(f.writeHarness?.cleanup?.config).toMatchObject({ sendNotifications: "none" });
    expect(f.writeHarness?.crossProviderCleanup).toBeUndefined();
  });
});

describe("gcal:add_attendees — orchestration", () => {
  it("PASS: create event -> add attendee -> independent list_events marker -> delete (cleaned, 0 leaked)", async () => {
    const deps = depsWith({
      "google-calendar:create_event": [CREATE_OK],
      "google-calendar:add_attendees": [ADD_OK],
      "google-calendar:list_events": [LIST_WITH_ATTENDEE],
      "google-calendar:delete_event": [{ ok: true, output: null, reason: null }],
    });
    const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger).toMatchObject({ created: 1, cleaned: 1, leaked: 0, kinds: ["event"] });
    // add + delete targeted the captured event; add carried the marker attendee + no-notify.
    expect(deps.calls.find((c) => c.action === "add_attendees")?.config.eventId).toBe(EVENT_ID);
    expect(deps.calls.find((c) => c.action === "add_attendees")?.config.attendees).toEqual([ATTENDEE]);
    expect(deps.calls.find((c) => c.action === "delete_event")?.config.eventId).toBe(EVENT_ID);
  });

  it("VERIFY_FAILED on a no-op: list_events shows the event WITHOUT the marker attendee (cleanup still runs)", async () => {
    const deps = depsWith({
      "google-calendar:create_event": [CREATE_OK],
      "google-calendar:add_attendees": [ADD_OK],
      // The event exists (summary marker) but the attendee was not added.
      "google-calendar:list_events": [{ ok: true, output: { events: [{ id: EVENT_ID, summary: `${MARKER}event`, attendees: [] }], count: 1 }, reason: null }],
      "google-calendar:delete_event": [{ ok: true, output: null, reason: null }],
    });
    const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_event")).toBe(true);
    expect(res.ledger.leaked).toBe(0);
  });

  it("CLEANUP_FAILED (not masked) when the event delete keeps failing", async () => {
    const deps = depsWith({
      "google-calendar:create_event": [CREATE_OK],
      "google-calendar:add_attendees": [ADD_OK],
      "google-calendar:list_events": [LIST_WITH_ATTENDEE],
      "google-calendar:delete_event": [{ ok: false, output: null, reason: "server error 500" }],
    });
    const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("CLEANUP_FAILED");
    expect(res.ledger.leaked).toBe(1);
  });
});
