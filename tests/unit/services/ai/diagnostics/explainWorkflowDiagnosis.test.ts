/**
 * Tests for the AI-DIAG-2a LLM explainer service
 * (`services/ai/diagnostics/explainWorkflowDiagnosis.ts`).
 *
 * The model client is INJECTED (no network). These pin: the request shape sent to
 * the model (feature/tier/tool/messages), prompt no-leak (no node/workflow/run ids),
 * strict re-validation of the model's structured output, and safe handling of model
 * + parse failures.
 */
import {
  explainWorkflowDiagnosis,
  DIAGNOSIS_EXPLAIN_TOOL_NAME,
} from "@/services/ai/diagnostics/explainWorkflowDiagnosis";
import type { ModelClient, ModelGenerateInput, ModelResult } from "@/core/ai/modelTypes";

function clientReturning(result: ModelResult): ModelClient {
  return { generateStructuredJson: async () => result };
}

/** A client that captures the request it was sent (typed — no jest.fn arg-tuple issues). */
function capturingClient(): { client: ModelClient; lastInput: () => ModelGenerateInput } {
  let captured: ModelGenerateInput | undefined;
  const client: ModelClient = {
    generateStructuredJson: async (input) => {
      captured = input;
      return success(okText({ explanation: "x" }));
    },
  };
  return {
    client,
    lastInput: () => {
      if (!captured) throw new Error("model client was not called");
      return captured;
    },
  };
}

const okText = (obj: unknown) => JSON.stringify(obj);
const success = (text: string): ModelResult => ({
  ok: true,
  modelId: "gpt-4.1-mini",
  feature: "explanation",
  text,
  finishReason: "stop",
  usage: { inputTokens: 12, outputTokens: 34 },
  latencyMs: 7,
});

const dto = {
  workflowId: "wf-OPAQUE",
  access: "OK",
  overallReady: false,
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
      nodeIds: ["node-OPAQUE"],
      accessToken: "ya29.LEAK",
    },
  ],
  latestRun: { runId: "run-OPAQUE", status: "failed", visibility: "private", classificationAvailable: true },
} as any;

describe("explainWorkflowDiagnosis (AI-DIAG-2a)", () => {
  it("returns the validated explanation + model meta on success", async () => {
    const client = clientReturning(
      success(okText({ explanation: "Gmail is disconnected; reconnect it.", priorities: ["Reconnect Gmail"], missingInfo: [] })),
    );
    const res = await explainWorkflowDiagnosis({ dto, modelClient: client });
    expect(res).toMatchObject({
      ok: true,
      explanation: "Gmail is disconnected; reconnect it.",
      priorities: ["Reconnect Gmail"],
      model: { modelId: "gpt-4.1-mini", tier: "fast", usage: { inputTokens: 12, outputTokens: 34 } },
    });
  });

  it("sends feature=explanation, tier=fast, the explain tool, and a system+user message", async () => {
    const cap = capturingClient();
    await explainWorkflowDiagnosis({ dto, modelClient: cap.client });
    const req = cap.lastInput();
    expect(req.feature).toBe("explanation");
    expect(req.tier).toBe("fast");
    expect(req.responseTool?.name).toBe(DIAGNOSIS_EXPLAIN_TOOL_NAME);
    expect(req.messages).toHaveLength(2);
    expect(req.messages[0]!.role).toBe("system");
    expect(req.messages[1]!.role).toBe("user");
  });

  it("the prompt contains ONLY the allow-listed context — no node/workflow/run ids or planted secrets", async () => {
    const cap = capturingClient();
    await explainWorkflowDiagnosis({ dto, modelClient: cap.client });
    const sent = JSON.stringify(cap.lastInput().messages);
    for (const needle of ["wf-OPAQUE", "node-OPAQUE", "run-OPAQUE", "accessToken", "ya29.LEAK", "visibility"]) {
      expect(sent).not.toContain(needle);
    }
    // But the safe, useful bits ARE present.
    expect(sent).toContain("Gmail");
    expect(sent).toContain("DISCONNECTED");
  });

  it("maps a model failure to MODEL_FAILED (never trusts the model)", async () => {
    const client = clientReturning({
      ok: false,
      modelId: "gpt-4.1-mini",
      feature: "explanation",
      failureCode: "NOT_CONFIGURED",
      message: "no key",
    });
    const res = await explainWorkflowDiagnosis({ dto, modelClient: client });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("MODEL_FAILED");
  });

  it("maps non-JSON model text to PARSE_FAILED", async () => {
    const res = await explainWorkflowDiagnosis({ dto, modelClient: clientReturning(success("not json {")) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PARSE_FAILED");
  });

  it("maps a wrong-shape JSON object to PARSE_FAILED", async () => {
    const res = await explainWorkflowDiagnosis({ dto, modelClient: clientReturning(success(okText({ foo: 1 }))) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PARSE_FAILED");
  });
});
