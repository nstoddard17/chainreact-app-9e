/**
 * @jest-environment node
 *
 * Write smoke harness — HubSpot CRM lifecycle batch (create/update contact,
 * company, deal).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE
 * boundary (mock only the external seam; run the real gate / ledger / phase /
 * verify logic). Protects the contracts that matter:
 *   - all six are writeSafe with NO cleanup step (HubSpot has no registered
 *     delete/archive action for contacts/companies/deals) -> artifact "left";
 *   - every verify is an INDEPENDENT smokeRead GET-by-id seam call
 *     (contact_state / company_state / deal_state), never the eventually-
 *     consistent registered /search reads;
 *   - creates capture the object id + echo the marker; updates seed via the
 *     create action and pin the SPECIFIC updated value via markerSuffix (a
 *     no-op update fails the verify);
 *   - a wrong read-back is VERIFY_FAILED (no vacuous pass);
 *   - deal fixtures gate BLOCKED_ENV when no pipeline/stage was discovered
 *     (never an invented stage id).
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const CONTACT_ID = "3001";
const COMPANY_ID = "4001";
const DEAL_ID = "5001";

const env = (n: string): string | undefined =>
  n === "SMOKE_HUBSPOT_DEAL_STAGE_ID"
    ? "stage-smoke"
    : n === "SMOKE_HUBSPOT_DEAL_PIPELINE_ID"
      ? "pipe-smoke"
      : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/**
 * Fake boundary: engine steps echo the config the way the real handlers do
 * (create_* returns the id + the stored marker-bearing property); the smokeRead
 * seam returns the injected `state` object per smoke action.
 */
function depsWith(state: Record<string, Record<string, unknown>>): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "create_contact":
          return {
            ok: true,
            output: { contactId: CONTACT_ID, email: input.config.email, firstName: input.config.firstname },
            reason: null,
          };
        case "update_contact":
          return { ok: true, output: { contactId: CONTACT_ID, firstName: input.config.firstname }, reason: null };
        case "create_company":
          return { ok: true, output: { companyId: COMPANY_ID, name: input.config.name }, reason: null };
        case "update_company":
          return { ok: true, output: { companyId: COMPANY_ID, name: input.config.name }, reason: null };
        case "create_deal":
          return { ok: true, output: { dealId: DEAL_ID, dealname: input.config.dealname }, reason: null };
        case "update_deal":
          return { ok: true, output: { dealId: DEAL_ID, dealname: input.config.dealname }, reason: null };
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

// ─── Shape (shared invariants) ────────────────────────────────────────────────

describe("hubspot CRM batch — shape", () => {
  const KEYS = [
    "hubspot:create_contact",
    "hubspot:update_contact",
    "hubspot:create_company",
    "hubspot:update_company",
    "hubspot:create_deal",
    "hubspot:update_deal",
  ] as const;

  it("all six are writeSafe writes with a smokeRead verify and NO cleanup", () => {
    for (const key of KEYS) {
      const f = fixtureFor(key);
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.liveRisk).toBe("write");
      expect(f.liveSafe).toBe(false);
      expect(f.writeHarness?.liveClass).toBe("writeSafe");
      // No registered HubSpot delete/archive action exists — artifact is left.
      expect(f.writeHarness?.cleanup).toBeUndefined();
      expect(f.writeHarness?.cleanupEach).toBeUndefined();
      expect(f.writeHarness?.cleanupAll).toBeUndefined();
      expect(f.writeHarness?.cleanupKind).toBeUndefined();
      // Verify is the GET-by-id smoke seam, never a registered /search read.
      expect(f.writeHarness?.verify?.smokeRead).toBe(true);
      // Connection comes from the DB probe, never an env flag.
      expect(f.requiredEnv ?? []).not.toContain("SMOKE_HUBSPOT_CONNECTED");
    }
  });

  it("deal fixtures require the discovered pipeline/stage env; contact/company need none", () => {
    for (const key of ["hubspot:create_deal", "hubspot:update_deal"] as const) {
      expect(fixtureFor(key).requiredEnv).toEqual([
        "SMOKE_HUBSPOT_DEAL_STAGE_ID",
        "SMOKE_HUBSPOT_DEAL_PIPELINE_ID",
      ]);
    }
    for (const key of [
      "hubspot:create_contact",
      "hubspot:update_contact",
      "hubspot:create_company",
      "hubspot:update_company",
    ] as const) {
      expect(fixtureFor(key).requiredEnv ?? []).toEqual([]);
    }
    expect(fixtureFor("hubspot:create_deal").configFromEnv).toEqual({
      dealstage: "SMOKE_HUBSPOT_DEAL_STAGE_ID",
      pipeline: "SMOKE_HUBSPOT_DEAL_PIPELINE_ID",
    });
  });
});

// ─── Contacts ─────────────────────────────────────────────────────────────────

