/**
 * @jest-environment node
 *
 * Phase C-2 composite doctor tools (scripts/mcp/tools/doctors.ts). They COMPOSE
 * existing gated diagnostics (via the shared `postDiagnostic` transport) + the
 * static `providerStatics` brain — they add no route and no brain. Tests mock
 * global `fetch` for the live sections; static sections run against the real repo.
 */
import { aggregateOverall, doctorTools } from "@/scripts/mcp/tools/doctors";
import { buildRegistry } from "@/scripts/mcp/tools";

const handler = (name: string) => {
  const t = doctorTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t.handler;
};

const originalFetch = global.fetch;
let fetchMock: jest.Mock;
const json = (status: number, body: unknown): Response => ({ status, json: async () => body }) as unknown as Response;
/** Route mocked fetch by URL fragment → response. */
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

describe("aggregateOverall (pure)", () => {
  it("worst-wins across section statuses", () => {
    expect(aggregateOverall(["ok", "blocked", "warning"])).toBe("blocked");
    expect(aggregateOverall(["ok", "warning"])).toBe("warning");
    expect(aggregateOverall(["ok", "ok"])).toBe("healthy");
    expect(aggregateOverall(["unavailable"])).toBe("unknown");
    expect(aggregateOverall([])).toBe("unknown");
  });
});

