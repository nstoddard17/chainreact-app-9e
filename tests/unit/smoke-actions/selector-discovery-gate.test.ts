/**
 * @jest-environment node
 *
 * Tier-1 selector auto-discovery — the LIVE gating path in runFixtureWorkflowMode.
 *
 * Fake DB/engine + fake connection/discovery seams (no real provider). Pins:
 *   - not connected in app → SKIP (state "not-connected"), no workflow created;
 *   - connected + auto-discovered selector → runs, config overlaid, state
 *     "discovered";
 *   - connected, auto-discovery unavailable → SKIP (state "unavailable"), no run;
 *   - a manual env selector OVERRIDES discovery (and the connection env overrides
 *     the DB check);
 *   - when the discovery seams are ABSENT, the legacy env-gating path is intact.
 */
import { defineActionSmokeFixture, type ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import {
  runFixtureWorkflowMode,
  type SmokeManualRunWorkflow,
  type WorkflowRunDeps,
} from "@/tests/smoke-actions/workflowRun";
import type { DiscoverSelectorsResult } from "@/tests/smoke-actions/selectorDiscovery";

const fixture = (over: Partial<ActionSmokeFixture> = {}): ActionSmokeFixture =>
  defineActionSmokeFixture({
    provider: "monday",
    action: "get_board",
    risk: "read",
    liveSafe: true,
    liveRisk: "read",
    config: {},
    configFromEnv: { boardId: "SMOKE_MONDAY_BOARD_ID" },
    requiredEnv: ["SMOKE_MONDAY_CONNECTED", "SMOKE_MONDAY_BOARD_ID"],
    expect: { outcome: "success" },
    ...over,
  });

function fakeDeps(opts: {
  connected?: boolean;
  discover?: DiscoverSelectorsResult;
  withDiscoverySeams?: boolean;
}) {
  const create = jest.fn<Promise<{ workflowId: string }>, [SmokeManualRunWorkflow]>(
    async () => ({ workflowId: "wf-1" }),
  );
  const base: WorkflowRunDeps = {
    createSmokeWorkflow: create,
    runManualAndAwait: jest.fn(async () => ({ runId: "run-1" })),
    readRun: jest.fn(async () => ({ runId: "run-1", status: "succeeded" as const, failureReason: null })),
    cleanupSmokeWorkflow: jest.fn(async () => {}),
  };
  if (opts.withDiscoverySeams !== false) {
    base.isProviderConnected = jest.fn(async (_provider: string) => opts.connected ?? false);
    base.discoverSelectors = jest.fn(
      async (_input: {
        provider: string;
        action: string;
        presentFields: Readonly<Record<string, unknown>>;
      }): Promise<DiscoverSelectorsResult> =>
        opts.discover ?? { ok: true, overlay: {}, discoveredFields: [] },
    );
  }
  return { deps: base, create };
}

const noEnv = (_: string): string | undefined => undefined;
const envWith = (p: Record<string, string>) => (n: string): string | undefined => p[n];

describe("live discovery gate: connection", () => {
  it("SKIPs (not-connected) without creating a workflow when the provider is not connected", async () => {
    const { deps, create } = fakeDeps({ connected: false });
    const r = await runFixtureWorkflowMode(fixture(), { includeDestructive: false, live: true }, deps, noEnv);
    expect(r.outcome).toBe("skip");
    expect(r.discovery?.state).toBe("not-connected");
    expect(r.reason).toMatch(/not connected in app/);
    expect(create).not.toHaveBeenCalled();
  });

  it("does NOT mark connected providers as not-connected just because selector env is missing", async () => {
    const { deps, create } = fakeDeps({
      connected: true,
      discover: { ok: true, overlay: { boardId: "B1" }, discoveredFields: ["boardId"] },
    });
    const r = await runFixtureWorkflowMode(fixture(), { includeDestructive: false, live: true }, deps, noEnv);
    expect(r.outcome).toBe("pass");
    expect(r.discovery?.state).toBe("discovered");
    expect(r.discovery?.fields).toEqual(["boardId"]);
    // The auto-discovered selector was overlaid onto the action config.
    const wf = create.mock.calls[0]?.[0] as SmokeManualRunWorkflow;
    const action = wf.definition.nodes.find((n) => n.kind === "action");
    expect(action?.config.boardId).toBe("B1");
  });
});

describe("live discovery gate: discovery outcomes", () => {
  it("SKIPs (unavailable) when a selector has no safe auto-discovery, no workflow created", async () => {
    const { deps, create } = fakeDeps({
      connected: true,
      discover: { ok: false, state: "unavailable", blockedField: "boardId" },
    });
    const r = await runFixtureWorkflowMode(fixture(), { includeDestructive: false, live: true }, deps, noEnv);
    expect(r.outcome).toBe("skip");
    expect(r.discovery?.state).toBe("unavailable");
    expect(r.reason).toMatch(/no safe auto-discovery/);
    expect(create).not.toHaveBeenCalled();
  });

  it("SKIPs (empty) when auto-discovery returns no usable object", async () => {
    const { deps } = fakeDeps({
      connected: true,
      discover: { ok: false, state: "empty", blockedField: "boardId" },
    });
    const r = await runFixtureWorkflowMode(fixture(), { includeDestructive: false, live: true }, deps, noEnv);
    expect(r.outcome).toBe("skip");
    expect(r.discovery?.state).toBe("empty");
  });
});

describe("live discovery gate: manual env overrides", () => {
  it("a present selector env OVERRIDES discovery (discovery not consulted for it)", async () => {
    const { deps, create } = fakeDeps({ connected: true });
    const r = await runFixtureWorkflowMode(
      fixture(),
      { includeDestructive: false, live: true },
      deps,
      envWith({ SMOKE_MONDAY_CONNECTED: "1", SMOKE_MONDAY_BOARD_ID: "ENVBOARD" }),
    );
    expect(r.outcome).toBe("pass");
    // discoverSelectors is still called (other fields could need it) but the
    // pinned field is passed as present, so the env value is what lands on config.
    const wf = create.mock.calls[0]?.[0] as SmokeManualRunWorkflow;
    const action = wf.definition.nodes.find((n) => n.kind === "action");
    expect(action?.config.boardId).toBe("ENVBOARD");
    expect((deps.discoverSelectors as jest.Mock).mock.calls[0][0].presentFields.boardId).toBe("ENVBOARD");
  });

  it("a present connection env counts as connected even if the DB check would say no", async () => {
    const { deps } = fakeDeps({ connected: false });
    const r = await runFixtureWorkflowMode(
      fixture(),
      { includeDestructive: false, live: true },
      deps,
      envWith({ SMOKE_MONDAY_CONNECTED: "1", SMOKE_MONDAY_BOARD_ID: "ENVBOARD" }),
    );
    expect(r.outcome).toBe("pass");
    // The DB connection check is bypassed by the explicit env override.
    expect(deps.isProviderConnected as jest.Mock).not.toHaveBeenCalled();
  });
});

describe("live discovery gate: legacy fallback (no discovery seams)", () => {
  it("falls back to env-gating SKIP when the deps don't provide discovery", async () => {
    const { deps, create } = fakeDeps({ withDiscoverySeams: false });
    const r = await runFixtureWorkflowMode(fixture(), { includeDestructive: false, live: true }, deps, noEnv);
    expect(r.outcome).toBe("skip");
    expect(r.reason).toMatch(/missing env: SMOKE_MONDAY_CONNECTED/);
    expect(r.discovery).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });
});
