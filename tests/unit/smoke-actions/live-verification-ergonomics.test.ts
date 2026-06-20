/**
 * @jest-environment node
 *
 * Action smoke harness — live-verification ergonomics (SMOKE-ACTIONS-LIVE-ERGO).
 *
 * Covers the small CLI/reporting slice that makes the existing live fixtures
 * practical to verify per-provider:
 *   - provider filter narrows workflow-LIVE mode to one provider, and no filter
 *     preserves the all-fixtures behavior;
 *   - the report carries a grouped missing-env summary (env NAMES only, never
 *     values), additive in JSON;
 *   - the write gate + destructive gate are unchanged, and gate-skipped fixtures
 *     do NOT appear in the missing-env summary (only env-skipped ones do).
 *
 * The DB/engine boundary is faked; the rule under test is the harness
 * orchestration + the pure report shape, not Supabase.
 */
import {
  buildExecutionReport,
  distinctMissingEnv,
  renderExecutionHuman,
  renderExecutionJson,
  type SmokeResult,
} from "@/scripts/chainreact/smoke/core";
import { defineActionSmokeFixture, type ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { runActionSmokeWorkflowMode } from "@/tests/smoke-actions/harness";
import type { SmokePersistedRun, WorkflowRunDeps } from "@/tests/smoke-actions/workflowRun";

function fakeDeps(run: SmokePersistedRun = { runId: "run-1", status: "succeeded", failureReason: null }) {
  const create = jest.fn(async () => ({ workflowId: "wf-1" }));
  const deps: WorkflowRunDeps = {
    createSmokeWorkflow: create,
    runManualAndAwait: jest.fn(async () => ({ runId: "run-1" })),
    readRun: jest.fn(async () => run),
    cleanupSmokeWorkflow: jest.fn(async () => {}),
  };
  return { deps, create };
}

const liveRead = (provider: string, action: string, requiredEnv: string[] = []): ActionSmokeFixture =>
  defineActionSmokeFixture({
    provider,
    action,
    risk: "read",
    liveSafe: true,
    liveRisk: "read",
    config: { content: "x", targetFormat: "plain" },
    requiredEnv,
    expect: { outcome: "success" },
  });

const noEnv = (_: string): string | undefined => undefined;

describe("workflow-live provider filter", () => {
  it("runs ONLY the selected provider's fixtures and tags them live", async () => {
    const { deps } = fakeDeps();
    const fixtures = [
      liveRead("native", "format_transformer"),
      liveRead("gmail", "list_labels"),
      liveRead("google-drive", "list_files"),
    ];

    const report = await runActionSmokeWorkflowMode(
      fixtures,
      { live: true, providerFilter: "gmail", allowWrite: false },
      deps,
      // env present so the selected fixture actually "runs" (fake deps → pass)
      () => "set",
    );

    expect(report.mode).toBe("workflow-live");
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.provider).toBe("gmail");
    expect(report.results.every((r) => r.providerBoundary === "live")).toBe(true);
  });

  it("runs ALL fixtures (existing behavior) when no provider filter is set", async () => {
    const { deps } = fakeDeps();
    const fixtures = [liveRead("native", "format_transformer"), liveRead("gmail", "list_labels")];

    const report = await runActionSmokeWorkflowMode(
      fixtures,
      { live: true, providerFilter: null },
      deps,
      () => "set",
    );

    expect(report.results).toHaveLength(2);
    expect(report.results.map((r) => r.provider).sort()).toEqual(["gmail", "native"]);
  });
});

