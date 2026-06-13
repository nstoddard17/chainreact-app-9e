/**
 * Tests for the AI-DIAG-2a allow-list projector
 * (`services/ai/diagnostics/buildDiagnosisExplainContext.ts`).
 *
 * The projector is the single explicit seam deciding what the LLM may see. These
 * pin the exact allow-list AND prove that opaque ids (node/workflow/run) and any
 * planted raw field never leak into the model context.
 */
import { buildDiagnosisExplainContext } from "@/services/ai/diagnostics/buildDiagnosisExplainContext";

// A realistic OK diagnosis seeded with junk fields that MUST be dropped.
const dto = {
  workflowId: "wf-SECRET-ID",
  access: "OK",
  overallReady: false,
  runnable: false,
  allRequiredConnected: false,
  summaryText: "Gmail isn't connected.",
  nextSteps: ["Reconnect Gmail."],
  findings: [
    {
      source: "connection",
      code: "DISCONNECTED",
      severity: "error",
      title: "The provider isn't connected.",
      nodeIds: ["node-OPAQUE-1"],
      provider: "gmail",
      providerName: "Gmail",
      credentialClass: "personal",
      // Planted — none of these may leak.
      providerAccountId: "acct-ext-123",
      accessToken: "ya29.LEAK",
    },
    {
      source: "field",
      code: "MISSING_REQUIRED_FIELD",
      severity: "error",
      title: "Required fields are missing.",
      nodeIds: ["node-OPAQUE-2"],
      missingFields: ["channel", "message"],
    },
  ],
  latestRun: {
    runId: "run-OPAQUE-9",
    status: "failed",
    visibility: "private",
    classificationAvailable: true,
    firstFailedNodeId: "node-OPAQUE-2",
    errorClassification: {
      title: "Authentication failed",
      description: "Reconnect the provider.",
      hint: "Open Integrations.",
      action: "reconnect",
      severity: "error",
    },
  },
} as any;

describe("buildDiagnosisExplainContext (AI-DIAG-2a)", () => {
  it("projects exactly the allow-listed safe fields", () => {
    expect(buildDiagnosisExplainContext(dto)).toEqual({
      overallReady: false,
      runnable: false,
      allRequiredConnected: false,
      summaryText: "Gmail isn't connected.",
      nextSteps: ["Reconnect Gmail."],
      findings: [
        {
          source: "connection",
          code: "DISCONNECTED",
          severity: "error",
          title: "The provider isn't connected.",
          provider: "gmail",
          providerName: "Gmail",
          credentialClass: "personal",
        },
        {
          source: "field",
          code: "MISSING_REQUIRED_FIELD",
          severity: "error",
          title: "Required fields are missing.",
          missingFields: ["channel", "message"],
        },
      ],
      latestRun: {
        status: "failed",
        classification: {
          title: "Authentication failed",
          description: "Reconnect the provider.",
          hint: "Open Integrations.",
          action: "reconnect",
          severity: "error",
        },
      },
    });
  });

  it("drops node ids, workflow id, run ids, and any planted raw field", () => {
    const s = JSON.stringify(buildDiagnosisExplainContext(dto));
    for (const needle of [
      "wf-SECRET-ID",
      "node-OPAQUE-1",
      "node-OPAQUE-2",
      "run-OPAQUE-9",
      "nodeIds",
      "providerAccountId",
      "acct-ext-123",
      "accessToken",
      "ya29.LEAK",
      "visibility",
      "classificationAvailable",
      "firstFailedNodeId",
      "runId",
      "workflowId",
    ]) {
      expect(s).not.toContain(needle);
    }
  });

  it("includes public missing-scope constants (the gap only)", () => {
    const ctx = buildDiagnosisExplainContext({
      access: "OK",
      findings: [
        {
          source: "connection",
          code: "MISSING_SCOPES",
          severity: "error",
          title: "Missing permissions.",
          provider: "slack",
          providerName: "Slack",
          missingScopes: ["channels:read"],
        },
      ],
    } as any);
    expect(ctx.findings[0]!.missingScopes).toEqual(["channels:read"]);
  });

  it("handles a findings-less / latestRun-less DTO", () => {
    const ctx = buildDiagnosisExplainContext({ access: "OK", overallReady: true } as any);
    expect(ctx.findings).toEqual([]);
    expect(ctx.latestRun).toBeUndefined();
    expect(ctx.overallReady).toBe(true);
  });

  it("a corrected DTO (native excluded upstream) yields no native / PROVIDER_UNKNOWN finding for the LLM", () => {
    // After the fix, a Manual Run + connected Slack workflow produces a ready DTO
    // with no connection finding. The projector only forwards what's there, so the
    // model context never mentions native being broken.
    const ctx = buildDiagnosisExplainContext({
      access: "OK",
      overallReady: true,
      runnable: true,
      allRequiredConnected: true,
      summaryText: "This workflow looks ready to run.\nThe most recent run succeeded.",
      nextSteps: [],
      findings: [],
    } as any);
    const s = JSON.stringify(ctx);
    expect(ctx.findings).toEqual([]);
    expect(s).not.toContain("PROVIDER_UNKNOWN");
    expect(s).not.toContain("native");
    expect(s).not.toContain("isn't recognized");
  });
});
