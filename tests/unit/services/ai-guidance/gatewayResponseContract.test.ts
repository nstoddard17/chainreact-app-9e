/**
 * @jest-environment node
 *
 * Hermes Agent gateway response contract (HERMES-AGENT-RESPONSE-CONTRACT).
 * Tests `normalizeGatewayResponse` directly: the live OpenAI-style envelope normalizes to
 * guidanceText; unknown extra fields are ignored; usage is sanitized; malformed / missing choices /
 * missing content / empty content fail closed; {ok:false} maps to a typed provider error; no secret
 * values are copied into the normalized output; advisory only (workflowPlan null; never mutates).
 */

import {
  normalizeGatewayResponse,
  gatewaySuccessEnvelopeSchema,
  PLAN_NOT_VALIDATED_WARNING,
} from "@/services/ai-guidance/gateway/gatewayResponseContract";
import { listAllActionMetas, listAllTriggerMetas } from "@/services/discovery/_registry";

/** The known live success envelope. */
function envelope(content: string, extra: Record<string, unknown> = {}): unknown {
  return {
    ok: true,
    response: { choices: [{ message: { content } }], usage: { prompt_tokens: 13253, completion_tokens: 49, total_tokens: 13302 } },
    ...extra,
  };
}

/** Real, registry-known capability keys so a plan passes validateWorkflowPlan. */
const realAction = listAllActionMetas()[0]!;
const realTrigger = listAllTriggerMetas()[0]!;

function fencedPlan(plan: unknown): string {
  return "Here is how to approach it.\n\n```json\n" + JSON.stringify(plan) + "\n```\n\nLet me know if that helps.";
}

describe("normalizeGatewayResponse — success", () => {
  it("normalizes the live OpenAI-style envelope to advisory guidanceText", () => {
    const n = normalizeGatewayResponse(envelope("Hello!"));
    expect(n.ok).toBe(true);
    if (n.ok) {
      expect(n.guidanceText).toBe("Hello!");
      expect(n.source).toBe("hermes-agent");
      expect(n.workflowPlan).toBeNull(); // advisory text only — no plan accepted this slice
    }
  });

  it("ignores unknown extra fields (top-level + nested) and never copies them out", () => {
    const raw = envelope("content here", { surprise: { secret: "should-not-appear" }, model: "hermes-agent" });
    (raw as { response: Record<string, unknown> }).response.id = "chatcmpl-xyz";
    const n = normalizeGatewayResponse(raw);
    expect(n.ok).toBe(true);
    expect(JSON.stringify(n)).not.toContain("should-not-appear");
    expect(JSON.stringify(n)).not.toContain("chatcmpl-xyz");
  });

  it("sanitizes usage to numeric token counts only (not trusted for billing)", () => {
    const n = normalizeGatewayResponse(envelope("hi"));
    expect(n.ok).toBe(true);
    if (n.ok) expect(n.rawUsage).toEqual({ promptTokens: 13253, completionTokens: 49, totalTokens: 13302 });
  });

  it("omits rawUsage when the envelope has no usage", () => {
    const n = normalizeGatewayResponse({ ok: true, response: { choices: [{ message: { content: "hi" } }] } });
    expect(n.ok).toBe(true);
    if (n.ok) expect(n.rawUsage).toBeUndefined();
  });

  it("warns when multiple choices are returned (uses the first)", () => {
    const n = normalizeGatewayResponse({
      ok: true,
      response: { choices: [{ message: { content: "first" } }, { message: { content: "second" } }] },
    });
    expect(n.ok).toBe(true);
    if (n.ok) {
      expect(n.guidanceText).toBe("first");
      expect(n.warnings).toContain("multiple_choices_truncated");
    }
  });
});