describe("missing-env summary", () => {
  it("groups env-skipped fixtures by fixture with env NAMES only (no values)", async () => {
    const { deps, create } = fakeDeps();
    const fixtures = [
      liveRead("gmail", "list_labels", ["SMOKE_GMAIL_CONNECTED"]),
      liveRead("google-drive", "search_files", ["SMOKE_GOOGLE_DRIVE_CONNECTED", "SMOKE_GDRIVE_QUERY"]),
    ];

    // No env set → both SKIP before any workflow is created.
    const report = await runActionSmokeWorkflowMode(fixtures, { live: true }, deps, noEnv);

    expect(create).not.toHaveBeenCalled();
    expect(report.totals.skip).toBe(2);
    expect(report.missingEnv).toEqual([
      { provider: "gmail", action: "list_labels", env: ["SMOKE_GMAIL_CONNECTED"] },
      {
        provider: "google-drive",
        action: "search_files",
        env: ["SMOKE_GOOGLE_DRIVE_CONNECTED", "SMOKE_GDRIVE_QUERY"],
      },
    ]);
    expect(distinctMissingEnv(report)).toEqual([
      "SMOKE_GDRIVE_QUERY",
      "SMOKE_GMAIL_CONNECTED",
      "SMOKE_GOOGLE_DRIVE_CONNECTED",
    ]);
  });

  it("human report lists env NAMES and never a secret value", async () => {
    // Build a report directly so we can prove a value present in env never
    // appears in the rendered output (only the NAME does).
    const results: SmokeResult[] = [
      {
        provider: "gmail",
        action: "list_labels",
        risk: "read",
        outcome: "skip",
        reason: "missing env: SMOKE_GMAIL_CONNECTED",
        runId: null,
        workflowId: null,
        missingEnv: ["SMOKE_GMAIL_CONNECTED"],
      },
    ];
    const report = buildExecutionReport(results, "workflow-live");
    const human = renderExecutionHuman(report);

    expect(human).toContain("Missing env");
    expect(human).toContain("gmail:list_labels — SMOKE_GMAIL_CONNECTED");
    expect(human).toContain("Set: SMOKE_GMAIL_CONNECTED");
    // The env NAME is printed; no value is (the summary only ever holds names).
    expect(human).not.toContain("super-secret-token");
  });

  it("JSON output is additive — existing keys intact + new missingEnv key", async () => {
    const results: SmokeResult[] = [
      {
        provider: "gmail",
        action: "list_labels",
        risk: "read",
        outcome: "skip",
        reason: "missing env: SMOKE_GMAIL_CONNECTED",
        runId: null,
        missingEnv: ["SMOKE_GMAIL_CONNECTED"],
      },
    ];
    const json = JSON.parse(renderExecutionJson(buildExecutionReport(results, "workflow-live")));
    // Existing/stable keys still present.
    expect(json.kind).toBe("execution");
    expect(json.mode).toBe("workflow-live");
    expect(json).toHaveProperty("ok");
    expect(json).toHaveProperty("totals");
    expect(json).toHaveProperty("perProvider");
    expect(json).toHaveProperty("results");
    // Additive key.
    expect(json.missingEnv).toEqual([
      { provider: "gmail", action: "list_labels", env: ["SMOKE_GMAIL_CONNECTED"] },
    ]);
  });

  it("is empty when nothing skipped on the env path (passes/runs only)", async () => {
    const { deps } = fakeDeps();
    const report = await runActionSmokeWorkflowMode(
      [liveRead("native", "format_transformer")],
      { live: true },
      deps,
      () => "set",
    );
    expect(report.missingEnv).toEqual([]);
    expect(renderExecutionHuman(report)).not.toContain("Missing env");
  });
});

describe("gates unchanged — gate-skipped fixtures are NOT in the missing-env summary", () => {
  it("a live write fixture without the write gate SKIPs and is absent from missingEnv", async () => {
    const { deps, create } = fakeDeps();
    const writeFixture = defineActionSmokeFixture({
      provider: "slack",
      action: "send_channel_message",
      risk: "write",
      liveSafe: true,
      liveRisk: "write",
      config: {},
      requiredEnv: ["SMOKE_SLACK_CONNECTED"],
      expect: { outcome: "success" },
    });

    // Write gate off → SKIP at the write gate, BEFORE the env check.
    const report = await runActionSmokeWorkflowMode(
      [writeFixture],
      { live: true, allowWrite: false },
      deps,
      () => "set",
    );

    expect(create).not.toHaveBeenCalled();
    expect(report.totals.skip).toBe(1);
    expect(report.results[0]?.reason).toMatch(/write — needs ALLOW_LIVE_PROVIDER_WRITE_SMOKE/);
    // Gate skip, not env skip → not surfaced as a missing-env entry.
    expect(report.missingEnv).toEqual([]);
  });

  it("a destructive fixture stays non-liveSafe-blocked and absent from missingEnv", async () => {
    const { deps } = fakeDeps();
    const destructive = defineActionSmokeFixture({
      provider: "slack",
      action: "delete_message",
      risk: "destructive",
      // not liveSafe — must never run live
      config: {},
      expect: { outcome: "success" },
    });
    const report = await runActionSmokeWorkflowMode(
      [destructive],
      { live: true, includeDestructive: true, allowDestructive: true },
      deps,
      () => "set",
    );
    expect(report.results[0]?.outcome).toBe("skip");
    expect(report.missingEnv).toEqual([]);
  });
});
