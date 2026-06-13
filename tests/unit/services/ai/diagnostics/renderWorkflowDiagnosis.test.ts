/**
 * @jest-environment node
 *
 * Tests for the pure deterministic renderer (Slice 4.AI-DIAG-1). Proves codes →
 * stable safe strings, deterministic output, and that it never interpolates a
 * raw value (only the safe fields on its input can ever appear).
 */
import { renderWorkflowDiagnosis } from "@/services/ai/diagnostics/renderWorkflowDiagnosis";
import type { AgentFinding } from "@/services/ai/diagnostics/diagnoseWorkflowForAgent";

const base = {
  overallReady: false,
  runnable: false,
  allRequiredConnected: false,
  findings: [] as AgentFinding[],
};

describe("renderWorkflowDiagnosis — ready / not-ready summary", () => {
  it("ready workflow reads as ready", () => {
    const out = renderWorkflowDiagnosis({
      ...base,
      overallReady: true,
      runnable: true,
      allRequiredConnected: true,
    });
    expect(out.summaryText).toContain("ready to run");
    expect(out.nextSteps).toEqual([]);
  });

  it("not-runnable + not-connected cites both reasons", () => {
    const out = renderWorkflowDiagnosis(base);
    expect(out.summaryText).toContain("configuration is incomplete");
    expect(out.summaryText).toContain("providers aren't connected");
  });
});

describe("renderWorkflowDiagnosis — code → stable strings + safe next steps", () => {
  it("connection DISCONNECTED → reconnect step with public provider name", () => {
    const findings: AgentFinding[] = [
      {
        source: "connection",
        code: "DISCONNECTED",
        severity: "error",
        title: "The provider isn't connected.",
        provider: "gmail",
        providerName: "Gmail",
        // AI-DIAG-FIX-1 — raw id stays internal; the human label is rendered.
        nodeIds: ["n2"],
        nodeLabels: ["Send Email"],
        credentialClass: "personal",
      },
    ];
    const out = renderWorkflowDiagnosis({ ...base, findings });
    expect(out.summaryText).toContain("Gmail");
    // The human node LABEL is rendered; the raw node id never is.
    expect(out.summaryText).toContain("Send Email");
    expect(out.summaryText).not.toContain("n2");
    expect(out.nextSteps).toContain("Reconnect Gmail.");
  });

  it("AI-DIAG-FIX-1 — a missing-field finding renders the node LABEL, never the raw id", () => {
    const findings: AgentFinding[] = [
      {
        source: "field",
        code: "MISSING_REQUIRED_FIELD",
        severity: "error",
        title: "Required fields are missing.",
        nodeIds: ["264806d9-ddb1-4cfd-a068-6089862e15ad"],
        nodeLabels: ["Send Channel Message"],
        missingFields: ["Message"],
      },
    ];
    const out = renderWorkflowDiagnosis({ ...base, findings });
    expect(out.summaryText).toContain("Send Channel Message");
    expect(out.summaryText).toContain("Message");
    expect(out.summaryText).not.toContain("264806d9");
    expect(out.summaryText).not.toMatch(/node:/i);
  });

  it("MISSING_SCOPES → step lists the public scope gap names", () => {
    const findings: AgentFinding[] = [
      {
        source: "connection",
        code: "MISSING_SCOPES",
        severity: "error",
        title: "The connection is missing required permissions.",
        provider: "slack",
        providerName: "Slack",
        nodeIds: ["n1"],
        credentialClass: "account",
        missingScopes: ["channels:read", "chat:write"],
      },
    ];
    const out = renderWorkflowDiagnosis({ ...base, findings });
    expect(out.nextSteps.join(" ")).toContain("channels:read, chat:write");
  });

  it("NOT_WORKFLOW_OWNER → safe creator/duplicate guidance, no owner identity", () => {
    const findings: AgentFinding[] = [
      {
        source: "connection",
        code: "NOT_WORKFLOW_OWNER",
        severity: "error",
        title: "This provider's connection belongs to the workflow's creator.",
        provider: "gmail",
        providerName: "Gmail",
        nodeIds: ["n2"],
        credentialClass: "personal",
      },
    ];
    const out = renderWorkflowDiagnosis({ ...base, findings });
    expect(out.nextSteps.join(" ")).toMatch(/creator|duplicate/i);
  });

  it("field gap → fill-required-fields step (deduped across nodes)", () => {
    const findings: AgentFinding[] = [
      { source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "Required fields are missing.", nodeIds: ["n1"], missingFields: ["a"] },
      { source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "Required fields are missing.", nodeIds: ["n2"], missingFields: ["b"] },
    ];
    const out = renderWorkflowDiagnosis({ ...base, findings });
    expect(out.nextSteps.filter((s) => s.includes("required fields"))).toHaveLength(1);
  });

  it("deterministic — same input yields identical output", () => {
    const findings: AgentFinding[] = [
      { source: "graph", code: "no_trigger", severity: "error", title: "The workflow has no trigger." },
    ];
    const a = renderWorkflowDiagnosis({ ...base, findings });
    const b = renderWorkflowDiagnosis({ ...base, findings });
    expect(a).toEqual(b);
  });
});

describe("renderWorkflowDiagnosis — latest run + no raw interpolation", () => {
  it("renders the humanized failed-run classification + hint as a next step", () => {
    const out = renderWorkflowDiagnosis({
      ...base,
      latestRun: {
        runId: "run-1",
        status: "failed",
        visibility: "FAILED_VISIBLE",
        classificationAvailable: true,
        errorClassification: {
          title: "Gmail disconnected",
          description: "Reconnect Gmail to keep running.",
          hint: "Reconnect Gmail in Integrations.",
          action: "reconnect",
          severity: "error",
        },
        firstFailedNodeId: "n2",
      },
    });
    expect(out.summaryText).toContain("Gmail disconnected");
    expect(out.nextSteps).toContain("Reconnect Gmail in Integrations.");
  });

  it("never echoes an unexpected extra property on a finding (allow-listed fields only)", () => {
    const findings = [
      {
        source: "connection",
        code: "DISCONNECTED",
        severity: "error",
        title: "The provider isn't connected.",
        provider: "gmail",
        providerName: "Gmail",
        nodeIds: ["n2"],
        // Not part of AgentFinding — must never appear in rendered text.
        _rawConfig: "SECRET_CONFIG_VALUE",
      } as unknown as AgentFinding,
    ];
    const out = renderWorkflowDiagnosis({ ...base, findings });
    const blob = out.summaryText + out.nextSteps.join(" ");
    expect(blob).not.toContain("SECRET_CONFIG_VALUE");
  });
});
