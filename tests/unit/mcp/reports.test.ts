/**
 * @jest-environment node
 *
 * Phase 2D report tools (scripts/mcp/tools/reports.ts):
 *   - generate_diagnostic_report COMPOSES the existing doctors (no new brain/route/DB).
 *   - generate_deploy_readiness_report COMPOSES the existing safe local check tools;
 *     advisory runs nothing, runSafeChecks runs ONLY allow-listed checks, never
 *     pushes/deploys/db/migrates.
 *
 * Live doctor sections are exercised by mocking global `fetch` (same posture as
 * doctors.test.ts). Deploy-readiness execution is exercised via the injectable
 * `buildDeployReadinessReport` deps so we can assert exactly which checks run.
 */
import { scanForLeaks } from "@/scripts/mcp/tools/noLeakScanner";
import { buildDeployReadinessReport, reportTools } from "@/scripts/mcp/tools/reports";
import { buildRegistry } from "@/scripts/mcp/tools";
import { classifyCheckOutput, deriveReadiness } from "@/scripts/mcp/lib/reportShared";

const handler = (name: string) => {
  const t = reportTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t.handler;
};

const originalFetch = global.fetch;
let fetchMock: jest.Mock;
const json = (status: number, body: unknown): Response => ({ status, json: async () => body }) as unknown as Response;
function routeFetch(map: Record<string, Response>): void {
  fetchMock.mockImplementation(async (url: unknown) => {
    const u = String(url);
    for (const [frag, resp] of Object.entries(map)) if (u.includes(frag)) return resp;
    return json(404, { error: "not_found" });
  });
}

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.MCP_DIAGNOSTICS_TOKEN = "mcp-diag-token-0123456789abcdef";
  process.env.MCP_DIAGNOSTICS_URL = "http://127.0.0.1:3000";
});
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.MCP_DIAGNOSTICS_TOKEN;
  delete process.env.MCP_DIAGNOSTICS_URL;
});

// ───────────────────────── generate_diagnostic_report ─────────────────────────

