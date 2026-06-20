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

  it("registers diagnosis_explain as a read-only, workflow_explanation-gated capability for explain_diagnosis (CS-4)", () => {
    expect(getReactAgentCapability("diagnosis_explain")).toMatchObject({
      id: "diagnosis_explain",
      allowedIntent: "explain_diagnosis",
      mode: "read_only",
      creditFeature: "workflow_explanation",
      auditKind: "react_agent.diagnosis_explain",
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

  it("each capability's creditFeature matches the feature key its route charges (defense-in-depth)", () => {
    // Lock the registry metadata to the routes' aiCreditGate feature keys so a drift between
    // the route's charged feature and the capability metadata is caught here. A RUNTIME
    // route↔registry cross-check is deferred to the audit slice (kept out of the route to
    // avoid incorrectly blocking it).
    expect(getReactAgentCapability("diagnosis_qa")?.creditFeature).toBe("workflow_qa");
    expect(getReactAgentCapability("diagnosis_explain")?.creditFeature).toBe("workflow_explanation");
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

  it("runs the explain capability through the same seam (CS-4)", async () => {
    const exec = jest.fn().mockResolvedValue({ ok: true, explanation: "needs a trigger" });
    const outcome = await runAuthorizedCapability({
      scope: okScope,
      intent: "explain_diagnosis",
      capabilityId: "diagnosis_explain",
      exec,
    });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: true, result: { ok: true, explanation: "needs a trigger" } });
  });

  it("rejects a registered capability called with the WRONG matching intent (explain id + qa intent)", async () => {
    const exec = jest.fn();
    const outcome = await runAuthorizedCapability({
      scope: okScope,
      intent: "answer_diagnosis_question",
      capabilityId: "diagnosis_explain",
      exec,
    });
    expect(exec).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("intent_mismatch");
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

describe("ReactAgent boundary — runAuthorizedCapability audit emission (CS-5d)", () => {
  const QA = {
    scope: { userId: "u1", accountId: "acc1", workflowId: "wf1" } as ReactAgentScope,
    intent: "answer_diagnosis_question" as const,
    capabilityId: "diagnosis_qa" as const,
  };
  function recorder() {
    const record = jest.fn().mockResolvedValue(undefined);
    return { auditRecorder: { record }, record };
  }

  it("emits ONE success row with the registry+scope fields on a resolved Q&A run", async () => {
    const { auditRecorder, record } = recorder();
    await runAuthorizedCapability({
      ...QA,
      auditRecorder,
      classifyResult: (r: { ok: boolean }) => (r.ok ? "success" : "failed"),
      exec: async () => ({ ok: true, answer: "reconnect gmail" }),
    });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]![0]).toEqual({
      accountId: "acc1",
      actorUserId: "u1",
      workflowId: "wf1",
      conversationId: null,
      capabilityId: "diagnosis_qa",
      intent: "answer_diagnosis_question",
      mode: "read_only",
      creditFeature: "workflow_qa",
      auditKind: "react_agent.diagnosis_qa",
      outcome: "success",
      reason: null,
    });
  });

  it("emits a success row for a resolved Explain run with explain registry fields", async () => {
    const { auditRecorder, record } = recorder();
    await runAuthorizedCapability({
      scope: { userId: "u1", accountId: "acc1", workflowId: "wf1" },
      intent: "explain_diagnosis",
      capabilityId: "diagnosis_explain",
      auditRecorder,
      classifyResult: (r: { ok: boolean }) => (r.ok ? "success" : "failed"),
      exec: async () => ({ ok: true, explanation: "needs a trigger" }),
    });
    expect(record.mock.calls[0]![0]).toMatchObject({
      capabilityId: "diagnosis_explain",
      creditFeature: "workflow_explanation",
      auditKind: "react_agent.diagnosis_explain",
      outcome: "success",
    });
  });

  it("classifyResult maps a resolved brain failure to a `failed` audit (exec still ran)", async () => {
    const { auditRecorder, record } = recorder();
    const outcome = await runAuthorizedCapability({
      ...QA,
      auditRecorder,
      classifyResult: (r: { ok: boolean }) => (r.ok ? "success" : "failed"),
      exec: async () => ({ ok: false, code: "MODEL_FAILED" }),
    });
    // The returned value is UNCHANGED (the brain result passes through verbatim).
    expect(outcome).toEqual({ ok: true, result: { ok: false, code: "MODEL_FAILED" } });
    expect(record.mock.calls[0]![0]).toMatchObject({ outcome: "failed", reason: "exec_failed" });
  });

  it("defaults a resolved run to `success` when no classifier is given", async () => {
    const { auditRecorder, record } = recorder();
    await runAuthorizedCapability({ ...QA, auditRecorder, exec: async () => ({ ok: false }) });
    expect(record.mock.calls[0]![0]).toMatchObject({ outcome: "success" });
  });

  it("invalid scope → emits `denied` (reason invalid_scope) and does NOT run exec", async () => {
    const { auditRecorder, record } = recorder();
    const exec = jest.fn();
    const outcome = await runAuthorizedCapability({
      ...QA,
      scope: { userId: "", accountId: "acc1" },
      auditRecorder,
      exec,
    });
    expect(exec).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]![0]).toMatchObject({ outcome: "denied", reason: "invalid_scope" });
  });

  it("unknown capability → emits `denied` (reason unknown_capability), synthetic auditKind, no exec", async () => {
    const { auditRecorder, record } = recorder();
    const exec = jest.fn();
    await runAuthorizedCapability({
      ...QA,
      capabilityId: "made_up" as unknown as ReactAgentCapabilityId,
      auditRecorder,
      exec,
    });
    expect(exec).not.toHaveBeenCalled();
    expect(record.mock.calls[0]![0]).toMatchObject({
      outcome: "denied",
      reason: "unknown_capability",
      mode: "read_only",
      auditKind: "react_agent.made_up",
      creditFeature: null,
    });
  });

  it("intent mismatch → emits `denied` (reason intent_mismatch) with the real capability fields, no exec", async () => {
    const { auditRecorder, record } = recorder();
    const exec = jest.fn();
    await runAuthorizedCapability({ ...QA, intent: "propose_repair", auditRecorder, exec });
    expect(exec).not.toHaveBeenCalled();
    expect(record.mock.calls[0]![0]).toMatchObject({
      outcome: "denied",
      reason: "intent_mismatch",
      capabilityId: "diagnosis_qa",
      mode: "read_only",
    });
  });

  it("exec throws → emits `failed` (reason exec_error) AND re-throws to preserve route behavior", async () => {
    const { auditRecorder, record } = recorder();
    const boom = new Error("brain exploded: SECRET-INTERNAL");
    await expect(
      runAuthorizedCapability({ ...QA, auditRecorder, exec: async () => { throw boom; } }),
    ).rejects.toBe(boom);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]![0]).toMatchObject({ outcome: "failed", reason: "exec_error" });
    // The audit input carries no raw error text.
    expect(JSON.stringify(record.mock.calls[0]![0])).not.toContain("SECRET-INTERNAL");
  });

  it("a recorder that REJECTS is swallowed at the seam — the capability result is unchanged", async () => {
    const record = jest.fn().mockRejectedValue(new Error("audit ledger down"));
    const outcome = await runAuthorizedCapability({
      ...QA,
      auditRecorder: { record },
      exec: async () => ({ ok: true, answer: "ok" }),
    });
    expect(outcome).toEqual({ ok: true, result: { ok: true, answer: "ok" } });
  });

  it("attaches NO metadata at the seam (no raw question/answer/DTO/config can leak)", async () => {
    const { auditRecorder, record } = recorder();
    await runAuthorizedCapability({
      ...QA,
      auditRecorder,
      exec: async () => ({ ok: true, answer: "the user's private answer" }),
    });
    const input = record.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).not.toHaveProperty("metadata");
    for (const k of ["question", "answer", "dto", "config", "explanation", "payload"]) {
      expect(input).not.toHaveProperty(k);
    }
    expect(JSON.stringify(input)).not.toContain("private answer");
  });

  it("does NOT emit when no recorder is injected (backward-compatible)", async () => {
    // No throw, exec runs, result returned — covered by the CS-3 seam tests above; this
    // asserts the no-recorder path is side-effect-free (nothing to spy, so just exec runs).
    const exec = jest.fn().mockResolvedValue({ ok: true });
    const outcome = await runAuthorizedCapability({ ...QA, exec });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: true, result: { ok: true } });
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
