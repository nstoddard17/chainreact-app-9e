/**
 * React Agent boundary — behavior (REACT-AGENT-CS-1-SERVICE-BOUNDARY).
 *
 * CS-1 is a no-op seam: scope validation + safe rejections, no model/tool/mutation.
 */
import {
  dispatchReactAgentRequest,
  isValidReactAgentScope,
  reactAgentService,
  runAuthorizedCapability,
  REACT_AGENT_CAPABILITIES,
  getReactAgentCapability,
  RECOGNIZED_REACT_AGENT_INTENTS,
  type ReactAgentCapabilityId,
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

describe("ReactAgent capability registry (CS-3)", () => {
  it("registers diagnosis_qa as a read-only, workflow_qa-gated capability for answer_diagnosis_question", () => {
    const cap = getReactAgentCapability("diagnosis_qa");
    expect(cap).toBeDefined();
    expect(cap).toMatchObject({
      id: "diagnosis_qa",
      allowedIntent: "answer_diagnosis_question",
      mode: "read_only",
      creditFeature: "workflow_qa",
    });
  });

  it("returns undefined for an unregistered capability id", () => {
    expect(getReactAgentCapability("totally_made_up")).toBeUndefined();
  });

  it("every registry entry's id matches its key and declares a single allowed intent", () => {
    for (const [key, def] of Object.entries(REACT_AGENT_CAPABILITIES)) {
      expect(def.id).toBe(key);
      expect(typeof def.allowedIntent).toBe("string");
    }
  });
});

describe("ReactAgent boundary — runAuthorizedCapability (CS-3 registry-gated seam)", () => {
  const QA = {
    scope: okScope,
    intent: "answer_diagnosis_question" as const,
    capabilityId: "diagnosis_qa" as const,
  };

  it("runs exec and returns its EXACT result for a registered capability + matching intent", async () => {
    const exec = jest.fn().mockResolvedValue({ ok: true, answer: "no trigger" });
    const outcome = await runAuthorizedCapability({ ...QA, exec });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: true, result: { ok: true, answer: "no trigger" } });
  });

  it("does NOT run exec for an UNKNOWN capability → unknown_capability", async () => {
    const exec = jest.fn().mockResolvedValue("nope");
    const outcome = await runAuthorizedCapability({
      ...QA,
      capabilityId: "made_up" as unknown as ReactAgentCapabilityId,
      exec,
    });
    expect(exec).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("unknown_capability");
  });

  it("does NOT run exec when intent does not match the capability's allowedIntent → intent_mismatch", async () => {
    const exec = jest.fn().mockResolvedValue("nope");
    const outcome = await runAuthorizedCapability({
      ...QA,
      intent: "propose_repair",
      exec,
    });
    expect(exec).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("intent_mismatch");
  });

  it("does NOT run exec when scope is invalid (no side effect) → invalid_scope", async () => {
    const exec = jest.fn().mockResolvedValue("nope");
    const outcome = await runAuthorizedCapability({
      ...QA,
      scope: { userId: "", accountId: "acc1" },
      exec,
    });
    expect(exec).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("invalid_scope");
  });

  it("a rejection never leaks the capability id / intent in its message", async () => {
    const outcome = await runAuthorizedCapability({
      ...QA,
      capabilityId: "secret_thing" as unknown as ReactAgentCapabilityId,
      exec: async () => "x",
    });
    if (!outcome.ok) {
      expect(outcome.message).not.toContain("secret_thing");
      expect(outcome.message).not.toContain("answer_diagnosis_question");
    }
  });

  it("is exposed on reactAgentService and propagates the brain result", async () => {
    const outcome = await reactAgentService.runAuthorizedCapability({
      ...QA,
      exec: async () => ({ ok: false, code: "MODEL_FAILED" }),
    });
    expect(outcome).toEqual({ ok: true, result: { ok: false, code: "MODEL_FAILED" } });
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
