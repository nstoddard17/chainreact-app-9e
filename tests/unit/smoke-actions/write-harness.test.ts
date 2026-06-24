/**
 * @jest-environment node
 *
 * Write / destructive smoke harness — phase orchestrator self-tests.
 *
 * Business rules protected (the foundation contract):
 *   1. cleanup runs after an EXECUTE failure,
 *   2. cleanup runs after a VERIFY failure,
 *   3. a cleanup FAILURE is surfaced (CLEANUP_FAILED) and is never a PASS,
 *   4. a destructive/cleanup step CANNOT run without a smoke-owned ledger resource,
 *   5. dry-run NEVER calls a mutating provider seam,
 *   6. the risk gates block by default (writeSafe / destructiveSafe / billingSensitive / neverLive).
 *
 * Mocks only the external boundary (`runActionStep`), per the testing-strategy
 * rule — the real gate / ledger / phase logic runs.
 */
import type { ActionSmokeFixture, WriteHarnessSpec } from "@/tests/smoke-actions/contract";
import {
  ResourceLedger,
  cleanupTargetsSmokeOwned,
  foldToSmokeResult,
  ledgerRefsIn,
  resolveScalarTokens,
  resolveStepConfig,
  nonEmptyArrayAtPath,
  runWriteSmoke,
  valueEmptyAtPath,
  valueEqualsAtPath,
  valuePresentInArrayAtPath,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

// ─── Fakes ─────────────────────────────────────────────────────────────────

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/** A fake boundary whose per-`provider:action` outcome is scripted. */
function fakeDeps(plan: Record<string, StepRunOutcome> = {}): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
    },
  };
}

function fixture(
  action: string,
  writeHarness: WriteHarnessSpec,
  config: Record<string, unknown> = {},
): ActionSmokeFixture {
  return {
    provider: "acme",
    action,
    risk: "write",
    config,
    expect: { outcome: "success" },
    writeHarness,
  };
}

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;

// A destructiveSafe spec: setup creates a resource, execute is the action under
// test, cleanup deletes the captured resource. Verify optional per test.
function destructiveSpec(over: Partial<WriteHarnessSpec> = {}): WriteHarnessSpec {
  return {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "acme",
        action: "setup_create",
        config: { name: "{{smokeMarker}}seed" },
        captureResource: { resourceKey: "r", idPath: "id", kind: "thing" },
      },
    ],
    cleanup: {
      provider: "acme",
      action: "delete_thing",
      config: { id: "{{ledger.r.id}}" },
    },
    ...over,
  };
}

// ─── 1. cleanup runs after an execute failure ────────────────────────────────

describe("cleanup is always attempted", () => {
  it("runs cleanup even when EXECUTE fails (req 1)", async () => {
    const deps = fakeDeps({
      "acme:setup_create": { ok: true, output: { id: "X1" }, reason: null },
      "acme:run_action": { ok: false, output: null, reason: "boom" },
    });
    const res = await runWriteSmoke(fixture("run_action", destructiveSpec()), RUN, deps);

    expect(res.status).toBe("FAIL"); // execute failed
    // cleanup still ran against the setup-created resource
    expect(deps.calls.some((c) => c.action === "delete_thing")).toBe(true);
    expect(res.phases.find((p) => p.phase === "cleanup")?.outcome).toBe("ok");
    expect(res.ledger.created).toBe(1);
    expect(res.ledger.cleaned).toBe(1);
    expect(res.ledger.leaked).toBe(0);
  });

  it("runs cleanup even when VERIFY fails (req 2)", async () => {
    const deps = fakeDeps({
      "acme:run_action": { ok: true, output: { id: "X2" }, reason: null },
      "acme:get_thing": { ok: false, output: null, reason: "not found" },
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: { resourceKey: "r", idPath: "id", kind: "thing" },
      verify: { provider: "acme", action: "get_thing", config: { id: "{{ledger.r.id}}" } },
    });
    const res = await runWriteSmoke(fixture("run_action", spec), RUN, deps);

    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_thing")).toBe(true);
    expect(res.ledger.cleaned).toBe(1);
    expect(res.ledger.leaked).toBe(0);
  });
});

// ─── 3. cleanup failure surfaced + prevents certification ────────────────────

describe("a cleanup failure is surfaced and is never a PASS (req 3)", () => {
  it("escalates an otherwise-PASS run to CLEANUP_FAILED and folds to a gate fail", async () => {
    const deps = fakeDeps({
      "acme:run_action": { ok: true, output: { id: "X3" }, reason: null },
      "acme:delete_thing": { ok: false, output: null, reason: "delete failed" },
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: { resourceKey: "r", idPath: "id", kind: "thing" },
    });
    const res = await runWriteSmoke(fixture("run_action", spec), RUN, deps);

    expect(res.status).toBe("CLEANUP_FAILED");
    expect(res.ledger.leaked).toBe(1); // resource left behind
    // Folds to a FAIL so the ExecutionReport gate fails -> no LIVE_PASS cert.
    expect(foldToSmokeResult(fixture("run_action", spec), res).outcome).toBe("fail");
  });
});

// ─── 4. destructive cannot run without a smoke-owned resource ────────────────

describe("the smoke-owned guard (req 4)", () => {
  it("refuses a cleanup whose target is not a smoke-owned ledger resource", async () => {
    const deps = fakeDeps({
      "acme:setup_create": { ok: true, output: { id: "X4-seed" }, reason: null },
      "acme:run_action": { ok: true, output: { id: "X4" }, reason: null },
    });
    // Setup creates a real ledger resource, but cleanup targets a FOREIGN literal
    // id (no {{ledger.*}} reference) — must be refused, never executed.
    const spec = destructiveSpec({
      cleanup: { provider: "acme", action: "delete_thing", config: { id: "rec-FOREIGN-NOT-OURS" } },
    });
    const res = await runWriteSmoke(fixture("run_action", spec), RUN, deps);

    expect(deps.calls.some((c) => c.action === "delete_thing")).toBe(false); // never called
    expect(res.phases.find((p) => p.phase === "cleanup")?.outcome).toBe("failed");
    expect(res.phases.find((p) => p.phase === "cleanup")?.reason).toMatch(/refused/i);
    expect(res.status).toBe("CLEANUP_FAILED");
  });

  it("cleanupTargetsSmokeOwned: true only with a known ledger ref", () => {
    const ledger = new ResourceLedger();
    ledger.record({ resourceKey: "r", provider: "acme", kind: "thing", externalId: "X", marker: "m" });
    expect(
      cleanupTargetsSmokeOwned({ provider: "acme", action: "d", config: { id: "{{ledger.r.id}}" } }, ledger),
    ).toBe(true);
    expect(
      cleanupTargetsSmokeOwned({ provider: "acme", action: "d", config: { id: "literal" } }, ledger),
    ).toBe(false);
    expect(
      cleanupTargetsSmokeOwned({ provider: "acme", action: "d", config: { id: "{{ledger.missing.id}}" } }, ledger),
    ).toBe(false);
  });
});

// ─── 5. dry-run never mutates ────────────────────────────────────────────────

