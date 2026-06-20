/**
 * @jest-environment node
 *
 * Action smoke harness — execution outcomes (pass / fail / skip).
 *
 * The provider boundary is faked (per testing-strategy: mock ONLY the external
 * boundary), but the rule under test — strict pre-resolution + classify-vs-
 * expectation + the destructive/env gates — runs for real. The resolver is the
 * REAL resolveStrict, so the missing-variable path is genuinely exercised, not
 * stubbed.
 */
import type {
  ActionHandler,
  ActionHandlerInput,
  ActionHandlerResult,
} from "@/services/execution/handlers/types";
import { resolveStrict } from "@/workflow-engine/variables/resolveValue";
import { defineActionSmokeFixture, type ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { runActionSmoke } from "@/tests/smoke-actions/harness";
import { runFixture, type SmokeHarnessDeps } from "@/tests/smoke-actions/runFixture";

const dummyHandler: ActionHandler = async () => ({ output: {} });

function makeDeps(overrides: Partial<SmokeHarnessDeps> = {}): {
  deps: SmokeHarnessDeps;
  invoke: jest.Mock<Promise<ActionHandlerResult>, [ActionHandler, ActionHandlerInput]>;
} {
  const invoke = jest.fn<Promise<ActionHandlerResult>, [ActionHandler, ActionHandlerInput]>(
    async () => ({ output: { ok: true } }),
  );
  const deps: SmokeHarnessDeps = {
    getHandler: () => dummyHandler,
    resolveStrict: (value, context) => resolveStrict(value, context),
    invoke,
    envLookup: () => undefined,
    newRunId: () => "run-fixed",
    ...overrides,
  };
  return { deps, invoke };
}

const readFixture = (over: Partial<ActionSmokeFixture> = {}): ActionSmokeFixture =>
  defineActionSmokeFixture({
    provider: "native",
    action: "format_transformer",
    risk: "read",
    config: { content: "hi" },
    expect: { outcome: "success" },
    ...over,
  });

describe("runFixture: success classification", () => {
  it("PASSes when the action succeeds and success was expected, returning a run id", async () => {
    const { deps, invoke } = makeDeps();
    const result = await runFixture(readFixture(), { includeDestructive: false }, deps);
    expect(result.outcome).toBe("pass");
    expect(result.runId).toBe("run-fixed");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("FAILs (with the error message) when the action throws but success was expected", async () => {
    const { deps } = makeDeps({ invoke: jest.fn(async () => { throw new Error("slack 500"); }) });
    const result = await runFixture(readFixture(), { includeDestructive: false }, deps);
    expect(result.outcome).toBe("fail");
    expect(result.reason).toBe("slack 500");
  });
});

describe("runFixture: expected-failure classification", () => {
  it("PASSes when the action throws the expected error", async () => {
    const { deps } = makeDeps({ invoke: jest.fn(async () => { throw new Error("access denied"); }) });
    const fixture = readFixture({ expect: { outcome: "failure", errorIncludes: "denied" } });
    const result = await runFixture(fixture, { includeDestructive: false }, deps);
    expect(result.outcome).toBe("pass");
  });

  it("FAILs when the thrown error does not match the expected substring", async () => {
    const { deps } = makeDeps({ invoke: jest.fn(async () => { throw new Error("timeout"); }) });
    const fixture = readFixture({ expect: { outcome: "failure", errorIncludes: "denied" } });
    const result = await runFixture(fixture, { includeDestructive: false }, deps);
    expect(result.outcome).toBe("fail");
    expect(result.reason).toMatch(/expected failure containing "denied"/);
  });

  it("FAILs when a failure was expected but the action succeeded", async () => {
    const { deps } = makeDeps();
    const fixture = readFixture({ expect: { outcome: "failure" } });
    const result = await runFixture(fixture, { includeDestructive: false }, deps);
    expect(result.outcome).toBe("fail");
    expect(result.reason).toMatch(/expected a failure/);
  });
});

describe("runFixture: safe-by-default skips", () => {
  it("SKIPs a destructive fixture without includeDestructive and never calls the provider", async () => {
    const { deps, invoke } = makeDeps();
    const fixture = readFixture({ action: "delete_message", risk: "destructive" });
    const result = await runFixture(fixture, { includeDestructive: false }, deps);
    expect(result.outcome).toBe("skip");
    expect(result.reason).toMatch(/destructive/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("RUNs a destructive fixture once includeDestructive is set", async () => {
    const { deps, invoke } = makeDeps();
    const fixture = readFixture({ action: "delete_message", risk: "destructive" });
    const result = await runFixture(fixture, { includeDestructive: true }, deps);
    expect(result.outcome).toBe("pass");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("SKIPs (not FAILs) when required env is missing, and never calls the provider", async () => {
    const { deps, invoke } = makeDeps({ envLookup: () => undefined });
    const fixture = readFixture({ requiredEnv: ["SMOKE_SLACK_CONNECTED"] });
    const result = await runFixture(fixture, { includeDestructive: false }, deps);
    expect(result.outcome).toBe("skip");
    expect(result.reason).toMatch(/missing env: SMOKE_SLACK_CONNECTED/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("RUNs when required env is present", async () => {
    const env: Record<string, string> = { SMOKE_SLACK_CONNECTED: "1" };
    const { deps, invoke } = makeDeps({ envLookup: (n) => env[n] });
    const fixture = readFixture({ requiredEnv: ["SMOKE_SLACK_CONNECTED"] });
    const result = await runFixture(fixture, { includeDestructive: false }, deps);
    expect(result.outcome).toBe("pass");
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe("runFixture: strict variable resolution is enforced before dispatch", () => {
  it("FAILs (handler never invoked) when config references a missing variable", async () => {
    const { deps, invoke } = makeDeps();
    // payload has no `text`; the strict resolver must reject before dispatch.
    const fixture = readFixture({ config: { content: "{{trigger.payload.text}}" } });
    const result = await runFixture(fixture, { includeDestructive: false }, deps);
    expect(result.outcome).toBe("fail");
    expect(result.reason).toMatch(/unresolved variable/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("resolves trigger payload references and dispatches the resolved config", async () => {
    const captured: ActionHandlerInput[] = [];
    const { deps } = makeDeps({
      invoke: jest.fn(async (_h, input) => {
        captured.push(input);
        return { output: {} };
      }),
    });
    const fixture = readFixture({
      config: { content: "{{trigger.payload.text}}" },
      triggerEvent: { payload: { text: "resolved!" } },
    });
    const result = await runFixture(fixture, { includeDestructive: false }, deps);
    expect(result.outcome).toBe("pass");
    expect(captured[0]?.config).toEqual({ content: "resolved!" });
  });
});

describe("runActionSmoke: report aggregation + provider filter", () => {
  it("aggregates pass/fail/skip and gates ok on zero failures", async () => {
    const { deps } = makeDeps();
    const fixtures = [
      readFixture({ provider: "native", action: "format_transformer" }),
      readFixture({ provider: "slack", action: "list_channels", requiredEnv: ["NOPE"] }),
      readFixture({ provider: "slack", action: "delete_message", risk: "destructive" }),
    ];
    const report = await runActionSmoke(fixtures, { includeDestructive: false }, deps);
    expect(report.totals).toEqual({ pass: 1, fail: 0, skip: 2, certifiedSkip: 0 });
    expect(report.ok).toBe(true);
    expect(report.perProvider).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "native", pass: 1 }),
        expect.objectContaining({ provider: "slack", skip: 2 }),
      ]),
    );
  });

  it("runs only the selected provider when providerFilter is set", async () => {
    const { deps, invoke } = makeDeps();
    const fixtures = [
      readFixture({ provider: "native", action: "format_transformer" }),
      readFixture({ provider: "slack", action: "list_channels" }),
    ];
    const report = await runActionSmoke(fixtures, { providerFilter: "native" }, deps);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.provider).toBe("native");
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