describe("generate_diagnostic_report", () => {
  const report = () => handler("generate_diagnostic_report");

  it("validates 'type' and the per-type required inputs (safe validation errors)", async () => {
    expect(await report()({})).toMatch(/'type' is required/);
    expect(await report()({ type: "nonsense" })).toMatch(/must be one of/);
    expect(await report()({ type: "workflow", userId: "u1" })).toMatch(/'workflowId' is required/);
    expect(await report()({ type: "workflow", workflowId: "wf-1" })).toMatch(/'userId' is required/);
    expect(await report()({ type: "provider" })).toMatch(/'provider' is required/);
    expect(await report()({ type: "accountIntegration", userId: "u1" })).toMatch(/'accountId' is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("workflow report renders Markdown + sources + next steps from the composed doctor", async () => {
    routeFetch({
      "workflow-readiness": json(200, { workflowId: "wf-1", access: "OK", runnable: false, readinessError: "INVALID_WORKFLOW_GRAPH" }),
      "workflow-graph": json(200, { workflowId: "wf-1", access: "OK", structurallyValid: false, nodeCount: 3, edgeCount: 1, findings: [{ kind: "NO_TRIGGER", severity: "error" }] }),
      "workflow-connections": json(200, { workflowId: "wf-1", access: "OK", allRequiredConnected: false, providers: [{ provider: "gmail", name: "Gmail", credentialClass: "account", status: "DISCONNECTED", ready: false, nodeCount: 2 }] }),
    });
    const out = await report()({ type: "workflow", workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("# Diagnostic Report — doctor_workflow");
    expect(out).toContain("**Overall status:** blocked");
    expect(out).toContain("## Summary");
    expect(out).toContain("## Findings by severity");
    expect(out).toContain("## Prioritized next steps");
    expect(out).toContain("Add a trigger to the workflow.");
    expect(out).toContain("## Sources used");
    expect(out).toContain("diagnose_workflow_readiness");
    expect(out).toContain("## Safety note");
    expect(out).toContain("Sanitized internal diagnostic report");
    // structured metadata appendix
    expect(out).toContain('"generatedByTool": "generate_diagnostic_report"');
    expect(out).toContain('"reportType": "workflow"');
  });

  it("provider report composes the static provider doctor (no live call when no account)", async () => {
    const out = await report()({ type: "provider", provider: "slack" });
    expect(out).toContain("# Diagnostic Report — doctor_provider: slack");
    expect(out).toContain("### capability");
    expect(out).toContain("provider_capability_matrix");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accountIntegration report renders a provider-scoped live section", async () => {
    routeFetch({
      "integration-connection": json(200, { ok: true, provider: "slack", accountId: "acct-1", status: "CONNECTED", activeConnectionCount: 1, providerEnabled: true, refreshable: false, credentialClass: "account", tokenExpired: false, scopesSatisfied: true, missingScopeCount: 0 }),
    });
    const out = await report()({ type: "accountIntegration", accountId: "acct-1", userId: "u1", provider: "slack" });
    expect(out).toContain("# Diagnostic Report — doctor_account_integration");
    expect(out).toContain("**Overall status:** healthy");
    expect(out).toContain("connected=1 needsAttention=0");
  });

  it("renders unavailable doctor sections in the unavailable block", async () => {
    routeFetch({
      "workflow-readiness": json(200, { workflowId: "wf-1", access: "OK", runnable: true, readinessError: null }),
      "workflow-graph": json(404, { error: "not_found" }),
      "workflow-connections": json(200, { workflowId: "wf-1", access: "OK", allRequiredConnected: true, providers: [] }),
    });
    const out = await report()({ type: "workflow", workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("## Unavailable / deferred checks");
    expect(out).toContain("**graph**:");
  });

  it("includeUnavailable:false drops the unavailable block; maxFindings caps findings", async () => {
    const findings = Array.from({ length: 20 }, (_, i) => ({ kind: "UNSUPPORTED_NODE", severity: "warning", nodeId: `n${i}`, provider: "x", nodeType: "y" }));
    routeFetch({
      "workflow-readiness": json(200, { workflowId: "wf-1", access: "OK", runnable: true, readinessError: null }),
      "workflow-graph": json(200, { workflowId: "wf-1", access: "OK", structurallyValid: false, nodeCount: 20, edgeCount: 0, findings }),
      "workflow-connections": json(200, { workflowId: "wf-1", access: "OK", allRequiredConnected: true, providers: [] }),
    });
    const out = await report()({ type: "workflow", workflowId: "wf-1", userId: "u1", includeUnavailable: false, maxFindings: 3 });
    expect(out).not.toContain("## Unavailable / deferred checks");
    expect(out).toContain("capped at 3");
  });

  it("does not leak tokens/config/provider payloads in the report body or structured metadata", async () => {
    routeFetch({
      "workflow-readiness": json(200, { workflowId: "wf-1", access: "OK", runnable: true, readinessError: null }),
      "workflow-graph": json(200, { workflowId: "wf-1", access: "OK", structurallyValid: true, nodeCount: 1, edgeCount: 0, findings: [] }),
      "workflow-connections": json(200, { workflowId: "wf-1", access: "OK", allRequiredConnected: true, providers: [{ provider: "slack", name: "Slack", credentialClass: "account", status: "CONNECTED", ready: true, nodeCount: 1 }] }),
    });
    const out = await report()({ type: "workflow", workflowId: "wf-1", userId: "u1" });
    expect(out).not.toMatch(/xox[bp]-|access_token|refresh_token|client_secret|Bearer\s+\w/i);
    // scan the structured metadata JSON block for forbidden leak shapes
    const block = out.match(/```json\n([\s\S]*?)\n```/);
    const jsonText = block?.[1];
    expect(jsonText).toBeDefined();
    const parsed = JSON.parse(jsonText as string);
    expect(scanForLeaks(parsed).passed).toBe(true);
  });
});

// ─────────────────────── generate_deploy_readiness_report ───────────────────────

const okOutput = (name: string): string => {
  if (name === "summarize_last_test_failure") return "No failures in the latest artifact (generatedAt: t; 0 record(s)).";
  if (name === "run_route_structure_tests" || name === "run_provider_metadata_tests") {
    return "check: x\ntarget: y\nresult: PASSED  (exit code 0)";
  }
  return "exit code: 0\n\nok";
};

describe("generate_deploy_readiness_report", () => {
  const stubFiles = () => ({ files: ["services/diagnostics/runReport.ts"], source: "stub" });

  it("advisory mode runs NO checks and recommends the safe gate", async () => {
    const runCheck = jest.fn(async () => "exit code: 0");
    const out = await buildDeployReadinessReport(
      { mode: "advisory", changedPaths: ["app/api/x/route.ts"] },
      { runCheck, getChangedFiles: stubFiles },
    );
    expect(runCheck).not.toHaveBeenCalled();
    expect(out).toContain("**Readiness:** review_needed");
    expect(out).toContain("**Mode:** advisory");
    expect(out).toContain("## Checks run");
    expect(out).toContain("_(none — advisory mode runs no checks)_");
    expect(out).toContain("run_typecheck");
  });

  it("advisory mode uses changedPaths without invoking git", async () => {
    const getChangedFiles = jest.fn(stubFiles);
    await buildDeployReadinessReport({ mode: "advisory", changedPaths: ["app/x.ts"] }, { runCheck: jest.fn(), getChangedFiles });
    expect(getChangedFiles).not.toHaveBeenCalled();
  });

  it("runSafeChecks invokes ONLY allow-listed safe local checks (no broad lint by default)", async () => {
    const runCheck = jest.fn(async (name: string) => okOutput(name));
    const out = await buildDeployReadinessReport(
      { mode: "runSafeChecks", changedPaths: [] },
      { runCheck, getChangedFiles: stubFiles },
    );
    const called = runCheck.mock.calls.map((c) => c[0]);
    expect(called).toEqual([
      "run_typecheck",
      "run_structure_lint",
      "run_migration_lint",
      "run_route_structure_tests",
      "run_provider_metadata_tests",
      "summarize_last_test_failure",
    ]);
    expect(called).not.toContain("run_lint");
    // never an unsafe check
    expect(called).not.toEqual(expect.arrayContaining(["run_lint", "db:push", "deploy"]));
    expect(out).toContain("**Readiness:** ready");
  });

  it("includeBroadLint additionally runs run_lint", async () => {
    const runCheck = jest.fn(async (name: string) => okOutput(name));
    await buildDeployReadinessReport(
      { mode: "runSafeChecks", includeBroadLint: true, changedPaths: [] },
      { runCheck, getChangedFiles: stubFiles },
    );
    expect(runCheck.mock.calls.map((c) => c[0])).toContain("run_lint");
  });

  it("a failed check → blocked with the blocker listed", async () => {
    const runCheck = jest.fn(async (name: string) => (name === "run_typecheck" ? "exit code: 1\n\nTS2322 error" : okOutput(name)));
    const out = await buildDeployReadinessReport({ mode: "runSafeChecks", changedPaths: [] }, { runCheck, getChangedFiles: stubFiles });
    expect(out).toContain("**Readiness:** blocked");
    expect(out).toContain("## Blockers");
    expect(out).toContain("run_typecheck: exit code 1");
  });

  it("a warning check → review_needed", async () => {
    const runCheck = jest.fn(async (name: string) =>
      name === "summarize_last_test_failure" ? "Latest test failure (sanitized; generatedAt: t; 1 failing of 3):\n- title: x" : okOutput(name),
    );
    const out = await buildDeployReadinessReport({ mode: "runSafeChecks", changedPaths: [] }, { runCheck, getChangedFiles: stubFiles });
    expect(out).toContain("**Readiness:** review_needed");
    expect(out).toContain("## Warnings");
  });

  it("includeMcpSmoke is a recommendation only — never executed", async () => {
    const runCheck = jest.fn(async (name: string) => okOutput(name));
    const out = await buildDeployReadinessReport(
      { mode: "runSafeChecks", includeMcpSmoke: true, changedPaths: [] },
      { runCheck, getChangedFiles: stubFiles },
    );
    expect(runCheck.mock.calls.map((c) => c[0])).not.toContain("npm run mcp:smoke");
    expect(out).toContain("npm run mcp:smoke (run manually");
  });

  it("always includes the explicit no-push / no-deploy / no-db statements", async () => {
    const out = await buildDeployReadinessReport({ mode: "advisory", changedPaths: [] }, { runCheck: jest.fn(), getChangedFiles: stubFiles });
    expect(out).toContain("No push performed.");
    expect(out).toContain("No deploy performed.");
    expect(out).toContain("No database changes or migration application performed.");
  });

  it("maxOutput truncates the report", async () => {
    const out = await buildDeployReadinessReport({ mode: "advisory", changedPaths: [], maxOutput: 200 }, { runCheck: jest.fn(), getChangedFiles: stubFiles });
    expect(out).toMatch(/truncated \d+ characters/);
  });
});

// ───────────────────────────── pure helpers ─────────────────────────────

describe("classifyCheckOutput (pure)", () => {
  it("maps command exit codes", () => {
    expect(classifyCheckOutput("run_typecheck", "exit code: 0\n\nok").status).toBe("passed");
    expect(classifyCheckOutput("run_typecheck", "exit code: 2\n\nboom").status).toBe("failed");
  });
  it("maps jest result lines", () => {
    expect(classifyCheckOutput("run_route_structure_tests", "result: PASSED  (exit code 0)").status).toBe("passed");
    expect(classifyCheckOutput("run_route_structure_tests", "result: FAILED  (exit code 1)").status).toBe("failed");
  });
  it("maps smoke-summary output to info/warning", () => {
    expect(classifyCheckOutput("summarize_last_test_failure", "No failures in the latest artifact (generatedAt: t).").status).toBe("info");
    expect(classifyCheckOutput("summarize_last_test_failure", "Latest test failure (sanitized; ...)").status).toBe("warning");
  });
});

describe("deriveReadiness (pure)", () => {
  it("advisory → review_needed when there are recommendations, else unknown", () => {
    expect(deriveReadiness("advisory", [], 5)).toBe("review_needed");
    expect(deriveReadiness("advisory", [], 0)).toBe("unknown");
  });
  it("runSafeChecks aggregates worst-wins", () => {
    expect(deriveReadiness("runSafeChecks", [{ name: "a", status: "failed", headline: "" }], 0)).toBe("blocked");
    expect(deriveReadiness("runSafeChecks", [{ name: "a", status: "warning", headline: "" }], 0)).toBe("review_needed");
    expect(deriveReadiness("runSafeChecks", [{ name: "a", status: "passed", headline: "" }], 0)).toBe("ready");
    expect(deriveReadiness("runSafeChecks", [], 0)).toBe("unknown");
  });
});

// ───────────────────────────── registry wiring ─────────────────────────────

describe("registry wiring", () => {
  it("registers the 2 report tools with unique names", () => {
    const names = buildRegistry().list().map((t) => t.name);
    for (const n of ["generate_diagnostic_report", "generate_deploy_readiness_report"]) {
      expect(names).toContain(n);
    }
    expect(new Set(names).size).toBe(names.length);
  });
});