describe("dry-run plans without mutating (req 5)", () => {
  it("calls no provider seam and reports a planned SKIP", async () => {
    const deps = fakeDeps();
    const spec = destructiveSpec({
      captureResource: { resourceKey: "r", idPath: "id", kind: "thing" },
      verify: { provider: "acme", action: "get_thing", config: { id: "{{ledger.r.id}}" } },
    });
    const res = await runWriteSmoke(fixture("run_action", spec), { ...RUN, dryRun: true }, deps);

    expect(deps.calls).toHaveLength(0); // NOTHING called
    expect(res.dryRun).toBe(true);
    expect(res.status).toBe("SKIP");
    expect(res.phases.every((p) => p.outcome === "skipped")).toBe(true);
    expect(res.phases.map((p) => p.phase)).toEqual(["setup", "execute", "verify", "cleanup"]);
  });
});

// ─── 6. risk gates block by default ──────────────────────────────────────────

describe("risk gates block by default (req 6)", () => {
  const noGates = { runToken: "T1" } as const; // allowWrite/allowDestructive absent

  it("writeSafe SKIPs without the write gate", async () => {
    const deps = fakeDeps();
    const spec: WriteHarnessSpec = { liveClass: "writeSafe", smokeMarker: "crsmoke-" };
    const res = await runWriteSmoke(fixture("create_thing", spec), noGates, deps);
    expect(res.status).toBe("SKIP");
    expect(res.reason).toMatch(/ALLOW_LIVE_PROVIDER_WRITE_SMOKE/);
    expect(deps.calls).toHaveLength(0);
  });

  it("destructiveSafe SKIPs with the write gate but no destructive gate", async () => {
    const deps = fakeDeps();
    const res = await runWriteSmoke(
      fixture("run_action", destructiveSpec()),
      { runToken: "T1", allowWrite: true },
      deps,
    );
    expect(res.status).toBe("SKIP");
    expect(res.reason).toMatch(/ALLOW_DESTRUCTIVE_PROVIDER_SMOKE/);
    expect(deps.calls).toHaveLength(0);
  });

  it("billingSensitive is SANDBOX_REQUIRED without a confirmed test-mode account", async () => {
    const deps = fakeDeps();
    const spec: WriteHarnessSpec = {
      liveClass: "billingSensitive",
      smokeMarker: "crsmoke-",
      requiresSandboxEnv: "SMOKE_STRIPE_TEST_MODE",
    };
    const res = await runWriteSmoke(fixture("create_charge", spec), { ...RUN, envLookup: () => undefined }, deps);
    expect(res.status).toBe("SANDBOX_REQUIRED");
    expect(deps.calls).toHaveLength(0);
  });

  it("billingSensitive becomes eligible once the sandbox env is confirmed", async () => {
    const deps = fakeDeps({ "acme:create_charge": { ok: true, output: null, reason: null } });
    const spec: WriteHarnessSpec = {
      liveClass: "billingSensitive",
      smokeMarker: "crsmoke-",
      requiresSandboxEnv: "SMOKE_STRIPE_TEST_MODE",
    };
    const res = await runWriteSmoke(
      fixture("create_charge", spec),
      { ...RUN, envLookup: (n) => (n === "SMOKE_STRIPE_TEST_MODE" ? "1" : undefined) },
      deps,
    );
    expect(res.status).toBe("PASS"); // got past the sandbox gate and ran
    expect(deps.calls.some((c) => c.action === "create_charge")).toBe(true);
  });

  it("neverLive is UNSAFE_NO_HARNESS and never runs", async () => {
    const deps = fakeDeps();
    const spec: WriteHarnessSpec = { liveClass: "neverLive", smokeMarker: "crsmoke-" };
    const res = await runWriteSmoke(fixture("broadcast_to_world", spec), RUN, deps);
    expect(res.status).toBe("UNSAFE_NO_HARNESS");
    expect(deps.calls).toHaveLength(0);
  });

  it("a missing smoke TARGET env is BLOCKED_ENV (not 'not connected'), and never mutates", async () => {
    const deps = fakeDeps();
    const fx: ActionSmokeFixture = {
      provider: "acme",
      action: "create_thing",
      risk: "write",
      config: {},
      configFromEnv: { listId: "SMOKE_ACME_LIST_ID" },
      // _CONNECTED is a connection signal (asserted by the real DB check), NOT a
      // target — its absence must NOT block. The LIST_ID target is what blocks.
      requiredEnv: ["SMOKE_ACME_CONNECTED", "SMOKE_ACME_LIST_ID"],
      expect: { outcome: "success" },
      writeHarness: { liveClass: "writeSafe", smokeMarker: "crsmoke-" },
    };
    const res = await runWriteSmoke(fx, { ...RUN, envLookup: () => undefined }, deps);
    expect(res.status).toBe("BLOCKED_ENV");
    expect(res.reason).toMatch(/SMOKE_ACME_LIST_ID/);
    expect(res.reason).not.toMatch(/SMOKE_ACME_CONNECTED/); // connection signal excluded
    expect(deps.calls).toHaveLength(0);
  });

  it("resolves when the target env is present (BLOCKED_ENV clears)", async () => {
    const deps = fakeDeps({ "acme:create_thing": { ok: true, output: null, reason: null } });
    const fx: ActionSmokeFixture = {
      provider: "acme",
      action: "create_thing",
      risk: "write",
      config: {},
      configFromEnv: { listId: "SMOKE_ACME_LIST_ID" },
      requiredEnv: ["SMOKE_ACME_CONNECTED", "SMOKE_ACME_LIST_ID"],
      expect: { outcome: "success" },
      writeHarness: { liveClass: "writeSafe", smokeMarker: "crsmoke-" },
    };
    const res = await runWriteSmoke(
      fx,
      { ...RUN, envLookup: (n) => (n === "SMOKE_ACME_LIST_ID" ? "L1" : undefined) },
      deps,
    );
    expect(res.status).toBe("PASS");
    expect(deps.calls.find((c) => c.action === "create_thing")?.config.listId).toBe("L1");
  });
});

// ─── Happy path + helpers ────────────────────────────────────────────────────

describe("PASS path + pure helpers", () => {
  it("setup -> execute -> verify -> cleanup all ok => PASS, cleaned, gate pass", async () => {
    const deps = fakeDeps({
      "acme:setup_create": { ok: true, output: { id: "S" }, reason: null },
      "acme:run_action": { ok: true, output: { id: "E" }, reason: null },
      "acme:get_thing": { ok: true, output: null, reason: null },
    });
    const spec = destructiveSpec({
      captureResource: { resourceKey: "r", idPath: "id", kind: "thing" },
      verify: { provider: "acme", action: "get_thing", config: { id: "{{ledger.r.id}}" } },
    });
    const res = await runWriteSmoke(fixture("run_action", spec), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.ledger.leaked).toBe(0);
    expect(foldToSmokeResult(fixture("run_action", spec), res).outcome).toBe("pass");
  });

  it("resolveStepConfig substitutes the marker and ledger ids", () => {
    const ledger = new ResourceLedger();
    ledger.record({ resourceKey: "r", provider: "acme", kind: "thing", externalId: "rec123", marker: "m" });
    const out = resolveStepConfig(
      { name: "{{smokeMarker}}x", id: "{{ledger.r.id}}", nested: { also: "{{ledger.r.id}}" } },
      "crsmoke-T1-",
      ledger,
    );
    expect(out.name).toBe("crsmoke-T1-x");
    expect(out.id).toBe("rec123");
    expect((out.nested as Record<string, unknown>).also).toBe("rec123");
  });

  it("ledgerRefsIn finds nested ledger references", () => {
    expect(ledgerRefsIn({ a: "{{ledger.x.id}}", b: ["{{ledger.y.id}}"], c: 1 }).sort()).toEqual(["x", "y"]);
    expect(ledgerRefsIn({ a: "literal" })).toEqual([]);
  });
});

