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
} from "@/services/ai-guidance/gateway/gatewayResponseContract";

/** The known live success envelope. */
function envelope(content: string, extra: Record<string, unknown> = {}): unknown {
  return {
    ok: true,
    response: { choices: [{ message: { content } }], usage: { prompt_tokens: 13253, completion_tokens: 49, total_tokens: 13302 } },
    ...extra,
  };
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

describe("gatewaySuccessEnvelopeSchema — strict on the known shape", () => {
  it("accepts the live shape and rejects a bare choices object (no ok/response wrapper)", () => {
    expect(gatewaySuccessEnvelopeSchema.safeParse(envelope("hi")).success).toBe(true);
    expect(gatewaySuccessEnvelopeSchema.safeParse({ choices: [{ message: { content: "x" } }] }).success).toBe(false);
  });
});
