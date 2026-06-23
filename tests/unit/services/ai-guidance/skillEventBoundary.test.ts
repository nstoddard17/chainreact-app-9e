/**
 * @jest-environment node
 *
 * Private → global skill-event boundary (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 * Proves a private account-scoped session is NEVER promoted raw into global learning: the
 * sanitized event carries only generalized capability shape + a safe outcome — no account/user/
 * workflow/session id, no raw turn text, no PII/secret.
 */

import { toSanitizedSkillEvent } from "@/services/ai-guidance/skillEventBoundary";
import type { GuidanceSession, WorkflowPlan } from "@/contracts/guidanceSession";

const PRIVATE = {
  accountId: "acct-PRIVATE-123",
  userId: "user-PRIVATE-456",
  workflowId: "wf-PRIVATE-789",
  sessionId: "sess-PRIVATE-000",
  email: "ceo.private@example.com",
  secret: ["xoxb", "LEAKED", "TOKEN", "9f3a"].join("-"),
  name: "Jane Q. Confidential",
};

const session: GuidanceSession = {
  id: PRIVATE.sessionId,
  accountId: PRIVATE.accountId,
  userId: PRIVATE.userId,
  workflowId: PRIVATE.workflowId,
  status: "planned",
  createdAt: "2026-06-20T00:00:00Z",
  turns: [
    { id: "t1", role: "user", text: `Email ${PRIVATE.email} when a payment fails. My token is ${PRIVATE.secret}. — ${PRIVATE.name}`, createdAt: "x" },
    { id: "t2", role: "assistant", text: "Sure, here's a plan that mentions Jane and the private channel.", createdAt: "x" },
  ],
};

const plan: WorkflowPlan = {
  schemaVersion: 1, title: "Notify on failed payment", summary: "...", notApplied: true,
  steps: [
    { ref: "s0", role: "trigger", provider: "stripe", type: "payment_failed", purpose: "start" },
    { ref: "s1", role: "action", provider: "gmail", type: "send_email", purpose: "notify", requiredInputs: ["to", "subject"] },
  ],
};

describe("toSanitizedSkillEvent — no private promotion to global", () => {
  it("emits only generalized capability shape + outcome", () => {
    const evt = toSanitizedSkillEvent({ session, plan, eventKind: "workflow_plan_proposed", outcome: "proposed" });
    expect(evt.steps).toEqual([
      { role: "trigger", provider: "stripe", type: "payment_failed" },
      { role: "action", provider: "gmail", type: "send_email" },
    ]);
    expect(evt.stepCount).toBe(2);
    expect(evt.providers).toEqual(["gmail", "stripe"]);
    expect(evt.eventKind).toBe("workflow_plan_proposed");
    expect(evt.outcome).toBe("proposed");
  });

  it("serialized event contains NONE of the private session data", () => {
    const evt = toSanitizedSkillEvent({ session, plan, eventKind: "workflow_plan_accepted", outcome: "accepted" });
    const s = JSON.stringify(evt);
    for (const needle of Object.values(PRIVATE)) {
      expect(s).not.toContain(needle);
    }
    // ...and no raw turn text / required-input field names either.
    expect(s).not.toContain("payment fails");
    expect(s).not.toContain("Jane");
    expect(s).not.toContain("requiredInputs");
    expect(s).not.toContain("subject");
  });

  it("the event shape has NO private identifier or text keys", () => {
    const evt = toSanitizedSkillEvent({ session, plan, eventKind: "guidance_session_started", outcome: "proposed" });
    const keys = new Set<string>();
    (function walk(v: unknown) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) { keys.add(k); walk(val); }
    })(evt);
    for (const forbidden of ["accountId", "userId", "workflowId", "sessionId", "id", "text", "turns", "goal", "title", "summary", "requiredInputs", "purpose"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("does not mutate the input session or plan", () => {
    const sSnap = JSON.parse(JSON.stringify(session));
    const pSnap = JSON.parse(JSON.stringify(plan));
    toSanitizedSkillEvent({ session, plan, eventKind: "workflow_plan_proposed", outcome: "proposed" });
    expect(session).toEqual(sSnap);
    expect(plan).toEqual(pSnap);
  });
});
