/**
 * @jest-environment node
 *
 * Write smoke harness — HubSpot list-membership finisher batch
 * (add_contact_to_list, remove_from_list).
 *
 * Drives both fixtures through the pure `runWriteSmoke` orchestrator over a
 * FAKE boundary. Protects the contracts that matter:
 *   - the created resource is the MEMBERSHIP, captured under the echoed marker
 *     email (the action contract is email-keyed; no membership object id);
 *   - list + contact are STAGED (env overlay), never in the run ledger;
 *   - membership presence/absence is proven by the INDEPENDENT
 *     list_membership_state read-back (member true/false), never the
 *     contactIdsAdded / contactIdsRemoved echoes;
 *   - member:false requires a SUCCESSFUL memberships read — a read error is
 *     VERIFY_FAILED, never a false "removed";
 *   - add's membership removal is a REQUIRED delete-kind cleanup
 *     (CLEANUP_FAILED on failure, never a silent leak);
 *   - both gate BLOCKED_ENV when the staged list/contact overlay is missing.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const LIST_ID = "9001";
const CONTACT_ID = "9101";
const EMAIL = "crsmoke-T1-list-contact@example.com";

const env = (n: string): string | undefined =>
  n === "SMOKE_HUBSPOT_LIST_ID"
    ? LIST_ID
    : n === "SMOKE_HUBSPOT_LIST_CONTACT_ID"
      ? CONTACT_ID
      : n === "SMOKE_HUBSPOT_LIST_CONTACT_EMAIL"
        ? EMAIL
        : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(
  membership: { member: boolean } | null,
  opts: { removeFails?: boolean; stateError?: string } = {},
): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "add_contact_to_list":
          return {
            ok: true,
            output: {
              listId: input.config.listId,
              email: input.config.email,
              contactIdsAdded: [CONTACT_ID],
              contactIdsDiscarded: [],
            },
            reason: null,
          };
        case "remove_from_list":
          return opts.removeFails
            ? { ok: false, output: null, reason: "remove failed" }
            : {
                ok: true,
                output: {
                  listId: input.config.listId,
                  email: input.config.email,
                  contactIdsRemoved: [CONTACT_ID],
                  contactIdsDiscarded: [],
                },
                reason: null,
              };
        default:
          return { ok: false, output: null, reason: `no plan for ${input.action}` };
      }
    },
    async smokeReadBack(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (opts.stateError) return { ok: false, output: null, reason: opts.stateError };
      if (input.action === "list_membership_state" && membership) {
        return { ok: true, output: { member: membership.member, memberCount: membership.member ? 1 : 0 }, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("hubspot list batch — shape", () => {
  it("add is writeSafe with a REQUIRED remove_from_list cleanup on the captured membership", () => {
    const f = fixtureFor("hubspot:add_contact_to_list");
    expect(f).toBeDefined();
    expect(f.risk).toBe("write");
    expect(f.liveRisk).toBe("write");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.liveClass).toBe("writeSafe");
    expect(f.writeHarness?.captureResource).toEqual({
      resourceKey: "membership",
      idPath: "email",
      kind: "list membership",
    });
    expect(f.writeHarness?.cleanup?.action).toBe("remove_from_list");
    expect(f.writeHarness?.cleanup?.config.email).toBe("{{ledger.membership.id}}");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
    expect(f.writeHarness?.verify?.smokeRead).toBe(true);
    expect(f.writeHarness?.verify?.expectEquals).toEqual({ path: "member", value: true });
  });

  it("remove is a writeSafe executeIsCleanup fixture proving member==false (write, not destructive — reversible membership)", () => {
    const f = fixtureFor("hubspot:remove_from_list");
    expect(f.risk).toBe("write");
    expect(f.liveRisk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("writeSafe");
    expect(f.writeHarness?.executeIsCleanup).toBe(true);
    expect(f.writeHarness?.cleanup).toBeUndefined();
    expect(f.writeHarness?.verify?.expectEquals).toEqual({ path: "member", value: false });
  });

  it("both require the full staged list/contact env trio", () => {
    for (const key of ["hubspot:add_contact_to_list", "hubspot:remove_from_list"] as const) {
      expect(fixtureFor(key).requiredEnv).toEqual([
        "SMOKE_HUBSPOT_LIST_ID",
        "SMOKE_HUBSPOT_LIST_CONTACT_ID",
        "SMOKE_HUBSPOT_LIST_CONTACT_EMAIL",
      ]);
    }
  });
});

// ─── add_contact_to_list ─────────────────────────────────────────────────────

describe("hubspot:add_contact_to_list", () => {
  it("adds the staged contact, proves member:true, then removes the membership (cleaned)", async () => {
    const deps = depsWith({ member: true });
    const r = await runWriteSmoke(fixtureFor("hubspot:add_contact_to_list"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.created).toBe(1);
    expect(r.ledger.cleaned).toBe(1);
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "add_contact_to_list",
      "list_membership_state",
      "remove_from_list",
    ]);
    const add = deps.calls.find((c) => c.action === "add_contact_to_list")!;
    expect(add.config.listId).toBe(LIST_ID);
    expect(add.config.email).toBe(EMAIL);
    const state = deps.calls.find((c) => c.action === "list_membership_state")!;
    expect(state.config.contactId).toBe(CONTACT_ID);
    // Cleanup removes the CAPTURED membership (the marker email ledger id).
    expect(deps.calls.find((c) => c.action === "remove_from_list")!.config.email).toBe(EMAIL);
  });

  it("is VERIFY_FAILED when the read-back says the contact is NOT a member (cleanup still runs)", async () => {
    const deps = depsWith({ member: false });
    const r = await runWriteSmoke(fixtureFor("hubspot:add_contact_to_list"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "remove_from_list")).toBe(true);
  });

  it("is CLEANUP_FAILED when the required membership removal fails", async () => {
    const deps = depsWith({ member: true }, { removeFails: true });
    const r = await runWriteSmoke(fixtureFor("hubspot:add_contact_to_list"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("CLEANUP_FAILED");
    expect(r.ledger.leaked).toBe(1);
  });

  it("is BLOCKED_ENV (never a write) when the staged list/contact overlay is missing", async () => {
    const deps = depsWith(null);
    const r = await runWriteSmoke(
      fixtureFor("hubspot:add_contact_to_list"),
      { ...RUN, envLookup: () => undefined },
      deps,
    );
    expect(r.status).toBe("BLOCKED_ENV");
    expect(r.reason).toMatch(/SMOKE_HUBSPOT_LIST_ID/);
    expect(deps.calls).toHaveLength(0);
  });
});

// ─── remove_from_list ────────────────────────────────────────────────────────

describe("hubspot:remove_from_list", () => {
  it("seeds membership, removes it, proves member:false (cleaned)", async () => {
    const deps = depsWith({ member: false });
    const r = await runWriteSmoke(fixtureFor("hubspot:remove_from_list"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.created).toBe(1);
    expect(r.ledger.cleaned).toBe(1);
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "add_contact_to_list",
      "remove_from_list",
      "list_membership_state",
    ]);
    expect(deps.calls.find((c) => c.action === "remove_from_list")!.config.email).toBe(EMAIL);
  });

  it("is VERIFY_FAILED when the read-back says the contact is STILL a member", async () => {
    const deps = depsWith({ member: true });
    const r = await runWriteSmoke(fixtureFor("hubspot:remove_from_list"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is VERIFY_FAILED (never a false removed) when the memberships read errors", async () => {
    const deps = depsWith(null, { stateError: "memberships read failed" });
    const r = await runWriteSmoke(fixtureFor("hubspot:remove_from_list"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is BLOCKED_ENV (never a seed add) when the staged overlay is missing", async () => {
    const deps = depsWith(null);
    const r = await runWriteSmoke(
      fixtureFor("hubspot:remove_from_list"),
      { ...RUN, envLookup: () => undefined },
      deps,
    );
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});
