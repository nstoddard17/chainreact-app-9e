/**
 * @jest-environment node
 *
 * Tests for the React-Agent workflow-diagnosis composition
 * (Slice 4.AI-DIAG-1) — the first DIRECT in-app consumer of
 * `services/diagnostics/*`.
 *
 * The three diagnostic services + the run-history reader are mocked at their
 * module boundary, so these prove the composition's contract: it calls
 * `services/diagnostics/*` directly (never MCP), short-circuits on access walls,
 * looks up the latest run only AFTER access is OK, and never leaks raw data.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockReadiness = jest.fn();
jest.mock("@/services/diagnostics/workflowReadiness", () => ({
  diagnoseWorkflowReadiness: (...a: unknown[]) => mockReadiness(...a),
}));

const mockConnections = jest.fn();
jest.mock("@/services/diagnostics/integrationConnection", () => ({
  diagnoseWorkflowConnections: (...a: unknown[]) => mockConnections(...a),
}));

const mockRunReport = jest.fn();
jest.mock("@/services/diagnostics/runReport", () => ({
  diagnoseRunReport: (...a: unknown[]) => mockRunReport(...a),
}));

const mockListRuns = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  listByWorkflow: (...a: unknown[]) => mockListRuns(...a),
}));

import { diagnoseWorkflowForAgent } from "@/services/ai/diagnostics/diagnoseWorkflowForAgent";

const WF = "wf-1";
const USER = "user-1";

function readinessOk(over: Record<string, unknown> = {}) {
  return {
    workflowId: WF,
    access: "OK",
    runnable: false,
    readinessError: "MISSING_REQUIRED_FIELDS",
    graphIssues: [{ code: "no_trigger" }],
    fieldGaps: [{ nodeId: "n2", nodeName: "Send Email", missingFields: ["to", "subject"] }],
    providers: [{ provider: "gmail", name: "Gmail", enabled: true }],
    ...over,
  };
}

function connectionsOk(over: Record<string, unknown> = {}) {
  return {
    workflowId: WF,
    access: "OK",
    allRequiredConnected: false,
    providers: [
      {
        provider: "gmail",
        name: "Gmail",
        credentialClass: "personal",
        nodeIds: ["n2"],
        nodeCount: 1,
        status: "DISCONNECTED",
        ready: false,
        providerEnabled: true,
        refreshable: true,
        tokenExpired: null,
        scopesSatisfied: false,
        missingScopeCount: 0,
      },
      {
        provider: "slack",
        name: "Slack",
        credentialClass: "account",
        nodeIds: ["n1"],
        nodeCount: 1,
        status: "CONNECTED",
        ready: true,
        providerEnabled: true,
        refreshable: true,
        tokenExpired: false,
        scopesSatisfied: true,
        missingScopeCount: 0,
      },
    ],
    ...over,
  };
}

function failedRunReport(over: Record<string, unknown> = {}) {
  return {
    runId: "run-1",
    visibility: "FAILED_VISIBLE",
    status: "failed",
    isTest: false,
    triggeredBy: "manual",
    firstFailedNodeId: "n2",
    failedStepCount: 1,
    classificationAvailable: true,
    errorClassification: {
      title: "Gmail disconnected",
      description: "Reconnect Gmail to keep this workflow running.",
      hint: "Reconnect Gmail in Integrations.",
      action: "reconnect",
      severity: "error",
    },
    steps: [{ nodeId: "n2", status: "failed", errorCode: "INTEGRATION_DISCONNECTED" }],
    ...over,
  };
}

beforeEach(() => {
  mockReadiness.mockReset();
  mockConnections.mockReset();
  mockRunReport.mockReset();
  mockListRuns.mockReset();
  mockListRuns.mockResolvedValue([]); // default: no runs
});

// ───────────────────────── access short-circuit ─────────────────────────
describe("diagnoseWorkflowForAgent — access wall short-circuits", () => {
  it("NOT_FOUND — no connection or run lookup", async () => {
    mockReadiness.mockResolvedValue({ workflowId: WF, access: "NOT_FOUND" });
    const dto = await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });
    expect(dto).toEqual({ workflowId: WF, access: "NOT_FOUND" });
    expect(mockConnections).not.toHaveBeenCalled();
    expect(mockListRuns).not.toHaveBeenCalled();
    expect(mockRunReport).not.toHaveBeenCalled();
  });

  it("NO_ACCOUNT_ACCESS → NO_ACCESS — no connection or run lookup", async () => {
    mockReadiness.mockResolvedValue({ workflowId: WF, access: "NO_ACCOUNT_ACCESS" });
    const dto = await diagnoseWorkflowForAgent({ subjectUserId: "intruder", workflowId: WF });
    expect(dto).toEqual({ workflowId: WF, access: "NO_ACCESS" });
    expect(mockConnections).not.toHaveBeenCalled();
    expect(mockListRuns).not.toHaveBeenCalled();
  });

  it("connections disagreeing (defensive) → returns the connection access wall", async () => {
    mockReadiness.mockResolvedValue(readinessOk());
    mockConnections.mockResolvedValue({ workflowId: WF, access: "NO_ACCOUNT_ACCESS" });
    const dto = await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });
    expect(dto).toEqual({ workflowId: WF, access: "NO_ACCESS" });
    expect(mockListRuns).not.toHaveBeenCalled();
  });
});

// ───────────────── composition + direct service consumption ─────────────────
describe("diagnoseWorkflowForAgent — composes services/diagnostics directly", () => {
  it("builds findings from readiness + connections + a failed latest run", async () => {
    mockReadiness.mockResolvedValue(readinessOk());
    mockConnections.mockResolvedValue(connectionsOk());
    mockListRuns.mockResolvedValue([{ id: "run-1", status: "failed", accountId: "a" }]);
    mockRunReport.mockResolvedValue(failedRunReport());

    const dto = await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });

    expect(dto.access).toBe("OK");
    expect(dto.runnable).toBe(false);
    expect(dto.allRequiredConnected).toBe(false);
    expect(dto.overallReady).toBe(false);

    const codes = dto.findings!.map((f) => `${f.source}:${f.code}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        "graph:no_trigger",
        "field:MISSING_REQUIRED_FIELD",
        "connection:DISCONNECTED",
        "run:RECENT_RUN_FAILED",
      ]),
    );
    // The CONNECTED provider produces no finding.
    expect(codes).not.toContain("connection:CONNECTED");

    const fieldFinding = dto.findings!.find((f) => f.source === "field")!;
    expect(fieldFinding.missingFields).toEqual(["to", "subject"]);
    expect(fieldFinding.nodeIds).toEqual(["n2"]);

    expect(dto.latestRun).toMatchObject({ runId: "run-1", status: "failed" });
    expect(typeof dto.summaryText).toBe("string");
    expect(dto.summaryText).toContain("can't run");
    expect(dto.nextSteps).toEqual(expect.arrayContaining(["Reconnect Gmail."]));

    // It consumed the diagnostic services directly (the mocks were hit) with the
    // session subject — never an elevated/forwarded account/creator.
    expect(mockReadiness).toHaveBeenCalledWith({ subjectUserId: USER, workflowId: WF });
    expect(mockConnections).toHaveBeenCalledWith({ subjectUserId: USER, workflowId: WF });
  });

  it("overallReady true when runnable + allRequiredConnected", async () => {
    mockReadiness.mockResolvedValue(
      readinessOk({ runnable: true, readinessError: null, graphIssues: [], fieldGaps: [] }),
    );
    mockConnections.mockResolvedValue(
      connectionsOk({
        allRequiredConnected: true,
        providers: [
          {
            provider: "slack",
            name: "Slack",
            credentialClass: "account",
            nodeIds: ["n1"],
            nodeCount: 1,
            status: "CONNECTED",
            ready: true,
            providerEnabled: true,
            refreshable: true,
            tokenExpired: false,
            scopesSatisfied: true,
            missingScopeCount: 0,
          },
        ],
      }),
    );
    const dto = await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });
    expect(dto.overallReady).toBe(true);
    expect(dto.findings).toEqual([]);
    expect(dto.summaryText).toContain("ready to run");
  });
});

// ───────────────── latest-run: only after access OK, best-effort ─────────────────
describe("diagnoseWorkflowForAgent — latest run is best-effort + post-access", () => {
  it("looks up the run ONLY after access OK", async () => {
    mockReadiness.mockResolvedValue(readinessOk());
    mockConnections.mockResolvedValue(connectionsOk());
    mockListRuns.mockResolvedValue([{ id: "run-1", status: "failed", accountId: "a" }]);
    mockRunReport.mockResolvedValue(failedRunReport());
    await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });
    expect(mockListRuns).toHaveBeenCalledWith(WF, { limit: 1 });
    expect(mockRunReport).toHaveBeenCalledWith({
      subjectUserId: USER,
      runId: "run-1",
      mode: "failure",
      includeTestRuns: false,
    });
  });

  it("omits latestRun when there are no runs", async () => {
    mockReadiness.mockResolvedValue(readinessOk());
    mockConnections.mockResolvedValue(connectionsOk());
    mockListRuns.mockResolvedValue([]);
    const dto = await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });
    expect(dto.latestRun).toBeUndefined();
    expect(mockRunReport).not.toHaveBeenCalled();
    expect(dto.findings!.some((f) => f.source === "run")).toBe(false);
  });

  it("omits latestRun (no throw) when the run reader fails", async () => {
    mockReadiness.mockResolvedValue(readinessOk());
    mockConnections.mockResolvedValue(connectionsOk());
    mockListRuns.mockRejectedValue(new Error("db down"));
    const dto = await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });
    expect(dto.access).toBe("OK");
    expect(dto.latestRun).toBeUndefined();
  });

  it("omits latestRun when diagnoseRunReport throws", async () => {
    mockReadiness.mockResolvedValue(readinessOk());
    mockConnections.mockResolvedValue(connectionsOk());
    mockListRuns.mockResolvedValue([{ id: "run-1", status: "failed", accountId: "a" }]);
    mockRunReport.mockRejectedValue(new Error("boom"));
    const dto = await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });
    expect(dto.latestRun).toBeUndefined();
  });
});

// ───────────────── native/system trigger produces no false blocker ─────────────────
describe("diagnoseWorkflowForAgent — native/system trigger", () => {
  it("native Manual Run + connected Slack → ready, no PROVIDER_UNKNOWN / 'native' finding", async () => {
    // Readiness passes (graph + fields OK). The connection service already
    // excludes the native pseudo-provider, so its DTO carries ONLY the real
    // external provider — the agent must reflect that without inventing a
    // native finding. (The native exclusion itself is unit-tested in
    // services/diagnostics/integrationConnection.test.ts.)
    mockReadiness.mockResolvedValue(
      readinessOk({ runnable: true, readinessError: null, graphIssues: [], fieldGaps: [] }),
    );
    mockConnections.mockResolvedValue(
      connectionsOk({
        allRequiredConnected: true,
        providers: [
          {
            provider: "slack",
            name: "Slack",
            credentialClass: "account",
            nodeIds: ["action-1"],
            nodeCount: 1,
            status: "CONNECTED",
            ready: true,
            providerEnabled: true,
            refreshable: true,
            tokenExpired: false,
            scopesSatisfied: true,
            missingScopeCount: 0,
          },
        ],
      }),
    );
    // A recent SUCCESSFUL run must not be contradicted by a false native blocker.
    mockListRuns.mockResolvedValue([{ id: "run-1", status: "succeeded", accountId: "a" }]);
    mockRunReport.mockResolvedValue({
      runId: "run-1",
      visibility: "SUCCEEDED_VISIBLE",
      status: "succeeded",
      classificationAvailable: false,
      errorClassification: null,
      firstFailedNodeId: null,
    });

    const dto = await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });

    expect(dto.overallReady).toBe(true);
    expect(dto.allRequiredConnected).toBe(true);
    // No connection finding at all — the only real provider is connected, and
    // native was never diagnosed.
    expect(dto.findings!.some((f) => f.source === "connection")).toBe(false);
    expect(dto.findings!.map((f) => f.code)).not.toContain("PROVIDER_UNKNOWN");

    // The renderer (real, not mocked) must never emit the native-blocker copy,
    // and nothing in the DTO mentions the native pseudo-provider.
    const blob = JSON.stringify(dto) + (dto.summaryText ?? "") + (dto.nextSteps ?? []).join(" ");
    expect(blob).not.toContain("native");
    expect(blob).not.toContain("isn't recognized");
    expect(blob).not.toContain("Replace the");
    expect(dto.summaryText).toContain("ready to run");
    expect(dto.summaryText).toContain("The most recent run succeeded.");
  });
});

// ───────────────── personal-provider non-creator stays safe/coarse ─────────────────
describe("diagnoseWorkflowForAgent — personal provider non-creator", () => {
  it("surfaces NOT_WORKFLOW_OWNER with no owner credential detail", async () => {
    mockReadiness.mockResolvedValue(
      readinessOk({ runnable: true, readinessError: null, graphIssues: [], fieldGaps: [] }),
    );
    mockConnections.mockResolvedValue(
      connectionsOk({
        allRequiredConnected: false,
        providers: [
          {
            provider: "gmail",
            name: "Gmail",
            credentialClass: "personal",
            nodeIds: ["n2"],
            nodeCount: 1,
            status: "NOT_WORKFLOW_OWNER",
            ready: false,
            providerEnabled: true,
            refreshable: true,
            tokenExpired: null,
            scopesSatisfied: false,
            missingScopeCount: 0,
          },
        ],
      }),
    );
    const dto = await diagnoseWorkflowForAgent({ subjectUserId: "co-member", workflowId: WF });
    const f = dto.findings!.find((x) => x.source === "connection")!;
    expect(f.code).toBe("NOT_WORKFLOW_OWNER");
    expect(f.credentialClass).toBe("personal");
    expect(dto.allRequiredConnected).toBe(false);
    // No owner identity / label leaks through the composed view.
    const json = JSON.stringify(dto);
    expect(json).not.toContain("connectedByUserId");
  });
});

// ───────────── AI-DIAG-FIX-1: draftOverride threading + node labels ─────────────
describe("diagnoseWorkflowForAgent — current-draft override + node labels", () => {
  it("forwards draftOverride to BOTH readiness and connections (diagnoses current builder state)", async () => {
    mockReadiness.mockResolvedValue(
      readinessOk({ runnable: true, readinessError: null, graphIssues: [], fieldGaps: [] }),
    );
    mockConnections.mockResolvedValue(connectionsOk({ allRequiredConnected: true, providers: [] }));
    const draftOverride = {
      nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {}, position: { x: 0, y: 0 } }],
      edges: [],
    } as any;
    await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF, draftOverride });
    expect(mockReadiness).toHaveBeenCalledWith({ subjectUserId: USER, workflowId: WF, draftOverride });
    expect(mockConnections).toHaveBeenCalledWith({ subjectUserId: USER, workflowId: WF, draftOverride });
  });

  it("without a draftOverride, sub-services are called without one (saved-state back-compat)", async () => {
    mockReadiness.mockResolvedValue(
      readinessOk({ runnable: true, readinessError: null, graphIssues: [], fieldGaps: [] }),
    );
    mockConnections.mockResolvedValue(connectionsOk({ allRequiredConnected: true, providers: [] }));
    await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });
    expect(mockReadiness).toHaveBeenCalledWith({ subjectUserId: USER, workflowId: WF });
    expect(mockConnections).toHaveBeenCalledWith({ subjectUserId: USER, workflowId: WF });
  });

  it("attaches safe nodeLabels to findings and never leaks the raw node id into summaryText", async () => {
    const ID = "264806d9-ddb1-4cfd-a068-6089862e15ad";
    mockReadiness.mockResolvedValue(
      readinessOk({
        runnable: false,
        readinessError: "MISSING_REQUIRED_FIELDS",
        graphIssues: [],
        fieldGaps: [{ nodeId: ID, nodeName: "Send Channel Message", missingFields: ["Message"] }],
        nodeLabels: [{ nodeId: ID, label: "Send Channel Message" }],
      }),
    );
    mockConnections.mockResolvedValue(connectionsOk({ allRequiredConnected: true, providers: [] }));
    const dto = await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });
    const field = dto.findings!.find((f) => f.source === "field")!;
    expect(field.nodeLabels).toEqual(["Send Channel Message"]);
    // Internal id is kept on the finding but NEVER rendered into user-facing text.
    expect(field.nodeIds).toEqual([ID]);
    expect(dto.summaryText).toContain("Send Channel Message");
    expect(dto.summaryText).not.toContain(ID);
    expect(dto.summaryText).not.toContain("264806d9");
  });
});

// ───────────────────────────── no-leak ─────────────────────────────
describe("diagnoseWorkflowForAgent — no-leak (allow-lists fields)", () => {
  it("drops any raw fields a source DTO might carry; only safe fields compose", async () => {
    mockReadiness.mockResolvedValue(
      readinessOk({
        // Planted raw fields that must NEVER be copied through.
        providers: [{ provider: "gmail", name: "Gmail", enabled: true, secretBlob: "READINESS_SECRET" }],
      }),
    );
    mockConnections.mockResolvedValue(
      connectionsOk({
        providers: [
          {
            provider: "gmail",
            name: "Gmail",
            credentialClass: "personal",
            nodeIds: ["n2"],
            nodeCount: 1,
            status: "DISCONNECTED",
            ready: false,
            providerEnabled: true,
            refreshable: true,
            tokenExpired: null,
            scopesSatisfied: false,
            missingScopeCount: 0,
            // Planted raw fields (not on the type) — must be dropped by the allow-list.
            accessTokenEncrypted: "enc:VERYSECRETCIPHER",
            connectedByUserId: "creator-SECRET-42",
            providerAccountId: "ACCT-SECRET",
            displayName: "Acme Secret Workspace",
            accountMetadata: { team: "AcmeSecretTeam" },
          },
        ],
      }),
    );
    const dto = await diagnoseWorkflowForAgent({ subjectUserId: USER, workflowId: WF });
    const blob = JSON.stringify(dto) + (dto.summaryText ?? "");
    for (const forbidden of [
      "READINESS_SECRET",
      "VERYSECRETCIPHER",
      "enc:",
      "creator-SECRET-42",
      "ACCT-SECRET",
      "Acme Secret Workspace",
      "AcmeSecretTeam",
    ]) {
      expect(blob).not.toContain(forbidden);
    }
  });
});

// ─────────────────── import boundary: never reaches into MCP ───────────────────
describe("diagnoseWorkflowForAgent — import boundary", () => {
  it("the composition + renderer never import from scripts/mcp", () => {
    // Scan IMPORT SPECIFIERS only (not comments — the JSDoc mentions the rule).
    const importSpec = /(?:import\s[^"']*?from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    for (const rel of [
      "services/ai/diagnostics/diagnoseWorkflowForAgent.ts",
      "services/ai/diagnostics/renderWorkflowDiagnosis.ts",
    ]) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      const specifiers = [...src.matchAll(importSpec)].map((m) => m[1]);
      expect(specifiers.length).toBeGreaterThan(0);
      for (const spec of specifiers) {
        expect(spec).not.toMatch(/scripts\/mcp/);
      }
    }
  });
});