// ─── env sub-step resolution + configFromEnv overlay + marker echo ───────────

describe("env resolution + marker echo (live wiring)", () => {
  it("resolveStepConfig resolves {{env.NAME}} and leaves unresolved tokens literal", () => {
    const ledger = new ResourceLedger();
    const out = resolveStepConfig(
      { a: "{{env.FOO}}", b: "{{env.MISSING}}" },
      "m-",
      ledger,
      (n) => (n === "FOO" ? "bar" : undefined),
    );
    expect(out.a).toBe("bar");
    expect(out.b).toBe("{{env.MISSING}}"); // left literal -> step fails loud, never wrong target
  });

  it("resolveStepConfig resolves env tokens in object KEYS (e.g. an Airtable field name)", () => {
    const ledger = new ResourceLedger();
    const out = resolveStepConfig(
      { "{{env.FIELD}}": { type: "singleLineText", value: "{{smokeMarker}}x" } },
      "crsmoke-T1-",
      ledger,
      (n) => (n === "FIELD" ? "Draft Name" : undefined),
    );
    expect(Object.keys(out)).toEqual(["Draft Name"]);
    expect((out["Draft Name"] as Record<string, unknown>).value).toBe("crsmoke-T1-x");
  });

  it("resolveScalarTokens resolves env + marker (used for markerEchoPath)", () => {
    expect(resolveScalarTokens("fields.{{env.F}}", "m-", (n) => (n === "F" ? "Draft Name" : undefined))).toBe(
      "fields.Draft Name",
    );
  });

  it("overlays the fixture configFromEnv onto the EXECUTE step config", async () => {
    const deps = fakeDeps({ "acme:create_thing": { ok: true, output: { name: "crsmoke-T1-x" }, reason: null } });
    const fx: ActionSmokeFixture = {
      provider: "acme",
      action: "create_thing",
      risk: "write",
      config: { name: "{{smokeMarker}}x" },
      configFromEnv: { listId: "SMOKE_LIST" },
      expect: { outcome: "success" },
      writeHarness: { liveClass: "writeSafe", smokeMarker: "crsmoke-" },
    };
    await runWriteSmoke(fx, { ...RUN, envLookup: (n) => (n === "SMOKE_LIST" ? "L1" : undefined) }, deps);
    const exec = deps.calls.find((c) => c.action === "create_thing");
    expect(exec?.config.listId).toBe("L1"); // env overlaid
    expect(exec?.config.name).toBe("crsmoke-T1-x"); // marker stamped
  });

  it("marker echo passes when the created resource echoes the marker", async () => {
    const deps = fakeDeps({ "acme:create_thing": { ok: true, output: { name: "crsmoke-T1-pilot" }, reason: null } });
    const fx = fixture("create_thing", {
      liveClass: "writeSafe",
      smokeMarker: "crsmoke-",
      markerEchoPath: "name",
    });
    const res = await runWriteSmoke(fx, RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.phases.find((p) => p.phase === "verify")?.outcome).toBe("ok");
  });

  it("verify markerPath confirms the marker on a READ-BACK response (PASS)", async () => {
    const deps = fakeDeps({
      "acme:create_thing": { ok: true, output: { id: "X" }, reason: null },
      // the read-back (get) echoes the marker on its `title`
      "acme:get_thing": { ok: true, output: { title: "crsmoke-T1-pilot" }, reason: null },
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: { resourceKey: "r", idPath: "id", kind: "thing" },
      verify: { provider: "acme", action: "get_thing", config: { id: "{{ledger.r.id}}" }, markerPath: "title" },
    });
    const res = await runWriteSmoke(fixture("create_thing", spec), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.phases.filter((p) => p.phase === "verify").some((p) => /marker confirmed/.test(p.reason ?? ""))).toBe(true);
  });

  it("verify markerPath confirms the marker inside an ARRAY read-back (blocks/comments)", async () => {
    const deps = fakeDeps({
      "acme:create_thing": { ok: true, output: { id: "X" }, reason: null },
      // read-back returns a collection; the marker is in one element's text
      "acme:list_things": {
        ok: true,
        output: { items: [{ id: "b1", plainText: "intro" }, { id: "b2", plainText: "crsmoke-T1-block" }] },
        reason: null,
      },
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: { resourceKey: "r", idPath: "id", kind: "thing" },
      verify: { provider: "acme", action: "list_things", config: { id: "{{ledger.r.id}}" }, markerPath: "items" },
    });
    const res = await runWriteSmoke(fixture("create_thing", spec), RUN, deps);
    expect(res.status).toBe("PASS");
  });

  it("verify markerPath fails (VERIFY_FAILED) when the read-back lacks the marker", async () => {
    const deps = fakeDeps({
      "acme:create_thing": { ok: true, output: { id: "X" }, reason: null },
      "acme:get_thing": { ok: true, output: { title: "some other page" }, reason: null }, // exists but wrong marker
      "acme:delete_thing": { ok: true, output: null, reason: null },
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: { resourceKey: "r", idPath: "id", kind: "thing" },
      verify: { provider: "acme", action: "get_thing", config: { id: "{{ledger.r.id}}" }, markerPath: "title" },
      cleanupKind: "delete",
    });
    const res = await runWriteSmoke(fixture("create_thing", spec), RUN, deps);
    // existence alone is NOT enough — the marker must match.
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_thing")).toBe(true); // cleanup still ran
  });

  it("marker echo fails (VERIFY_FAILED) when the created resource lacks the marker", async () => {
    const deps = fakeDeps({
      "acme:create_thing": { ok: true, output: { name: "someone-elses-record" }, reason: null },
    });
    const fx = fixture("create_thing", {
      liveClass: "destructiveSafe",
      smokeMarker: "crsmoke-",
      markerEchoPath: "name",
      captureResource: { resourceKey: "r", idPath: "id", kind: "thing" },
      cleanup: { provider: "acme", action: "delete_thing", config: { id: "{{ledger.r.id}}" } },
    });
    // give the create an id so it lands in the ledger + cleanup can run
    deps.calls.length = 0;
    const deps2 = fakeDeps({
      "acme:create_thing": { ok: true, output: { id: "X", name: "someone-elses-record" }, reason: null },
    });
    const res = await runWriteSmoke(fx, RUN, deps2);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps2.calls.some((c) => c.action === "delete_thing")).toBe(true); // cleanup still ran
  });
});

// ─── smoke-only read-back verify (Trello add_comment) ───────────────────────

