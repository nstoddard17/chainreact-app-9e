/**
 * @jest-environment node
 *
 * Write smoke harness — HubSpot engagement/object batch (create_note,
 * create_task, create_ticket, update_ticket, create_product, update_product).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE
 * boundary (mock only the external seam; run the real gate / ledger / phase /
 * verify logic). Protects the contracts that matter:
 *   - all six are writeSafe with NO cleanup step (HubSpot has no registered
 *     delete/archive action for notes/tasks/tickets/products) -> artifact "left";
 *   - every verify is an INDEPENDENT smokeRead GET-by-id seam call (note_state /
 *     task_state / ticket_state / product_state), never a /search read;
 *   - creates capture the object id + echo the marker; updates seed via the
 *     create action and pin the SPECIFIC updated value via markerSuffix;
 *   - a wrong read-back is VERIFY_FAILED (no vacuous pass);
 *   - ticket fixtures gate BLOCKED_ENV when no ticket pipeline/stage was
 *     discovered (never an invented stage id).
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const NOTE_ID = "6001";
const TASK_ID = "6101";
const TICKET_ID = "6201";
const PRODUCT_ID = "6301";

const env = (n: string): string | undefined =>
  n === "SMOKE_HUBSPOT_TICKET_PIPELINE_ID"
    ? "tpipe-smoke"
    : n === "SMOKE_HUBSPOT_TICKET_STAGE_ID"
      ? "tstage-smoke"
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
        case "create_note":
          return { ok: true, output: { noteId: NOTE_ID, body: input.config.hs_note_body }, reason: null };
        case "create_task":
          return { ok: true, output: { taskId: TASK_ID, subject: input.config.hs_task_subject }, reason: null };
        case "create_ticket":
          return { ok: true, output: { ticketId: TICKET_ID, subject: input.config.subject }, reason: null };
        case "update_ticket":
          return { ok: true, output: { ticketId: TICKET_ID, subject: input.config.subject }, reason: null };
        case "create_product":
          return { ok: true, output: { productId: PRODUCT_ID, name: input.config.name }, reason: null };
        case "update_product":
          return { ok: true, output: { productId: PRODUCT_ID, name: input.config.name }, reason: null };
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

describe("hubspot engagement batch — shape", () => {
  const KEYS = [
    "hubspot:create_note",
    "hubspot:create_task",
    "hubspot:create_ticket",
    "hubspot:update_ticket",
    "hubspot:create_product",
    "hubspot:update_product",
  ] as const;

  it("all six are writeSafe writes with a smokeRead verify and NO cleanup", () => {
    for (const key of KEYS) {
      const f = fixtureFor(key);
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.liveRisk).toBe("write");
      expect(f.liveSafe).toBe(false);
      expect(f.writeHarness?.liveClass).toBe("writeSafe");
      expect(f.writeHarness?.cleanup).toBeUndefined();
      expect(f.writeHarness?.cleanupEach).toBeUndefined();
      expect(f.writeHarness?.cleanupAll).toBeUndefined();
      expect(f.writeHarness?.cleanupKind).toBeUndefined();
      expect(f.writeHarness?.verify?.smokeRead).toBe(true);
      expect(f.requiredEnv ?? []).not.toContain("SMOKE_HUBSPOT_CONNECTED");
    }
  });

  it("ticket fixtures require the discovered pipeline/stage env; the rest need none", () => {
    for (const key of ["hubspot:create_ticket", "hubspot:update_ticket"] as const) {
      expect(fixtureFor(key).requiredEnv).toEqual([
        "SMOKE_HUBSPOT_TICKET_PIPELINE_ID",
        "SMOKE_HUBSPOT_TICKET_STAGE_ID",
      ]);
    }
    for (const key of [
      "hubspot:create_note",
      "hubspot:create_task",
      "hubspot:create_product",
      "hubspot:update_product",
    ] as const) {
      expect(fixtureFor(key).requiredEnv ?? []).toEqual([]);
    }
    expect(fixtureFor("hubspot:create_ticket").configFromEnv).toEqual({
      hs_pipeline: "SMOKE_HUBSPOT_TICKET_PIPELINE_ID",
      hs_pipeline_stage: "SMOKE_HUBSPOT_TICKET_STAGE_ID",
    });
  });
});

// ─── Notes + tasks ────────────────────────────────────────────────────────────

describe("hubspot:create_note", () => {
  it("creates a marked note, proves the marker via note_state, leaves the artifact", async () => {
    const deps = depsWith({ note_state: { body: `${MARKER}note ChainReact action-smoke - safe to ignore` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_note"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_note", "note_state"]);
    expect(deps.calls.find((c) => c.action === "note_state")!.config.noteId).toBe(NOTE_ID);
  });

  it("is VERIFY_FAILED when the read-back body lacks the marker", async () => {
    const deps = depsWith({ note_state: { body: "someone elses note" } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_note"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

describe("hubspot:create_task", () => {
  it("creates a marked task, proves the marker via task_state, leaves the artifact", async () => {
    const deps = depsWith({ task_state: { subject: `${MARKER}task`, status: "NOT_STARTED" } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_task"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_task", "task_state"]);
    const create = deps.calls.find((c) => c.action === "create_task")!;
    expect(create.config.hs_task_subject).toBe(`${MARKER}task`);
    // No owner and no associations — the smoke task pings nobody.
    expect(create.config.hubspot_owner_id).toBeUndefined();
    expect(create.config.associatedContactId).toBeUndefined();
    expect(deps.calls.find((c) => c.action === "task_state")!.config.taskId).toBe(TASK_ID);
  });

  it("is VERIFY_FAILED when the read-back subject lacks the marker", async () => {
    const deps = depsWith({ task_state: { subject: "real work item", status: "NOT_STARTED" } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_task"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

// ─── Tickets ──────────────────────────────────────────────────────────────────

describe("hubspot:create_ticket", () => {
  it("creates a marked ticket on the discovered pipeline/stage, proves the marker", async () => {
    const deps = depsWith({ ticket_state: { subject: `${MARKER}ticket`, pipeline: "tpipe-smoke", stage: "tstage-smoke" } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_ticket"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_ticket", "ticket_state"]);
    const create = deps.calls.find((c) => c.action === "create_ticket")!;
    expect(create.config.hs_pipeline).toBe("tpipe-smoke");
    expect(create.config.hs_pipeline_stage).toBe("tstage-smoke");
    expect(create.config.subject).toBe(`${MARKER}ticket`);
    expect(deps.calls.find((c) => c.action === "ticket_state")!.config.ticketId).toBe(TICKET_ID);
  });

  it("is BLOCKED_ENV (never a write) when no ticket pipeline/stage was discovered", async () => {
    const deps = depsWith({});
    const r = await runWriteSmoke(fixtureFor("hubspot:create_ticket"), { ...RUN, envLookup: () => undefined }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(r.reason).toMatch(/SMOKE_HUBSPOT_TICKET_PIPELINE_ID|SMOKE_HUBSPOT_TICKET_STAGE_ID/);
    expect(deps.calls).toHaveLength(0);
  });
});

describe("hubspot:update_ticket", () => {
  it("seeds a ticket, PATCHes subject, proves the SPECIFIC updated value (suffix)", async () => {
    const deps = depsWith({ ticket_state: { subject: `${MARKER}updated` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_ticket"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(deps.calls.map((c) => c.action)).toEqual(["create_ticket", "update_ticket", "ticket_state"]);
    const seed = deps.calls.find((c) => c.action === "create_ticket")!;
    expect(seed.config.hs_pipeline).toBe("tpipe-smoke");
    expect(seed.config.hs_pipeline_stage).toBe("tstage-smoke");
    const update = deps.calls.find((c) => c.action === "update_ticket")!;
    expect(update.config.ticketId).toBe(TICKET_ID);
    expect(update.config.subject).toBe(`${MARKER}updated`);
  });

  it("is VERIFY_FAILED when the read-back still shows the SEED subject", async () => {
    const deps = depsWith({ ticket_state: { subject: `${MARKER}update-ticket` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_ticket"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is BLOCKED_ENV (never a seed create) when no ticket pipeline/stage was discovered", async () => {
    const deps = depsWith({});
    const r = await runWriteSmoke(fixtureFor("hubspot:update_ticket"), { ...RUN, envLookup: () => undefined }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});

// ─── Products ─────────────────────────────────────────────────────────────────

describe("hubspot:create_product", () => {
  it("creates a marked product, proves the marker via product_state, leaves the artifact", async () => {
    const deps = depsWith({ product_state: { name: `${MARKER}product`, description: null } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_product"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_product", "product_state"]);
    // No price — the smoke product carries zero revenue weight.
    expect(deps.calls.find((c) => c.action === "create_product")!.config.price).toBeUndefined();
    expect(deps.calls.find((c) => c.action === "product_state")!.config.productId).toBe(PRODUCT_ID);
  });

  it("is VERIFY_FAILED when the read-back name lacks the marker", async () => {
    const deps = depsWith({ product_state: { name: "real product", description: null } });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_product"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

describe("hubspot:update_product", () => {
  it("seeds a product, PATCHes name, proves the SPECIFIC updated value (suffix)", async () => {
    const deps = depsWith({ product_state: { name: `${MARKER}updated` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_product"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(deps.calls.map((c) => c.action)).toEqual(["create_product", "update_product", "product_state"]);
    const update = deps.calls.find((c) => c.action === "update_product")!;
    expect(update.config.productId).toBe(PRODUCT_ID);
    expect(update.config.name).toBe(`${MARKER}updated`);
  });

  it("is VERIFY_FAILED when the read-back still shows the SEED name", async () => {
    const deps = depsWith({ product_state: { name: `${MARKER}update-product` } });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_product"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
