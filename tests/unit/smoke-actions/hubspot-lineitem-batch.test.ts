/**
 * @jest-environment node
 *
 * Write smoke harness — HubSpot line-item lifecycle batch (create_line_item,
 * update_line_item, remove_line_item).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE
 * boundary (mock only the external seam; run the real gate / ledger / phase /
 * verify / cleanup logic). Protects the contracts that matter:
 *   - the FIRST HubSpot flows with REAL delete cleanup: create/update clean via
 *     the registered remove_line_item (cleanupKind delete -> artifact
 *     "cleaned", cleaned == created, leaked 0);
 *   - the parent deal comes from the STAGING env overlay
 *     (SMOKE_HUBSPOT_LINEITEM_DEAL_ID), never the run ledger — so the
 *     cleaned==created gate holds without a deal-delete action;
 *   - remove_line_item is executeIsCleanup: the delete is proven by an
 *     INDEPENDENT read-back asserting exists == false (never the {deleted:true}
 *     echo);
 *   - a wrong read-back is VERIFY_FAILED, and a failed REQUIRED cleanup is
 *     CLEANUP_FAILED (never a silent leak);
 *   - all three gate BLOCKED_ENV when no staged deal overlay exists.
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
const LINE_ITEM_ID = "7001";
const DEAL_ID = "deal-staged";

const env = (n: string): string | undefined =>
  n === "SMOKE_HUBSPOT_LINEITEM_DEAL_ID" ? DEAL_ID : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/**
 * Fake boundary: engine steps echo the config the way the real handlers do;
 * the smokeRead seam returns the injected line_item_state outcome (or fails
 * when `stateError` is set, modeling a non-404 read failure).
 */
