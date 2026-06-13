/**
 * Tests for the AI-REPAIR-1b LLM repair-proposal service
 * (`services/ai/repair/planWorkflowRepair.ts`).
 *
 * The model client is INJECTED (no network). These pin: the request shape sent to
 * the model (feature/tier/tool/messages), prompt no-leak (no node/workflow/run ids
 * or planted secrets), the no-apply/no-run safety rule in the system prompt, strict
 * re-validation of the model's structured output, the server-set immutable
 * notApplied notice, and safe handling of model + parse failures. Proposal-only —
 * the service produces no patch and mutates nothing.
 */
import {
  planWorkflowRepair,
  PROPOSE_WORKFLOW_REPAIR_TOOL_NAME,
  REPAIR_NOT_APPLIED_NOTICE,
} from "@/services/ai/repair/planWorkflowRepair";
import type { ModelClient, ModelGenerateInput, ModelResult } from "@/core/ai/modelTypes";

function clientReturning(result: ModelResult): ModelClient {
  return { generateStructuredJson: async () => result };
}

/** A client that captures the request it was sent. */
function capturingClient(): { client: ModelClient; lastInput: () => ModelGenerateInput } {
  let captured: ModelGenerateInput | undefined;
  const client: ModelClient = {
    generateStructuredJson: async (input) => {
      captured = input;
      return success(okText({ summary: "x", riskLevel: "low" }));
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
  feature: "repair",
  text,
  finishReason: "stop",
  usage: { inputTokens: 20, outputTokens: 60 },
  latencyMs: 9,
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

describe("planWorkflowRepair (AI-REPAIR-1b)", () => {
  it("returns the validated proposal + model meta on success, with the server-set notApplied notice", async () => {
    const client = clientReturning(
      success(
        okText({
          summary: "Gmail is disconnected; reconnect it, then re-check.",
          recommendedActions: ["Reconnect the Gmail account", "Re-run Check workflow"],
          affectedNodes: ["Gmail — Send Email"],
          missingInfo: ["Which Gmail account should this use?"],
          riskLevel: "low",
          canAutoPatchLater: false,
          requiresUserAction: true,
        }),
      ),
    );
    const res = await planWorkflowRepair({ dto, modelClient: client });
    expect(res).toMatchObject({
      ok: true,
      proposal: {
        summary: "Gmail is disconnected; reconnect it, then re-check.",
        recommendedActions: ["Reconnect the Gmail account", "Re-run Check workflow"],
        affectedNodes: ["Gmail — Send Email"],
        missingInfo: ["Which Gmail account should this use?"],
        riskLevel: "low",
        canAutoPatchLater: false,
        requiresUserAction: true,
        // Server-set — NOT from the model.
        notAppliedNotice: REPAIR_NOT_APPLIED_NOTICE,
      },
      model: { modelId: "gpt-4.1-mini", tier: "fast", usage: { inputTokens: 20, outputTokens: 60 } },
    });
  });

  it("defaults the optional arrays/booleans + always sets notAppliedNotice from a minimal proposal", async () => {
    const res = await planWorkflowRepair({
      dto,
      modelClient: clientReturning(success(okText({ summary: "Fix the trigger.", riskLevel: "medium" }))),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.proposal).toMatchObject({
        recommendedActions: [],
        affectedNodes: [],
        missingInfo: [],
        canAutoPatchLater: false,
        requiresUserAction: false,
        notAppliedNotice: REPAIR_NOT_APPLIED_NOTICE,
      });
    }
  });

  it("sends feature=repair, tier=fast, the repair tool, and a system+user message", async () => {
    const cap = capturingClient();
    await planWorkflowRepair({ dto, modelClient: cap.client });
    const req = cap.lastInput();
    expect(req.feature).toBe("repair");
    expect(req.tier).toBe("fast");
    expect(req.responseTool?.name).toBe(PROPOSE_WORKFLOW_REPAIR_TOOL_NAME);
    expect(req.messages).toHaveLength(2);
    expect(req.messages[0]!.role).toBe("system");
    expect(req.messages[1]!.role).toBe("user");
  });

  it("the system prompt forbids claiming any change/fix/apply/save/repair/run", async () => {
    const cap = capturingClient();
    await planWorkflowRepair({ dto, modelClient: cap.client });
    const system = cap.lastInput().messages[0]!.content.toLowerCase();
    // The core safety claim: it cannot and did not change/fix/apply/save/repair/run anything.
    expect(system).toMatch(/cannot and did not change, fix, apply, save, repair, or run/);
    expect(system).toContain("suggestions");
  });

  it("the prompt contains ONLY the allow-listed context — no node/workflow/run ids or planted secrets", async () => {
    const cap = capturingClient();
    await planWorkflowRepair({ dto, modelClient: cap.client });
    const sent = JSON.stringify(cap.lastInput().messages);
    for (const needle of ["wf-OPAQUE", "node-OPAQUE", "run-OPAQUE", "accessToken", "ya29.LEAK", "visibility"]) {
      expect(sent).not.toContain(needle);
    }
    // But the safe, useful bits ARE present.
    expect(sent).toContain("Gmail");
    expect(sent).toContain("DISCONNECTED");
  });

  it("maps a model failure to MODEL_FAILED (never trusts the model)", async () => {
    const res = await planWorkflowRepair({
      dto,
      modelClient: clientReturning({
        ok: false,
        modelId: "gpt-4.1-mini",
        feature: "repair",
        failureCode: "NOT_CONFIGURED",
        message: "no key",
      }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("MODEL_FAILED");
  });

  it("maps non-JSON model text to PARSE_FAILED", async () => {
    const res = await planWorkflowRepair({ dto, modelClient: clientReturning(success("not json {")) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PARSE_FAILED");
  });

  it("maps a wrong-shape JSON object (missing required summary/riskLevel) to PARSE_FAILED", async () => {
    const res = await planWorkflowRepair({ dto, modelClient: clientReturning(success(okText({ foo: 1 }))) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PARSE_FAILED");
  });

  it("maps an oversized/over-count output to PARSE_FAILED (bounded re-validation)", async () => {
    const tooManyActions = Array.from({ length: 20 }, (_, i) => `action ${i}`);
    const res = await planWorkflowRepair({
      dto,
      modelClient: clientReturning(
        success(okText({ summary: "x", riskLevel: "low", recommendedActions: tooManyActions })),
      ),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PARSE_FAILED");
  });

  it("rejects an invalid riskLevel enum value → PARSE_FAILED", async () => {
    const res = await planWorkflowRepair({
      dto,
      modelClient: clientReturning(success(okText({ summary: "x", riskLevel: "catastrophic" }))),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PARSE_FAILED");
  });
});