describe("hubspot:create_contact", () => {
  it("creates a marked contact, proves the marker via contact_state, leaves the artifact", async () => {
    const deps = depsWith({ contact_state: { firstname: `${MARKER}first`, email: `${MARKER}create-contact@example.com` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_contact"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_contact", "contact_state"]);
    const create = deps.calls.find((c) => c.action === "create_contact")!;
    expect(create.config.email).toBe(`${MARKER}create-contact@example.com`);
    expect(create.config.firstname).toBe(`${MARKER}first`);
    expect(deps.calls.find((c) => c.action === "contact_state")!.config.contactId).toBe(CONTACT_ID);
  });

  it("is VERIFY_FAILED when the read-back firstname lacks the marker", async () => {
    const deps = depsWith({ contact_state: { firstname: "someone-else", email: "x@example.com" } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_contact"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

describe("hubspot:update_contact", () => {
  it("seeds a contact, PATCHes firstname, proves the SPECIFIC updated value (suffix)", async () => {
    const deps = depsWith({ contact_state: { firstname: `${MARKER}updated` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_contact"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(deps.calls.map((c) => c.action)).toEqual(["create_contact", "update_contact", "contact_state"]);
    const update = deps.calls.find((c) => c.action === "update_contact")!;
    expect(update.config.contactId).toBe(CONTACT_ID);
    expect(update.config.firstname).toBe(`${MARKER}updated`);
  });

  it("is VERIFY_FAILED when the read-back still shows the SEED value (update did not land)", async () => {
    const deps = depsWith({ contact_state: { firstname: `${MARKER}seed` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_contact"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

// ─── Companies ────────────────────────────────────────────────────────────────

describe("hubspot:create_company", () => {
  it("creates a marked company, proves the marker via company_state, leaves the artifact", async () => {
    const deps = depsWith({ company_state: { name: `${MARKER}company`, domain: null } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_company"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_company", "company_state"]);
    // No domain — HubSpot's company dedupe key — so no 409 path exists.
    expect(deps.calls.find((c) => c.action === "create_company")!.config.domain).toBeUndefined();
    expect(deps.calls.find((c) => c.action === "company_state")!.config.companyId).toBe(COMPANY_ID);
  });

  it("is VERIFY_FAILED when the read-back name lacks the marker", async () => {
    const deps = depsWith({ company_state: { name: "acme-real-co", domain: null } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_company"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

describe("hubspot:update_company", () => {
  it("seeds a company, PATCHes name, proves the SPECIFIC updated value (suffix)", async () => {
    const deps = depsWith({ company_state: { name: `${MARKER}updated` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_company"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(deps.calls.map((c) => c.action)).toEqual(["create_company", "update_company", "company_state"]);
    expect(deps.calls.find((c) => c.action === "update_company")!.config.companyId).toBe(COMPANY_ID);
  });

  it("is VERIFY_FAILED when the read-back still shows the SEED name", async () => {
    const deps = depsWith({ company_state: { name: `${MARKER}update-co` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_company"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

// ─── Deals ────────────────────────────────────────────────────────────────────

describe("hubspot:create_deal", () => {
  it("creates a marked deal on the discovered pipeline/stage, proves the marker", async () => {
    const deps = depsWith({ deal_state: { dealname: `${MARKER}deal`, dealstage: "stage-smoke" } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_deal"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_deal", "deal_state"]);
    const create = deps.calls.find((c) => c.action === "create_deal")!;
    expect(create.config.dealstage).toBe("stage-smoke");
    expect(create.config.pipeline).toBe("pipe-smoke");
    expect(create.config.dealname).toBe(`${MARKER}deal`);
    expect(deps.calls.find((c) => c.action === "deal_state")!.config.dealId).toBe(DEAL_ID);
  });

  it("is BLOCKED_ENV (never a write) when no pipeline/stage was discovered", async () => {
    const deps = depsWith({});
    const r = await runWriteSmoke(fixtureFor("hubspot:create_deal"), { ...RUN, envLookup: () => undefined }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(r.reason).toMatch(/SMOKE_HUBSPOT_DEAL_STAGE_ID|SMOKE_HUBSPOT_DEAL_PIPELINE_ID/);
    expect(deps.calls).toHaveLength(0);
  });
});

describe("hubspot:update_deal", () => {
  it("seeds a deal, PATCHes dealname, proves the SPECIFIC updated value (suffix)", async () => {
    const deps = depsWith({ deal_state: { dealname: `${MARKER}updated` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_deal"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(deps.calls.map((c) => c.action)).toEqual(["create_deal", "update_deal", "deal_state"]);
    const seed = deps.calls.find((c) => c.action === "create_deal")!;
    expect(seed.config.dealstage).toBe("stage-smoke");
    expect(seed.config.pipeline).toBe("pipe-smoke");
    expect(deps.calls.find((c) => c.action === "update_deal")!.config.dealId).toBe(DEAL_ID);
  });

  it("is VERIFY_FAILED when the read-back still shows the SEED dealname", async () => {
    const deps = depsWith({ deal_state: { dealname: `${MARKER}update-deal` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_deal"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is BLOCKED_ENV (never a seed create) when no pipeline/stage was discovered", async () => {
    const deps = depsWith({});
    const r = await runWriteSmoke(fixtureFor("hubspot:update_deal"), { ...RUN, envLookup: () => undefined }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});