function depsWith(
  state: Record<string, unknown> | null,
  opts: { removeFails?: boolean; stateError?: string } = {},
): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "create_line_item":
          return {
            ok: true,
            output: {
              lineItemId: LINE_ITEM_ID,
              dealId: input.config.dealId,
              name: input.config.name,
              quantity: input.config.quantity,
            },
            reason: null,
          };
        case "update_line_item":
          return { ok: true, output: { lineItemId: LINE_ITEM_ID, name: input.config.name }, reason: null };
        case "remove_line_item":
          return opts.removeFails
            ? { ok: false, output: null, reason: "delete failed" }
            : { ok: true, output: { lineItemId: input.config.lineItemId, deleted: true }, reason: null };
        default:
          return { ok: false, output: null, reason: `no plan for ${input.action}` };
      }
    },
    async smokeReadBack(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (opts.stateError) return { ok: false, output: null, reason: opts.stateError };
      if (input.action === "line_item_state" && state) {
        return { ok: true, output: state, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("hubspot line-item batch — shape", () => {
  it("create/update are destructiveSafe writes cleaned by remove_line_item (delete kind)", () => {
    for (const key of ["hubspot:create_line_item", "hubspot:update_line_item"] as const) {
      const f = fixtureFor(key);
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.liveRisk).toBe("write");
      expect(f.liveSafe).toBe(false);
      expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
      expect(f.writeHarness?.cleanup?.action).toBe("remove_line_item");
      expect(f.writeHarness?.cleanupKind).toBe("delete");
      expect(f.writeHarness?.verify?.smokeRead).toBe(true);
      expect(f.requiredEnv).toEqual(["SMOKE_HUBSPOT_LINEITEM_DEAL_ID"]);
    }
  });

  it("remove_line_item is a destructive executeIsCleanup fixture proving exists==false", () => {
    const f = fixtureFor("hubspot:remove_line_item");
    expect(f.risk).toBe("destructive");
    expect(f.liveRisk).toBe("destructive");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.writeHarness?.executeIsCleanup).toBe(true);
    expect(f.writeHarness?.cleanup).toBeUndefined();
    expect(f.writeHarness?.verify?.expectEquals).toEqual({ path: "exists", value: false });
    expect(f.writeHarness?.verify?.smokeRead).toBe(true);
  });
});

// ─── create_line_item ────────────────────────────────────────────────────────

describe("hubspot:create_line_item", () => {
  it("creates a marked line item on the staged deal, verifies, then deletes it (cleaned)", async () => {
    const deps = depsWith({ exists: true, name: `${MARKER}lineitem`, quantity: "1" });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_line_item"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.created).toBe(1);
    expect(r.ledger.cleaned).toBe(1);
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "create_line_item",
      "line_item_state",
      "remove_line_item",
    ]);
    const create = deps.calls.find((c) => c.action === "create_line_item")!;
    expect(create.config.dealId).toBe(DEAL_ID);
    expect(create.config.name).toBe(`${MARKER}lineitem`);
    // Free-form line item: no product link, no price -> zero revenue weight.
    expect(create.config.hs_product_id).toBeUndefined();
    expect(create.config.price).toBeUndefined();
    expect(deps.calls.find((c) => c.action === "remove_line_item")!.config.lineItemId).toBe(LINE_ITEM_ID);
  });

  it("is VERIFY_FAILED when the read-back name lacks the marker (cleanup still deletes)", async () => {
    const deps = depsWith({ exists: true, name: "someone-elses-line", quantity: "1" });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_line_item"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.some((c) => c.action === "remove_line_item")).toBe(true);
  });

  it("is CLEANUP_FAILED when the required delete fails (never a silent leak)", async () => {
    const deps = depsWith({ exists: true, name: `${MARKER}lineitem`, quantity: "1" }, { removeFails: true });
    const r = await runWriteSmoke(fixtureFor("hubspot:create_line_item"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("CLEANUP_FAILED");
    expect(r.artifact).toBe("left");
    expect(r.ledger.leaked).toBe(1);
  });

  it("is BLOCKED_ENV (never a write) when no staged deal overlay exists", async () => {
    const deps = depsWith(null);
    const r = await runWriteSmoke(fixtureFor("hubspot:create_line_item"), { ...RUN, envLookup: () => undefined }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(r.reason).toMatch(/SMOKE_HUBSPOT_LINEITEM_DEAL_ID/);
    expect(deps.calls).toHaveLength(0);
  });
});

// ─── update_line_item ────────────────────────────────────────────────────────

describe("hubspot:update_line_item", () => {
  it("seeds, PATCHes name, proves the SPECIFIC updated value (suffix), then deletes", async () => {
    const deps = depsWith({ exists: true, name: `${MARKER}updated`, quantity: "1" });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_line_item"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "create_line_item",
      "update_line_item",
      "line_item_state",
      "remove_line_item",
    ]);
    const update = deps.calls.find((c) => c.action === "update_line_item")!;
    expect(update.config.lineItemId).toBe(LINE_ITEM_ID);
    expect(update.config.name).toBe(`${MARKER}updated`);
  });

  it("is VERIFY_FAILED when the read-back still shows the SEED name (cleanup still deletes)", async () => {
    const deps = depsWith({ exists: true, name: `${MARKER}seed-li`, quantity: "1" });
    const r = await runWriteSmoke(fixtureFor("hubspot:update_line_item"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "remove_line_item")).toBe(true);
  });
});

// ─── remove_line_item ────────────────────────────────────────────────────────

describe("hubspot:remove_line_item", () => {
  it("seeds, deletes, and proves absence via exists==false read-back (cleaned)", async () => {
    const deps = depsWith({ exists: false, name: null, quantity: null });
    const r = await runWriteSmoke(fixtureFor("hubspot:remove_line_item"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.created).toBe(1);
    expect(r.ledger.cleaned).toBe(1);
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "create_line_item",
      "remove_line_item",
      "line_item_state",
    ]);
    expect(deps.calls.find((c) => c.action === "remove_line_item")!.config.lineItemId).toBe(LINE_ITEM_ID);
  });

  it("is VERIFY_FAILED when the read-back says the line item still EXISTS", async () => {
    const deps = depsWith({ exists: true, name: `${MARKER}remove-li`, quantity: "1" });
    const r = await runWriteSmoke(fixtureFor("hubspot:remove_line_item"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is VERIFY_FAILED (never a false deleted) when the read-back errors", async () => {
    const deps = depsWith(null, { stateError: "provider read failed" });
    const r = await runWriteSmoke(fixtureFor("hubspot:remove_line_item"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is BLOCKED_ENV (never a seed create) when no staged deal overlay exists", async () => {
    const deps = depsWith(null);
    const r = await runWriteSmoke(fixtureFor("hubspot:remove_line_item"), { ...RUN, envLookup: () => undefined }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});