describe("smokeRead verify routes to the smoke read-back seam, never the engine", () => {
  // A spec whose verify is a SMOKE READ-BACK (no registered read action).
  function commentSpec(): WriteHarnessSpec {
    return {
      liveClass: "destructiveSafe",
      smokeMarker: "crsmoke-",
      setup: [
        {
          provider: "trello",
          action: "create_card",
          config: { name: "{{smokeMarker}}seed" },
          captureResource: { resourceKey: "card", idPath: "cardId", kind: "card" },
        },
      ],
      verify: {
        provider: "trello",
        action: "card_comments",
        config: { cardId: "{{ledger.card.id}}" },
        markerPath: "comments",
        smokeRead: true,
      },
      cleanupKind: "archive",
      cleanup: { provider: "trello", action: "archive_card", config: { cardId: "{{ledger.card.id}}" } },
    };
  }

  function depsWith(
    plan: Record<string, StepRunOutcome>,
    smokePlan?: Record<string, StepRunOutcome>,
  ): RecordingDeps {
    const calls: RecordingDeps["calls"] = [];
    const base: RecordingDeps = {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
      },
    };
    if (smokePlan) {
      base.smokeReadBack = async (input) => {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        return smokePlan[`${input.provider}:${input.action}`] ?? { ok: false, output: null, reason: "no reader" };
      };
    }
    return base;
  }

  it("PASS when the independent read-back contains the marker", async () => {
    const deps = depsWith(
      {
        "trello:create_card": { ok: true, output: { cardId: "C1" }, reason: null },
        "trello:add_comment": { ok: true, output: { commentId: "A1", text: "crsmoke-T1-comment" }, reason: null },
      },
      { "trello:card_comments": { ok: true, output: { comments: [{ text: "crsmoke-T1-comment" }] }, reason: null } },
    );
    const res = await runWriteSmoke(fixture("add_comment", commentSpec()), RUN, deps);
    expect(res.status).toBe("PASS");
    // the read-back went through smokeReadBack, never runActionStep for card_comments
    expect(deps.calls.filter((c) => c.action === "card_comments")).toHaveLength(1);
  });

  it("input echo CANNOT satisfy verification: read-back without the marker -> VERIFY_FAILED", async () => {
    const deps = depsWith(
      {
        "trello:create_card": { ok: true, output: { cardId: "C1" }, reason: null },
        // the WRITE response echoes the marker (input echo) ...
        "trello:add_comment": { ok: true, output: { commentId: "A1", text: "crsmoke-T1-comment" }, reason: null },
      },
      // ... but the INDEPENDENT read-back does NOT contain it (provider didn't persist)
      { "trello:card_comments": { ok: true, output: { comments: [] }, reason: null } },
    );
    const res = await runWriteSmoke(fixture("add_comment", commentSpec()), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED"); // not a vacuous pass
    expect(deps.calls.some((c) => c.action === "archive_card")).toBe(true); // cleanup still runs
  });

  it("a smokeRead step with no read-back seam fails loud (never runs an unknown action)", async () => {
    const deps = depsWith({
      "trello:create_card": { ok: true, output: { cardId: "C1" }, reason: null },
      "trello:add_comment": { ok: true, output: { commentId: "A1" }, reason: null },
    }); // no smokePlan -> deps.smokeReadBack undefined
    const res = await runWriteSmoke(fixture("add_comment", commentSpec()), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    // card_comments was NEVER dispatched as a normal engine action
    expect(deps.calls.some((c) => c.action === "card_comments")).toBe(false);
  });
});

// ─── pure path-assertion helpers ─────────────────────────────────────────────

describe("valueEqualsAtPath / valuePresentInArrayAtPath (pure)", () => {
  it("valueEqualsAtPath: strict scalar equality, missing/non-scalar -> false", () => {
    expect(valueEqualsAtPath({ archived: true }, "archived", true)).toBe(true);
    expect(valueEqualsAtPath({ archived: false }, "archived", true)).toBe(false);
    expect(valueEqualsAtPath({ n: 3 }, "n", 3)).toBe(true);
    expect(valueEqualsAtPath({ s: "x" }, "s", "x")).toBe(true);
    expect(valueEqualsAtPath({ s: "x" }, "missing", "x")).toBe(false);
    expect(valueEqualsAtPath(null, "archived", true)).toBe(false);
    // a truthy non-matching type is never loosely equal
    expect(valueEqualsAtPath({ archived: "true" }, "archived", true)).toBe(false);
  });

  it("valuePresentInArrayAtPath: array membership + scalar fallback", () => {
    expect(valuePresentInArrayAtPath({ idLabels: ["a", "b"] }, "idLabels", "b")).toBe(true);
    expect(valuePresentInArrayAtPath({ idLabels: ["a", "b"] }, "idLabels", "z")).toBe(false);
    expect(valuePresentInArrayAtPath({ idLabels: [] }, "idLabels", "b")).toBe(false);
    expect(valuePresentInArrayAtPath({ one: "b" }, "one", "b")).toBe(true); // scalar fallback
    expect(valuePresentInArrayAtPath({ one: "b" }, "missing", "b")).toBe(false);
    expect(valuePresentInArrayAtPath(null, "idLabels", "b")).toBe(false);
  });

  it("nonEmptyArrayAtPath: non-empty array, with optional per-element key", () => {
    expect(nonEmptyArrayAtPath({ files: [{ id: "att1" }] }, "files")).toBe(true);
    expect(nonEmptyArrayAtPath({ files: [] }, "files")).toBe(false); // empty
    expect(nonEmptyArrayAtPath({ files: "x" }, "files")).toBe(false); // not an array
    expect(nonEmptyArrayAtPath({}, "files")).toBe(false); // missing
    expect(nonEmptyArrayAtPath(null, "files")).toBe(false);
    // elementHasKey: every element must carry a truthy value at the key
    expect(nonEmptyArrayAtPath({ files: [{ id: "att1" }, { id: "att2" }] }, "files", "id")).toBe(true);
    expect(nonEmptyArrayAtPath({ files: [{ id: "att1" }, { url: "x" }] }, "files", "id")).toBe(false);
    expect(nonEmptyArrayAtPath({ files: [{ id: "" }] }, "files", "id")).toBe(false); // falsy id
    // nested path (the attachment-field case)
    expect(nonEmptyArrayAtPath({ fields: { "Draft Image": [{ id: "att1" }] } }, "fields.Draft Image", "id")).toBe(true);
  });

  it("valueEmptyAtPath: PRESENT-but-empty passes; missing path / non-empty / no-output fail", () => {
    // present + empty -> true (the cleared-cell cases get_cell_value can return)
    expect(valueEmptyAtPath({ value: null }, "value")).toBe(true);
    expect(valueEmptyAtPath({ value: undefined }, "value")).toBe(true); // key present, value undefined
    expect(valueEmptyAtPath({ value: "" }, "value")).toBe(true);
    expect(valueEmptyAtPath({ values: [] }, "values")).toBe(true); // empty array (range read-back)
    // present + NON-empty -> false (a wrong / still-set value must never read as cleared)
    expect(valueEmptyAtPath({ value: "crsmoke-x" }, "value")).toBe(false);
    expect(valueEmptyAtPath({ value: 0 }, "value")).toBe(false); // 0 is a real value, not empty
    expect(valueEmptyAtPath({ value: false }, "value")).toBe(false); // false is a real value
    expect(valueEmptyAtPath({ values: ["x"] }, "values")).toBe(false);
    expect(valueEmptyAtPath({ value: {} }, "value")).toBe(false); // object is not "empty"
    // MISSING path -> false (conservative: arbitrary absence never vacuously passes)
    expect(valueEmptyAtPath({}, "value")).toBe(false);
    expect(valueEmptyAtPath({ other: null }, "value")).toBe(false);
    expect(valueEmptyAtPath({ a: null }, "a.b")).toBe(false); // cannot descend through null
    // NO read-back output at all -> false (an error/empty step is never "cleared")
    expect(valueEmptyAtPath(null, "value")).toBe(false);
    // nested present-and-empty
    expect(valueEmptyAtPath({ cell: { value: null } }, "cell.value")).toBe(true);
  });
});

// ─── expectEquals (state) + expectContains (membership) verify primitives ────

describe("expectEquals / expectContains state + membership verification", () => {
  const captured = { resourceKey: "r", idPath: "id", kind: "thing" } as const;

  it("expectEquals PASS: read-back scalar equals the expected state (archived==true)", async () => {
    const deps = fakeDeps({
      "acme:archive_thing": { ok: true, output: { id: "X" }, reason: null },
      // the action's OWN output could lie; the INDEPENDENT get_thing read-back is trusted
      "acme:get_thing": { ok: true, output: { title: "crsmoke-T1-seed", archived: true }, reason: null },
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: captured,
      cleanupKind: "archive",
      cleanup: { provider: "acme", action: "archive_thing2", config: { id: "{{ledger.r.id}}" } },
      verify: {
        provider: "acme",
        action: "get_thing",
        config: { id: "{{ledger.r.id}}" },
        markerPath: "title",
        expectEquals: { path: "archived", value: true },
      },
    });
    const res = await runWriteSmoke(fixture("archive_thing", spec), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.phases.filter((p) => p.phase === "verify").some((p) => /== expected state/.test(p.reason ?? ""))).toBe(true);
  });

  it("expectEquals VERIFY_FAILED: marker matches but the state did not change", async () => {
    const deps = fakeDeps({
      "acme:archive_thing": { ok: true, output: { id: "X" }, reason: null },
      // OUR resource (marker) but archive never took effect (archived still false)
      "acme:get_thing": { ok: true, output: { title: "crsmoke-T1-seed", archived: false }, reason: null },
      "acme:archive_thing2": { ok: true, output: null, reason: null },
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: captured,
      cleanupKind: "archive",
      cleanup: { provider: "acme", action: "archive_thing2", config: { id: "{{ledger.r.id}}" } },
      verify: {
        provider: "acme",
        action: "get_thing",
        config: { id: "{{ledger.r.id}}" },
        markerPath: "title",
        expectEquals: { path: "archived", value: true },
      },
    });
    const res = await runWriteSmoke(fixture("archive_thing", spec), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED"); // state assertion failed even though marker matched
    expect(deps.calls.some((c) => c.action === "archive_thing2")).toBe(true); // cleanup still ran
  });

  it("expectContains PASS: read-back array contains the env-resolved member (label id)", async () => {
    const deps = fakeDeps({
      "acme:add_label": { ok: true, output: { id: "C1" }, reason: null },
    });
    // route the verify through the smoke read-back seam (independent of the write echo)
    deps.smokeReadBack = async () => ({
      ok: true,
      output: { name: "crsmoke-T1-seed", idLabels: ["lblOther", "LBL-XYZ"] },
      reason: null,
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: captured,
      cleanupKind: "archive",
      cleanup: { provider: "acme", action: "archive_thing2", config: { id: "{{ledger.r.id}}" } },
      verify: {
        provider: "acme",
        action: "card",
        config: { id: "{{ledger.r.id}}" },
        markerPath: "name",
        expectContains: { path: "idLabels", value: "{{env.SMOKE_LABEL}}" },
        smokeRead: true,
      },
    });
    const res = await runWriteSmoke(
      fixture("add_label", spec),
      { ...RUN, envLookup: (n) => (n === "SMOKE_LABEL" ? "LBL-XYZ" : undefined) },
      deps,
    );
    expect(res.status).toBe("PASS");
    expect(res.phases.filter((p) => p.phase === "verify").some((p) => /contains the expected member/.test(p.reason ?? ""))).toBe(true);
  });

  it("expectContains VERIFY_FAILED: the membership did not persist (label absent on read-back)", async () => {
    const deps = fakeDeps({ "acme:add_label": { ok: true, output: { id: "C1" }, reason: null } });
    // the WRITE could echo the label; the INDEPENDENT read-back shows it was NOT applied
    deps.smokeReadBack = async () => ({
      ok: true,
      output: { name: "crsmoke-T1-seed", idLabels: [] },
      reason: null,
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: captured,
      cleanupKind: "archive",
      cleanup: { provider: "acme", action: "archive_thing2", config: { id: "{{ledger.r.id}}" } },
      verify: {
        provider: "acme",
        action: "card",
        config: { id: "{{ledger.r.id}}" },
        expectContains: { path: "idLabels", value: "{{env.SMOKE_LABEL}}" },
        smokeRead: true,
      },
    });
    const res = await runWriteSmoke(
      fixture("add_label", spec),
      { ...RUN, envLookup: (n) => (n === "SMOKE_LABEL" ? "LBL-XYZ" : undefined) },
      deps,
    );
    expect(res.status).toBe("VERIFY_FAILED");
  });

  it("expectNonEmptyArray PASS: attachment field populated (each with id), token-resolved path", async () => {
    const deps = fakeDeps({ "acme:add_attachment": { ok: true, output: { recordId: "C1" }, reason: null } });
    // read-back returns the record's fields with a populated attachment array
    deps.smokeReadBack = async () => ({
      ok: true,
      output: { exists: true, fields: { "Draft Image": [{ id: "att1", url: "https://rehosted" }] } },
      reason: null,
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: { resourceKey: "r", idPath: "recordId", kind: "record" },
      cleanupKind: "delete",
      verify: {
        provider: "acme",
        action: "record",
        config: { recordId: "{{ledger.r.id}}" },
        // path token-resolves the dynamic attachment field name
        expectNonEmptyArray: { path: "fields.{{env.ATT_FIELD}}", elementHasKey: "id" },
        smokeRead: true,
      },
    });
    const res = await runWriteSmoke(
      fixture("add_attachment", spec),
      { ...RUN, envLookup: (n) => (n === "ATT_FIELD" ? "Draft Image" : undefined) },
      deps,
    );
    expect(res.status).toBe("PASS");
    expect(res.phases.some((p) => /non-empty array/.test(p.reason ?? ""))).toBe(true);
  });

  it("expectNonEmptyArray VERIFY_FAILED: attachment field stayed empty (ingestion produced nothing)", async () => {
    const deps = fakeDeps({
      "acme:add_attachment": { ok: true, output: { recordId: "C1" }, reason: null },
      "acme:delete_record": { ok: true, output: null, reason: null },
    });
    deps.smokeReadBack = async () => ({
      ok: true,
      output: { exists: true, fields: { "Draft Image": [] } },
      reason: null,
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: { resourceKey: "r", idPath: "recordId", kind: "record" },
      cleanupKind: "delete",
      cleanup: { provider: "acme", action: "delete_record", config: { recordId: "{{ledger.r.id}}" } },
      verify: {
        provider: "acme",
        action: "record",
        config: { recordId: "{{ledger.r.id}}" },
        expectNonEmptyArray: { path: "fields.{{env.ATT_FIELD}}", elementHasKey: "id" },
        smokeRead: true,
      },
    });
    const res = await runWriteSmoke(
      fixture("add_attachment", spec),
      { ...RUN, envLookup: (n) => (n === "ATT_FIELD" ? "Draft Image" : undefined) },
      deps,
    );
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_record")).toBe(true); // cleanup still runs
  });
});

// ─── executeIsCleanup — the action under test removes the ledger resource ─────

describe("executeIsCleanup (delete-as-execute disposition)", () => {
  // setup creates a record; the EXECUTE (delete) IS the cleanup; verify proves gone.
  function deleteSpec(over: Partial<WriteHarnessSpec> = {}): WriteHarnessSpec {
    return {
      liveClass: "destructiveSafe",
      smokeMarker: "crsmoke-",
      setup: [
        {
          provider: "acme",
          action: "create_record",
          config: { name: "{{smokeMarker}}seed" },
          captureResource: { resourceKey: "record", idPath: "id", kind: "record" },
        },
      ],
      executeIsCleanup: true,
      ...over,
    };
  }

  it("marks the ledger resource cleaned + artifact 'cleaned' when the delete succeeds", async () => {
    const deps = fakeDeps({
      "acme:create_record": { ok: true, output: { id: "R1" }, reason: null },
      "acme:delete_record": { ok: true, output: { id: "R1", deleted: true }, reason: null },
    });
    deps.smokeReadBack = async () => ({ ok: true, output: { exists: false }, reason: null });
    const spec = deleteSpec({
      verify: {
        provider: "acme",
        action: "record",
        config: { id: "{{ledger.record.id}}" },
        expectEquals: { path: "exists", value: false },
        smokeRead: true,
      },
    });
    const res = await runWriteSmoke(
      { provider: "acme", action: "delete_record", risk: "write", config: { id: "{{ledger.record.id}}" }, expect: { outcome: "success" }, writeHarness: spec },
      RUN,
      deps,
    );
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned"); // gone, not "left"
    expect(res.ledger.leaked).toBe(0);
    expect(res.ledger.cleaned).toBe(res.ledger.created);
    expect(res.reason).toMatch(/removed by the action under test/);
  });

  it("does NOT mark cleaned when the delete (execute) fails — honest leak", async () => {
    const deps = fakeDeps({
      "acme:create_record": { ok: true, output: { id: "R1" }, reason: null },
      "acme:delete_record": { ok: false, output: null, reason: "boom" },
    });
    const spec = deleteSpec();
    const res = await runWriteSmoke(
      { provider: "acme", action: "delete_record", risk: "write", config: { id: "{{ledger.record.id}}" }, expect: { outcome: "success" }, writeHarness: spec },
      RUN,
      deps,
    );
    expect(res.status).toBe("FAIL");
    expect(res.artifact).toBe("left"); // delete failed -> record genuinely remains
    expect(res.ledger.leaked).toBe(1);
  });

  it("VERIFY failure (record still present) does not certify, even via executeIsCleanup", async () => {
    const deps = fakeDeps({
      "acme:create_record": { ok: true, output: { id: "R1" }, reason: null },
      "acme:delete_record": { ok: true, output: { id: "R1", deleted: true }, reason: null },
    });
    // independent read-back says the record still EXISTS -> verify must fail
    deps.smokeReadBack = async () => ({ ok: true, output: { exists: true }, reason: null });
    const spec = deleteSpec({
      verify: {
        provider: "acme",
        action: "record",
        config: { id: "{{ledger.record.id}}" },
        expectEquals: { path: "exists", value: false },
        smokeRead: true,
      },
    });
    const res = await runWriteSmoke(
      { provider: "acme", action: "delete_record", risk: "write", config: { id: "{{ledger.record.id}}" }, expect: { outcome: "success" }, writeHarness: spec },
      RUN,
      deps,
    );
    expect(res.status).toBe("VERIFY_FAILED");
  });
});

// ─── cleanupKind + artifact disposition (cleaned vs left) ────────────────────

describe("cleanupKind + artifact disposition", () => {
  const captured = { resourceKey: "r", idPath: "id", kind: "thing" } as const;

  it("delete cleanup success -> artifact 'cleaned', PASS", async () => {
    const deps = fakeDeps({ "acme:run_action": { ok: true, output: { id: "X" }, reason: null } });
    const spec = destructiveSpec({ setup: undefined, captureResource: captured, cleanupKind: "delete" });
    const res = await runWriteSmoke(fixture("run_action", spec), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
  });

  it("archive cleanup success -> artifact 'archived', PASS (object persists)", async () => {
    const deps = fakeDeps({ "acme:run_action": { ok: true, output: { id: "X" }, reason: null } });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: captured,
      cleanupKind: "archive",
      cleanup: { provider: "acme", action: "archive_thing", config: { id: "{{ledger.r.id}}" } },
    });
    const res = await runWriteSmoke(fixture("run_action", spec), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("archived");
  });

  it("archive cleanup FAILURE -> artifact 'left', still PASS (best-effort, not CLEANUP_FAILED)", async () => {
    const deps = fakeDeps({
      "acme:run_action": { ok: true, output: { id: "X" }, reason: null },
      "acme:archive_thing": { ok: false, output: null, reason: "archive failed" },
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: captured,
      cleanupKind: "archive",
      cleanup: { provider: "acme", action: "archive_thing", config: { id: "{{ledger.r.id}}" } },
    });
    const res = await runWriteSmoke(fixture("run_action", spec), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("left");
  });

  it("delete cleanup FAILURE -> CLEANUP_FAILED (required), artifact 'left'", async () => {
    const deps = fakeDeps({
      "acme:run_action": { ok: true, output: { id: "X" }, reason: null },
      "acme:delete_thing": { ok: false, output: null, reason: "del failed" },
    });
    const spec = destructiveSpec({ setup: undefined, captureResource: captured, cleanupKind: "delete" });
    const res = await runWriteSmoke(fixture("run_action", spec), RUN, deps);
    expect(res.status).toBe("CLEANUP_FAILED");
    expect(res.artifact).toBe("left");
  });

  it("no cleanup action -> artifact 'left' when something was created (NOT a leak)", async () => {
    const deps = fakeDeps({ "acme:create_thing": { ok: true, output: { id: "X" }, reason: null } });
    const spec: WriteHarnessSpec = { liveClass: "writeSafe", smokeMarker: "crsmoke-", captureResource: captured };
    const res = await runWriteSmoke(fixture("create_thing", spec), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("left");
  });

  it("update-flow: setup creates, execute updates, cleanup deletes -> PASS cleaned", async () => {
    const deps = fakeDeps({
      "acme:setup_create": { ok: true, output: { id: "X" }, reason: null },
      "acme:update_thing": { ok: true, output: { id: "X", name: "crsmoke-T1-updated" }, reason: null },
      "acme:delete_thing": { ok: true, output: null, reason: null },
    });
    const spec = destructiveSpec({ markerEchoPath: "name", cleanupKind: "delete" });
    const res = await runWriteSmoke(fixture("update_thing", spec), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(deps.calls.map((c) => c.action)).toEqual(["setup_create", "update_thing", "delete_thing"]);
  });
});

// ─── multi-resource capture + verifyEach / cleanupEach fan-out ────────────────

describe("multi-resource fixtures (idsPath capture, verifyEach, cleanupEach)", () => {
  const multiCapture = { resourceKey: "record", idsPath: "records", idField: "id", kind: "record" } as const;

  /** Deps with a scripted runActionStep + a scripted per-recordId smokeReadBack. */
  function multiDeps(
    plan: Record<string, StepRunOutcome>,
    readByRecordId: Record<string, StepRunOutcome>,
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
        const id = String(input.config.recordId);
        return readByRecordId[id] ?? { ok: false, output: null, reason: `no read-back for ${id}` };
      },
    };
  }

  const createSpec = (over: Partial<WriteHarnessSpec> = {}): WriteHarnessSpec => ({
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: multiCapture,
    verifyEach: {
      provider: "acme",
      action: "record",
      config: { recordId: "{{each.id}}" },
      markerPath: "fields",
      smokeRead: true,
    },
    cleanupKind: "delete",
    cleanupEach: { provider: "acme", action: "delete_record", config: { recordId: "{{each.id}}" } },
    ...over,
  });

  it("captures every id from idsPath, verifies each, cleans each -> PASS cleaned", async () => {
    const deps = multiDeps(
      {
        "acme:create_multi": { ok: true, output: { records: [{ id: "R0" }, { id: "R1" }] }, reason: null },
        "acme:delete_record": { ok: true, output: null, reason: null },
      },
      {
        R0: { ok: true, output: { exists: true, fields: { Name: "crsmoke-T1-a" } }, reason: null },
        R1: { ok: true, output: { exists: true, fields: { Name: "crsmoke-T1-b" } }, reason: null },
      },
    );
    const res = await runWriteSmoke(fixture("create_multi", createSpec(), { records: [] }), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(2);
    expect(res.ledger.cleaned).toBe(2);
    expect(res.ledger.leaked).toBe(0);
    // verifyEach + cleanupEach each ran once per captured id
    expect(deps.calls.filter((c) => c.action === "record")).toHaveLength(2);
    expect(deps.calls.filter((c) => c.action === "delete_record")).toHaveLength(2);
    // {{each.id}} bound to each captured id
    expect(deps.calls.filter((c) => c.action === "delete_record").map((c) => c.config.recordId).sort()).toEqual(["R0", "R1"]);
  });

  it("VERIFY_FAILED when ANY record's independent read-back lacks the marker (cleanup still runs)", async () => {
    const deps = multiDeps(
      {
        "acme:create_multi": { ok: true, output: { records: [{ id: "R0" }, { id: "R1" }] }, reason: null },
        "acme:delete_record": { ok: true, output: null, reason: null },
      },
      {
        R0: { ok: true, output: { exists: true, fields: { Name: "crsmoke-T1-a" } }, reason: null },
        R1: { ok: true, output: { exists: true, fields: { Name: "someone-else" } }, reason: null }, // no marker
      },
    );
    const res = await runWriteSmoke(fixture("create_multi", createSpec(), { records: [] }), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    // every created record is still cleaned up despite the verify failure
    expect(deps.calls.filter((c) => c.action === "delete_record")).toHaveLength(2);
    expect(res.ledger.leaked).toBe(0);
  });

  it("PARTIAL cleanup failure is NEVER PASS_CLEANED -> CLEANUP_FAILED, leaked honest", async () => {
    let deleteCalls = 0;
    const calls: RecordingDeps["calls"] = [];
    const deps: RecordingDeps = {
      calls,
      async runActionStep(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        if (input.action === "create_multi") {
          return { ok: true, output: { records: [{ id: "R0" }, { id: "R1" }] }, reason: null };
        }
        if (input.action === "delete_record") {
          deleteCalls += 1;
          // first delete (R0) succeeds, second (R1) fails
          return deleteCalls === 1
            ? { ok: true, output: null, reason: null }
            : { ok: false, output: null, reason: "delete failed" };
        }
        return { ok: true, output: null, reason: null };
      },
      async smokeReadBack(input) {
        calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
        return { ok: true, output: { exists: true, fields: { Name: "crsmoke-T1-x" } }, reason: null };
      },
    };
    const res = await runWriteSmoke(fixture("create_multi", createSpec(), { records: [] }), RUN, deps);
    expect(res.status).toBe("CLEANUP_FAILED");
    expect(res.ledger.created).toBe(2);
    expect(res.ledger.cleaned).toBe(1); // only R0 cleaned
    expect(res.ledger.leaked).toBe(1); // R1 left
    expect(foldToSmokeResult(fixture("create_multi", createSpec(), { records: [] }), res).outcome).toBe("fail");
  });

  it("markerSuffix proves the UPDATED value (a seed-only read-back fails)", async () => {
    const spec = createSpec({
      setup: [
        {
          provider: "acme",
          action: "create_multi",
          config: { records: [] },
          captureResource: multiCapture,
        },
      ],
      verifyEach: {
        provider: "acme",
        action: "record",
        config: { recordId: "{{each.id}}" },
        markerPath: "fields",
        markerSuffix: "updated",
        smokeRead: true,
      },
    });
    // execute = update_multi; read-back still shows the SEED value (update didn't land)
    const deps = multiDeps(
      {
        "acme:create_multi": { ok: true, output: { records: [{ id: "R0" }, { id: "R1" }] }, reason: null },
        "acme:update_multi": { ok: true, output: null, reason: null },
        "acme:delete_record": { ok: true, output: null, reason: null },
      },
      {
        R0: { ok: true, output: { exists: true, fields: { Name: "crsmoke-T1-seedA" } }, reason: null },
        R1: { ok: true, output: { exists: true, fields: { Name: "crsmoke-T1-seedB" } }, reason: null },
      },
    );
    const res = await runWriteSmoke(fixture("update_multi", spec, { records: [] }), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED"); // markerSuffix "updated" not present
  });

  it("markerSuffix passes when the read-back carries the updated value", async () => {
    const spec = createSpec({
      setup: [{ provider: "acme", action: "create_multi", config: { records: [] }, captureResource: multiCapture }],
      verifyEach: {
        provider: "acme",
        action: "record",
        config: { recordId: "{{each.id}}" },
        markerPath: "fields",
        markerSuffix: "updated",
        smokeRead: true,
      },
    });
    const deps = multiDeps(
      {
        "acme:create_multi": { ok: true, output: { records: [{ id: "R0" }, { id: "R1" }] }, reason: null },
        "acme:update_multi": { ok: true, output: null, reason: null },
        "acme:delete_record": { ok: true, output: null, reason: null },
      },
      {
        R0: { ok: true, output: { exists: true, fields: { Name: "crsmoke-T1-updated" } }, reason: null },
        R1: { ok: true, output: { exists: true, fields: { Name: "crsmoke-T1-updated" } }, reason: null },
      },
    );
    const res = await runWriteSmoke(fixture("update_multi", spec, { records: [] }), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.ledger.created).toBe(2);
    expect(res.ledger.cleaned).toBe(2);
  });

  it("does NOT disturb single-id idPath capture (regression)", async () => {
    const deps = fakeDeps({
      "acme:run_action": { ok: true, output: { id: "X" }, reason: null },
      "acme:delete_thing": { ok: true, output: null, reason: null },
    });
    const spec = destructiveSpec({
      setup: undefined,
      captureResource: { resourceKey: "r", idPath: "id", kind: "thing" },
      cleanupKind: "delete",
    });
    const res = await runWriteSmoke(fixture("run_action", spec), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.ledger.created).toBe(1);
    expect(res.artifact).toBe("cleaned");
  });
});

// ─── verify assertion values resolve {{ledger.*}} (move_file parents check) ───

describe("verify assertions resolve {{ledger.*}} in expected values", () => {
  function moveSpec(): WriteHarnessSpec {
    return {
      liveClass: "destructiveSafe",
      smokeMarker: "crsmoke-",
      setup: [
        {
          provider: "gdrive",
          action: "create_folder",
          config: { name: "{{smokeMarker}}target" },
          captureResource: { resourceKey: "target", idPath: "folderId", kind: "folder" },
        },
        {
          provider: "gdrive",
          action: "upload_file",
          config: { filename: "{{smokeMarker}}movable" },
          captureResource: { resourceKey: "movable", idPath: "fileId", kind: "file" },
        },
      ],
      verify: {
        provider: "gdrive",
        action: "get_file_metadata",
        config: { fileId: "{{ledger.movable.id}}" },
        markerPath: "name",
        // expected member is a CAPTURED id, referenced via {{ledger.*}}
        expectContains: { path: "parents", value: "{{ledger.target.id}}" },
      },
      cleanupKind: "delete",
      cleanupEach: { provider: "gdrive", action: "delete_file", config: { fileId: "{{each.id}}", permanent: true } },
    };
  }

  it("PASS when read-back parents contains the captured target id", async () => {
    const deps = fakeDeps({
      "gdrive:create_folder": { ok: true, output: { folderId: "B" }, reason: null },
      "gdrive:upload_file": { ok: true, output: { fileId: "F" }, reason: null },
      "gdrive:move_file": { ok: true, output: { fileId: "F", parents: ["B"] }, reason: null },
      // independent read-back: marker on name + parents now contains target B
      "gdrive:get_file_metadata": { ok: true, output: { name: "crsmoke-T1-movable", parents: ["B"] }, reason: null },
      "gdrive:delete_file": { ok: true, output: null, reason: null },
    });
    const res = await runWriteSmoke(fixture("move_file", moveSpec()), RUN, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(2); // target + movable
    expect(res.ledger.cleaned).toBe(2); // cleanupEach deletes both
    expect(res.phases.some((p) => /contains the expected member/.test(p.reason ?? ""))).toBe(true);
  });

  it("VERIFY_FAILED when read-back parents lacks the captured target id (move didn't land)", async () => {
    const deps = fakeDeps({
      "gdrive:create_folder": { ok: true, output: { folderId: "B" }, reason: null },
      "gdrive:upload_file": { ok: true, output: { fileId: "F" }, reason: null },
      "gdrive:move_file": { ok: true, output: { fileId: "F" }, reason: null },
      // parents still the original root, NOT the target -> assertion fails
      "gdrive:get_file_metadata": { ok: true, output: { name: "crsmoke-T1-movable", parents: ["root"] }, reason: null },
      "gdrive:delete_file": { ok: true, output: null, reason: null },
    });
    const res = await runWriteSmoke(fixture("move_file", moveSpec()), RUN, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    // both smoke resources still cleaned up despite the verify failure
    expect(res.ledger.cleaned).toBe(2);
  });
});

// ─── cross-provider cleanup guard (crossProviderCleanup) ─────────────────────

describe("cross-provider cleanup must be explicitly declared", () => {
  // A create whose cleanup runs against a DIFFERENT provider (e.g. a Google Doc
  // deleted via google-drive:delete_file). fixture.provider = "acme".
  function crossSpec(over: Partial<WriteHarnessSpec> = {}): WriteHarnessSpec {
    return {
      liveClass: "destructiveSafe",
      smokeMarker: "crsmoke-",
      captureResource: { resourceKey: "doc", idPath: "id", kind: "document" },
      cleanupKind: "delete",
      cleanup: { provider: "other", action: "delete_file", config: { fileId: "{{ledger.doc.id}}" } },
      ...over,
    };
  }

  it("REFUSES a cross-provider cleanup when crossProviderCleanup is not set (never runs the delete)", async () => {
    const deps = fakeDeps({
      "acme:create_thing": { ok: true, output: { id: "D1" }, reason: null },
      "other:delete_file": { ok: true, output: null, reason: null },
    });
    const res = await runWriteSmoke(fixture("create_thing", crossSpec()), RUN, deps);
    expect(res.status).toBe("CLEANUP_FAILED");
    expect(res.phases.find((p) => p.phase === "cleanup")?.reason).toMatch(/cross-provider cleanup not declared/i);
    expect(deps.calls.some((c) => c.action === "delete_file")).toBe(false); // never dispatched
    expect(res.ledger.leaked).toBe(1); // honest: nothing was cleaned
  });

  it("ALLOWS a cross-provider cleanup when crossProviderCleanup is true (PASS, cleaned)", async () => {
    const deps = fakeDeps({
      "acme:create_thing": { ok: true, output: { id: "D1" }, reason: null },
      "other:delete_file": { ok: true, output: null, reason: null },
    });
    const res = await runWriteSmoke(
      fixture("create_thing", crossSpec({ crossProviderCleanup: true })),
      RUN,
      deps,
    );
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(deps.calls.find((c) => c.action === "delete_file")?.provider).toBe("other");
    expect(res.ledger.leaked).toBe(0);
  });

  it("a SAME-provider cleanup is unaffected by the guard (no flag needed)", async () => {
    const deps = fakeDeps({
      "acme:create_thing": { ok: true, output: { id: "D1" }, reason: null },
      "acme:delete_file": { ok: true, output: null, reason: null },
    });
    const res = await runWriteSmoke(
      fixture("create_thing", crossSpec({ cleanup: { provider: "acme", action: "delete_file", config: { fileId: "{{ledger.doc.id}}" } } })),
      RUN,
      deps,
    );
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
  });

  it("REFUSES cross-provider cleanupEach when the flag is unset", async () => {
    const deps = fakeDeps({
      "acme:create_thing": { ok: true, output: { id: "D1" }, reason: null },
      "other:delete_file": { ok: true, output: null, reason: null },
    });
    const spec = crossSpec({
      cleanup: undefined,
      cleanupEach: { provider: "other", action: "delete_file", config: { fileId: "{{each.id}}" } },
    });
    const res = await runWriteSmoke(fixture("create_thing", spec), RUN, deps);
    expect(res.status).toBe("CLEANUP_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_file")).toBe(false);
    expect(res.ledger.leaked).toBe(1);
  });
});