describe("normalizeGatewayResponse — fail closed", () => {
  it("malformed envelope → INVALID_RESPONSE", () => {
    expect(normalizeGatewayResponse({ totally: "wrong" })).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    expect(normalizeGatewayResponse("a plain string")).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    expect(normalizeGatewayResponse(null)).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("missing choices → INVALID_RESPONSE", () => {
    expect(normalizeGatewayResponse({ ok: true, response: {} })).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    expect(normalizeGatewayResponse({ ok: true, response: { choices: [] } })).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("missing message/content → INVALID_RESPONSE", () => {
    expect(normalizeGatewayResponse({ ok: true, response: { choices: [{}] } })).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    expect(normalizeGatewayResponse({ ok: true, response: { choices: [{ message: {} }] } })).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("empty / whitespace content → INVALID_RESPONSE", () => {
    expect(normalizeGatewayResponse(envelope(""))).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    expect(normalizeGatewayResponse(envelope("   \n\t  "))).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("gateway {ok:false} envelope → typed PROVIDER_ERROR with the safe code only", () => {
    const n = normalizeGatewayResponse({
      ok: false,
      error: "HERMES_AGENT_ERROR",
      response: { error: { message: "HTTP 401: Missing Authentication header" } },
    });
    expect(n).toMatchObject({ ok: false, code: "PROVIDER_ERROR", reason: "HERMES_AGENT_ERROR" });
    expect(JSON.stringify(n)).not.toContain("Missing Authentication");
  });

  it("a plan-like object with unknown capabilities fails CLOSED (never accepts arbitrary JSON as a plan)", () => {
    const raw = envelope("here", { plan: { steps: [{ ref: "s0", role: "action", provider: "totally-fake", type: "nope" }] } });
    expect(normalizeGatewayResponse(raw)).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });
});

describe("normalizeGatewayResponse — embedded plan extraction (HERMES-AGENT-PLAN-EXTRACTION)", () => {
  it("prose-only guidance leaves workflowPlan null", () => {
    const n = normalizeGatewayResponse(envelope("Connect Gmail, then add a Slack step. No JSON here."));
    expect(n.ok).toBe(true);
    if (n.ok) {
      expect(n.workflowPlan).toBeNull();
      expect(n.guidanceText).toContain("Connect Gmail");
    }
  });

  it("a valid fenced WorkflowPlan is extracted, capability-validated, and returned (notApplied true)", () => {
    const plan = {
      title: "Lead follow-up",
      summary: "Watch then notify.",
      steps: [
        { ref: "s0", role: "trigger", provider: realTrigger.provider, type: realTrigger.type, purpose: "start" },
        { ref: "s1", role: "action", provider: realAction.provider, type: realAction.type, purpose: "do" },
      ],
    };
    const n = normalizeGatewayResponse(envelope(fencedPlan(plan)));
    expect(n.ok).toBe(true);
    if (n.ok) {
      expect(n.workflowPlan).not.toBeNull();
      expect(n.workflowPlan!.notApplied).toBe(true);
      expect(n.workflowPlan!.steps).toHaveLength(2);
      // The raw JSON block is stripped from the display text; prose is preserved.
      expect(n.guidanceText).toContain("Here is how to approach it.");
      expect(n.guidanceText).not.toContain("```");
      expect(n.warnings ?? []).not.toContain(PLAN_NOT_VALIDATED_WARNING);
    }
  });

  it("an embedded plan with hallucinated capabilities → workflowPlan null + safe warning, guidance kept", () => {
    const plan = { title: "x", steps: [{ ref: "s0", role: "action", provider: "totallymadeup", type: "do_magic", purpose: "x" }] };
    const n = normalizeGatewayResponse(envelope(fencedPlan(plan)));
    expect(n.ok).toBe(true);
    if (n.ok) {
      expect(n.workflowPlan).toBeNull();
      expect(n.warnings).toContain(PLAN_NOT_VALIDATED_WARNING);
      expect(n.guidanceText).toContain("Here is how to approach it.");
    }
  });

  it("malformed JSON in a fence is ignored (plan null, guidance intact, no throw)", () => {
    const n = normalizeGatewayResponse(envelope("Try this.\n\n```json\n{ broken,,, }\n```\n\nDone."));
    expect(n.ok).toBe(true);
    if (n.ok) {
      expect(n.workflowPlan).toBeNull();
      expect(n.guidanceText).toContain("Try this.");
    }
  });

  it("multiple JSON blocks: a non-plan block is skipped and a valid plan is still found", () => {
    const example = "```json\n" + JSON.stringify({ example: true }) + "\n```";
    const plan = { steps: [{ role: "trigger", provider: realTrigger.provider, type: realTrigger.type, purpose: "start" }] };
    const content = "Context.\n\n" + example + "\n\n```json\n" + JSON.stringify(plan) + "\n```";
    const n = normalizeGatewayResponse(envelope(content));
    expect(n.ok).toBe(true);
    if (n.ok) expect(n.workflowPlan).not.toBeNull();
  });

  it("the surfaced plan is advisory only — notApplied true and no apply/exec field leaks", () => {
    const plan = { steps: [{ role: "action", provider: realAction.provider, type: realAction.type, purpose: "do" }] };
    const n = normalizeGatewayResponse(envelope(fencedPlan(plan)));
    expect(n.ok).toBe(true);
    if (n.ok && n.workflowPlan) {
      expect(n.workflowPlan.notApplied).toBe(true);
      const s = JSON.stringify(n.workflowPlan);
      for (const needle of ["applied", "executed", "saved", "created", "draftDefinition"]) {
        expect(s).not.toContain(needle);
      }
    }
  });
});

describe("gatewaySuccessEnvelopeSchema — strict on the known shape", () => {
  it("accepts the live shape and rejects a bare choices object (no ok/response wrapper)", () => {
    expect(gatewaySuccessEnvelopeSchema.safeParse(envelope("hi")).success).toBe(true);
    expect(gatewaySuccessEnvelopeSchema.safeParse({ choices: [{ message: { content: "x" } }] }).success).toBe(false);
  });
});
