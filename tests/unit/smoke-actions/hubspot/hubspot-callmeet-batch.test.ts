/**
 * @jest-environment node
 *
 * Write smoke harness — HubSpot call + meeting engagement batch (create_call,
 * create_meeting).
 *
 * Drives both fixtures through the pure `runWriteSmoke` orchestrator over a
 * FAKE boundary (mock only the external seam; run the real gate / ledger /
 * phase / verify logic). Protects the contracts that matter:
 *   - both are writeSafe with NO cleanup step (HubSpot has no registered
 *     delete/archive action for calls/meetings) -> artifact "left";
 *   - both verify via an INDEPENDENT smokeRead GET-by-id seam call
 *     (call_state / meeting_state), never a /search read;
 *   - both are standalone records: no owner and no associations, so the smoke
 *     engagement pings/invites nobody;
 *   - a wrong read-back is VERIFY_FAILED (no vacuous pass).
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const CALL_ID = "8001";
const MEETING_ID = "8101";

const env = (): string | undefined => undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(state: Record<string, Record<string, unknown>>): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "create_call":
          return { ok: true, output: { callId: CALL_ID, title: input.config.hs_call_title }, reason: null };
        case "create_meeting":
          return {
            ok: true,
            output: { meetingId: MEETING_ID, title: input.config.hs_meeting_title },
            reason: null,
          };
        default:
          return { ok: false, output: null, reason: `no plan for ${input.action}` };
      }
    },
    async smokeReadBack(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      const s = state[input.action];
      if (s) return { ok: true, output: { found: true, ...s }, reason: null };
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("hubspot call+meeting batch — shape", () => {
  it("both are writeSafe writes with a smokeRead verify, NO cleanup, and no env", () => {
    for (const key of ["hubspot:create_call", "hubspot:create_meeting"] as const) {
      const f = fixtureFor(key);
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.liveRisk).toBe("write");
      expect(f.liveSafe).toBe(false);
      expect(f.writeHarness?.liveClass).toBe("writeSafe");
      expect(f.writeHarness?.cleanup).toBeUndefined();
      expect(f.writeHarness?.cleanupKind).toBeUndefined();
      expect(f.writeHarness?.verify?.smokeRead).toBe(true);
      expect(f.requiredEnv ?? []).toEqual([]);
      // Standalone records: no owner and no associations configured.
      expect(f.config.hubspot_owner_id).toBeUndefined();
      expect(f.config.associatedContactId).toBeUndefined();
    }
  });
});

// ─── create_call ─────────────────────────────────────────────────────────────

describe("hubspot:create_call", () => {
  it("logs a marked call record, proves the marker via call_state, leaves the artifact", async () => {
    const deps = depsWith({ call_state: { title: `${MARKER}call`, status: "COMPLETED" } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_call"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_call", "call_state"]);
    expect(deps.calls.find((c) => c.action === "create_call")!.config.hs_call_title).toBe(`${MARKER}call`);
    expect(deps.calls.find((c) => c.action === "call_state")!.config.callId).toBe(CALL_ID);
  });

  it("is VERIFY_FAILED when the read-back title lacks the marker", async () => {
    const deps = depsWith({ call_state: { title: "real sales call", status: "COMPLETED" } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_call"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

// ─── create_meeting ──────────────────────────────────────────────────────────

describe("hubspot:create_meeting", () => {
  it("creates a marked meeting record, proves the marker via meeting_state, leaves the artifact", async () => {
    const deps = depsWith({ meeting_state: { title: `${MARKER}meeting`, outcome: "SCHEDULED" } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_meeting"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_meeting", "meeting_state"]);
    const create = deps.calls.find((c) => c.action === "create_meeting")!;
    expect(create.config.hs_meeting_title).toBe(`${MARKER}meeting`);
    // No start/end configured — a CRM engagement record, never a calendar invite.
    expect(create.config.hs_meeting_start_time).toBeUndefined();
    expect(deps.calls.find((c) => c.action === "meeting_state")!.config.meetingId).toBe(MEETING_ID);
  });

  it("is VERIFY_FAILED when the read-back title lacks the marker", async () => {
    const deps = depsWith({ meeting_state: { title: "quarterly review", outcome: "SCHEDULED" } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_meeting"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