describe("doctor_workflow", () => {
  const doctor = () => handler("doctor_workflow");

  it("requires workflowId and userId", async () => {
    expect(await doctor()({ userId: "u1" })).toMatch(/'workflowId' is required/);
    expect(await doctor()({ workflowId: "wf-1" })).toMatch(/'userId' is required/);
  });

  it("gate off / unreachable → overall unknown, nothing leaked", async () => {
    delete process.env.MCP_DIAGNOSTICS_TOKEN; // postDiagnostic returns !ok
    const out = await doctor()({ workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("overall: unknown");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("access wall short-circuits to blocked with no other sections", async () => {
    routeFetch({ "workflow-readiness": json(200, { workflowId: "wf-1", access: "NO_ACCOUNT_ACCESS" }) });
    const out = await doctor()({ workflowId: "wf-1", userId: "intruder" });
    expect(out).toContain("overall: blocked");
    expect(out).toContain("NO_ACCOUNT_ACCESS");
    expect(fetchMock).toHaveBeenCalledTimes(1); // didn't fetch graph/connections
  });

  it("composes readiness + graph + connections → healthy, lists sources", async () => {
    routeFetch({
      "workflow-readiness": json(200, { workflowId: "wf-1", access: "OK", runnable: true, readinessError: null }),
      "workflow-graph": json(200, { workflowId: "wf-1", access: "OK", structurallyValid: true, nodeCount: 2, edgeCount: 1, findings: [] }),
      "workflow-connections": json(200, { workflowId: "wf-1", access: "OK", allRequiredConnected: true, providers: [{ provider: "slack", name: "Slack", credentialClass: "account", status: "CONNECTED", ready: true, nodeCount: 1 }] }),
    });
    const out = await doctor()({ workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("overall: healthy");
    expect(out).toContain("sources: diagnose_workflow_readiness, diagnose_workflow_graph, diagnose_workflow_connections");
    expect(out).toContain("[OK] readiness: runnable");
    expect(out).toContain("[OK] connections:");
  });

  it("surfaces graph errors + a broken connection → blocked with prioritized nextSteps", async () => {
    routeFetch({
      "workflow-readiness": json(200, { workflowId: "wf-1", access: "OK", runnable: false, readinessError: "INVALID_WORKFLOW_GRAPH" }),
      "workflow-graph": json(200, { workflowId: "wf-1", access: "OK", structurallyValid: false, nodeCount: 3, edgeCount: 1, findings: [{ kind: "NO_TRIGGER", severity: "error" }, { kind: "UNSUPPORTED_NODE", severity: "warning", nodeId: "a1", provider: "x", nodeType: "y" }] }),
      "workflow-connections": json(200, { workflowId: "wf-1", access: "OK", allRequiredConnected: false, providers: [{ provider: "gmail", name: "Gmail", credentialClass: "account", status: "DISCONNECTED", ready: false, nodeCount: 2 }] }),
    });
    const out = await doctor()({ workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("overall: blocked");
    expect(out).toContain("Add a trigger to the workflow.");
    expect(out).toContain("Connect/reconnect gmail for this account (DISCONNECTED).");
  });

  it("includes the run section when a runId is given; marks it unavailable otherwise", async () => {
    routeFetch({
      "workflow-readiness": json(200, { workflowId: "wf-1", access: "OK", runnable: true, readinessError: null }),
      "workflow-graph": json(200, { workflowId: "wf-1", access: "OK", structurallyValid: true, nodeCount: 1, edgeCount: 0, findings: [] }),
      "workflow-connections": json(200, { workflowId: "wf-1", access: "OK", allRequiredConnected: true, providers: [] }),
      "run-failure": json(200, { runId: "r1", visibility: "FAILED_VISIBLE", status: "failed", firstFailedNodeId: "n2", failedStepCount: 1, classificationAvailable: true, errorClassification: { title: "Auth expired", description: "...", action: "Reconnect Slack", severity: "error" } }),
    });
    const withRun = await doctor()({ workflowId: "wf-1", userId: "u1", runId: "r1" });
    expect(withRun).toContain("run:");
    expect(withRun).toContain("Reconnect Slack");
    const noRun = await doctor()({ workflowId: "wf-1", userId: "u1" });
    expect(noRun).toContain("run: no runId provided");
  });

  it("degrades gracefully when one section is unavailable", async () => {
    routeFetch({
      "workflow-readiness": json(200, { workflowId: "wf-1", access: "OK", runnable: true, readinessError: null }),
      "workflow-graph": json(404, { error: "not_found" }), // gate flaps for this one
      "workflow-connections": json(200, { workflowId: "wf-1", access: "OK", allRequiredConnected: true, providers: [] }),
    });
    const out = await doctor()({ workflowId: "wf-1", userId: "u1" });
    expect(out).toContain("unavailable:");
    expect(out).toContain("graph:");
    expect(out).toContain("[OK] readiness:");
  });
});

describe("doctor_provider", () => {
  const doctor = () => handler("doctor_provider");

  it("rejects invalid / unknown providers", async () => {
    expect(await doctor()({ provider: "BAD!" })).toMatch(/invalid provider id/);
    expect(await doctor()({ provider: "nope" })).toMatch(/no manifest found/);
  });

  it("static composition (no account) — sections + sources, live section unavailable", async () => {
    const out = await doctor()({ provider: "slack" });
    expect(out).toContain("doctor_provider: slack");
    expect(out).toContain("capability:");
    expect(out).toContain("counts:");
    expect(out).toContain("consistency:");
    expect(out).toContain("optionSources:");
    expect(out).toContain("connectionRequirements:");
    expect(out).toContain("liveConnection: provide accountId + userId");
    expect(out).toContain("provider_capability_matrix");
    expect(fetchMock).not.toHaveBeenCalled(); // static-only path makes no live call
  });

  it("adds the live connection section when account + user given", async () => {
    routeFetch({
      "integration-connection": json(200, { ok: true, provider: "slack", accountId: "acct-1", status: "DISCONNECTED", activeConnectionCount: 0, providerEnabled: true, refreshable: false, credentialClass: "account", tokenExpired: null, scopesSatisfied: false, missingScopeCount: 0 }),
    });
    const out = await doctor()({ provider: "slack", accountId: "acct-1", userId: "u1" });
    expect(out).toContain("[BLOCKED] liveConnection: status=DISCONNECTED");
    expect(out).toContain("Resolve the live connection for 'slack' (status DISCONNECTED).");
    expect(out).toContain("diagnose_integration_connection");
  });
});

describe("doctor_account_integration", () => {
  const doctor = () => handler("doctor_account_integration");

  it("requires accountId and userId", async () => {
    expect(await doctor()({ userId: "u1" })).toMatch(/'accountId' is required/);
    expect(await doctor()({ accountId: "a1" })).toMatch(/'userId' is required/);
  });

  it("defers account-wide enumeration when no provider is given", async () => {
    const out = await doctor()({ accountId: "acct-1", userId: "u1" });
    expect(out).toContain("overall: unknown");
    expect(out).toContain("accountWideEnumeration");
    expect(out).toContain("DEFERRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("provider-scoped CONNECTED → healthy with counts, no token leaked", async () => {
    routeFetch({
      "integration-connection": json(200, { ok: true, provider: "slack", accountId: "acct-1", status: "CONNECTED", activeConnectionCount: 1, providerEnabled: true, refreshable: false, credentialClass: "account", tokenExpired: false, scopesSatisfied: true, missingScopeCount: 0 }),
    });
    const out = await doctor()({ accountId: "acct-1", userId: "u1", provider: "slack" });
    expect(out).toContain("overall: healthy");
    expect(out).toContain("connected=1 needsAttention=0");
    expect(out).not.toMatch(/xox|token|secret/i);
  });

  it("provider-scoped DISCONNECTED → blocked + nextStep", async () => {
    routeFetch({
      "integration-connection": json(200, { ok: true, provider: "gmail", accountId: "acct-1", status: "RECONNECT_REQUIRED", activeConnectionCount: 0, providerEnabled: true, refreshable: true, credentialClass: "account", tokenExpired: true, scopesSatisfied: true, missingScopeCount: 0 }),
    });
    const out = await doctor()({ accountId: "acct-1", userId: "u1", provider: "gmail" });
    expect(out).toContain("overall: blocked");
    expect(out).toContain("Resolve 'gmail' for this account (status RECONNECT_REQUIRED).");
  });
});

describe("registry wiring", () => {
  it("registers the 3 doctors with unique names", () => {
    const names = buildRegistry().list().map((t) => t.name);
    for (const n of ["doctor_workflow", "doctor_provider", "doctor_account_integration"]) {
      expect(names).toContain(n);
    }
    expect(new Set(names).size).toBe(names.length);
  });
});
