/**
 * Tests for the AI-DIAG-QA-2 LLM answerer service
 * (`services/ai/diagnostics/answerWorkflowQuestion.ts`).
 *
 * The model client is INJECTED (no network). These pin: the request shape (tier/tool/
 * messages incl. the delimited question), prompt no-leak (no node/workflow/run ids or
 * planted secrets), the safe selected-node summary passthrough, strict re-validation of
 * the structured output, the needsUserDecision passthrough, and safe model/parse-failure
 * handling.
 */
import {
  answerWorkflowQuestion,
  DIAGNOSIS_QA_TOOL_NAME,
} from "@/services/ai/diagnostics/answerWorkflowQuestion";
import type { ModelClient, ModelGenerateInput, ModelResult } from "@/core/ai/modelTypes";

function clientReturning(result: ModelResult): ModelClient {
  return { generateStructuredJson: async () => result };
}
function capturingClient(): { client: ModelClient; lastInput: () => ModelGenerateInput } {
  let captured: ModelGenerateInput | undefined;
  const client: ModelClient = {
    generateStructuredJson: async (input) => {
      captured = input;
      return success(okText({ answer: "x" }));
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
} as never;

const QUESTION = "Why won't this run?";

describe("answerWorkflowQuestion (AI-DIAG-QA-2)", () => {
  it("returns the validated answer + pointers + needsUserDecision + model meta on success", async () => {
    const client = clientReturning(
      success(okText({ answer: "Gmail is disconnected; reconnect it.", pointers: ["Reconnect Gmail"], needsUserDecision: false })),
    );
    const res = await answerWorkflowQuestion({ dto, question: QUESTION, modelClient: client });
    expect(res).toMatchObject({
      ok: true,
      answer: "Gmail is disconnected; reconnect it.",
      pointers: ["Reconnect Gmail"],
      needsUserDecision: false,
      model: { modelId: "gpt-4.1-mini", tier: "fast", usage: { inputTokens: 12, outputTokens: 34 } },
    });
  });

  it("sends tier=fast, the QA tool, and a system + context + delimited-question message", async () => {
    const cap = capturingClient();
    await answerWorkflowQuestion({ dto, question: QUESTION, modelClient: cap.client });
    const req = cap.lastInput();
    expect(req.tier).toBe("fast");
    expect(req.responseTool?.name).toBe(DIAGNOSIS_QA_TOOL_NAME);
    expect(req.messages).toHaveLength(3);
    expect(req.messages[0]!.role).toBe("system");
    // The question rides in a delimited user message, marked as data not instructions.
    const last = String(req.messages[2]!.content);
    expect(last).toContain("<<<USER_QUESTION>>>");
    expect(last).toContain(QUESTION);
  });

  it("the prompt contains ONLY allow-listed context — no node/workflow/run ids or planted secrets", async () => {
    const cap = capturingClient();
    await answerWorkflowQuestion({ dto, question: QUESTION, modelClient: cap.client });
    const sent = JSON.stringify(cap.lastInput().messages);
    for (const needle of ["wf-OPAQUE", "node-OPAQUE", "run-OPAQUE", "accessToken", "ya29.LEAK", "visibility"]) {
      expect(sent).not.toContain(needle);
    }
    expect(sent).toContain("Gmail");
    expect(sent).toContain("DISCONNECTED");
  });

  it("forwards a SAFE selected-node summary into the model context (paths/types only)", async () => {
    const cap = capturingClient();
    await answerWorkflowQuestion({
      dto,
      question: "what data is available here?",
      selectedNode: { available: [{ path: "message.text", type: "string", description: "The text", sensitive: false }], truncated: false },
      modelClient: cap.client,
    });
    const sent = JSON.stringify(cap.lastInput().messages);
    expect(sent).toContain("message.text");
    // Still no ids/tokens leak alongside it.
    expect(sent).not.toContain("node-OPAQUE");
  });

  it("maps a model failure to MODEL_FAILED (never trusts the model)", async () => {
    const res = await answerWorkflowQuestion({
      dto,
      question: QUESTION,
      modelClient: clientReturning({ ok: false, modelId: "gpt-4.1-mini", feature: "explanation", failureCode: "NOT_CONFIGURED", message: "no key" }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("MODEL_FAILED");
  });

  it("maps non-JSON model text to PARSE_FAILED", async () => {
    const res = await answerWorkflowQuestion({ dto, question: QUESTION, modelClient: clientReturning(success("not json {")) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PARSE_FAILED");
  });

  it("maps a wrong-shape JSON object (missing answer) to PARSE_FAILED", async () => {
    const res = await answerWorkflowQuestion({ dto, question: QUESTION, modelClient: clientReturning(success(okText({ pointers: ["x"] }))) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PARSE_FAILED");
  });

  it("passes through needsUserDecision=true (intent-required answer)", async () => {
    const res = await answerWorkflowQuestion({
      dto,
      question: "Should I delete this step?",
      modelClient: clientReturning(success(okText({ answer: "I can't safely decide that — it depends on whether you still need it.", needsUserDecision: true }))),
    });
    expect(res).toMatchObject({ ok: true, needsUserDecision: true });
  });
});
