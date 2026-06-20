/**
 * React Agent boundary — behavior (REACT-AGENT-CS-1-SERVICE-BOUNDARY).
 *
 * CS-1 is a no-op seam: scope validation + safe rejections, no model/tool/mutation.
 */
import {
  dispatchReactAgentRequest,
  isValidReactAgentScope,
  reactAgentService,
  RECOGNIZED_REACT_AGENT_INTENTS,
  type ReactAgentRequest,
  type ReactAgentScope,
} from "@/services/ai/reactAgent";

const okScope: ReactAgentScope = { userId: "u1", accountId: "acc1" };

function req(
  intent: ReactAgentRequest["intent"],
  scope: ReactAgentScope = okScope,
  text = "why won't this run?",
): ReactAgentRequest {
  return { scope, intent, input: { text } };
}

describe("ReactAgent boundary — scope validation", () => {
  it("requires a non-blank userId AND accountId", () => {
    expect(isValidReactAgentScope(okScope)).toBe(true);
    expect(isValidReactAgentScope(undefined)).toBe(false);
    expect(isValidReactAgentScope({ userId: "", accountId: "acc1" })).toBe(false);
    expect(isValidReactAgentScope({ userId: "u1", accountId: "" })).toBe(false);
    expect(isValidReactAgentScope({ userId: "  ", accountId: "acc1" })).toBe(false);
    // @ts-expect-error — accountId is required by the type; runtime guard still rejects.
    expect(isValidReactAgentScope({ userId: "u1" })).toBe(false);
  });

  it("rejects a request with invalid scope (safe copy, ok:false)", async () => {
    const res = await dispatchReactAgentRequest(
      req("answer_diagnosis_question", { userId: "", accountId: "" }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("invalid_scope");
  });
});

describe("ReactAgent boundary — intent dispatch (CS-1 no-op)", () => {
  it("rejects unknown / unrecognized intents as unsupported", async () => {
    const res = await dispatchReactAgentRequest(req("unknown"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unsupported_intent");
  });

  it.each(RECOGNIZED_REACT_AGENT_INTENTS)(
    "recognized intent '%s' returns not_yet_available in CS-1 (no model/mutation)",
    async (intent) => {
      const res = await dispatchReactAgentRequest(req(intent));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("not_yet_available");
    },
  );

  it("reactAgentService.handle delegates to the dispatcher", async () => {
    const res = await reactAgentService.handle(req("explain_diagnosis"));
    expect(res.ok).toBe(false);
  });
});

describe("ReactAgent boundary — no-leak safe copy", () => {
  it("every fallback message is plain English with no ids/tokens/reference syntax", async () => {
    const messages: string[] = [];
    for (const intent of [...RECOGNIZED_REACT_AGENT_INTENTS, "unknown"] as const) {
      const res = await dispatchReactAgentRequest(req(intent));
      messages.push(res.message);
    }
    const invalid = await dispatchReactAgentRequest(
      req("explain_diagnosis", { userId: "", accountId: "" }),
    );
    messages.push(invalid.message);

    for (const m of messages) {
      expect(m.length).toBeGreaterThan(0);
      expect(m).not.toMatch(/\{\{|\}\}/); // no {{ref}} template syntax
      expect(m).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i); // no uuid
      expect(m).not.toMatch(/Bearer\s|sk-|eyJ|token=|secret/i); // no token/secret shapes
      expect(m).not.toContain("acc1");
      expect(m).not.toContain("u1");
    }
  });
});
