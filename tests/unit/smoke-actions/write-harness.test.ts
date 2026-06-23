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
  runWriteSmoke,
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
