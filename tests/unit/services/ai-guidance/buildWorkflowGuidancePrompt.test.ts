/**
 * @jest-environment node
 *
 * Safe-DTO prompt builder (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 * Proves the prompt sent to the brain carries no node config/secret/id, redacts pasted secrets
 * from the user's goal text, and instructs the brain to use only listed capabilities + never apply.
 */

import { buildWorkflowGuidancePrompt, redactSecretsFromText } from "@/services/ai-guidance/buildWorkflowGuidancePrompt";
import { sanitizeWorkflowForGuidance } from "@/services/ai-guidance/sanitizeWorkflowForGuidance";
import type { WorkflowDefinition } from "@/contracts/workflow";

const SECRET = "xoxb-PROMPT-SECRET-TOKEN-aa11bb22";
const dirtyDef = {
  nodes: [
    { id: "REAL_TRIGGER_ID", kind: "trigger", provider: "stripe", type: "payment_failed", config: { apiKey: SECRET, webhook: "https://x" }, label: "Private label", position: { x: 0, y: 0 } },
    { id: "REAL_ACTION_ID", kind: "action", provider: "gmail", type: "send_email", config: { to: "ceo@example.com", body: "confidential $4.2M" }, position: { x: 0, y: 200 } },
  ],
  edges: [],
} as unknown as WorkflowDefinition;

describe("redactSecretsFromText", () => {
  it("redacts common secret/token shapes", () => {
    const out = redactSecretsFromText(`token ${SECRET} key sk-abcdefghijklmnop1234 jwt eyJabcdefghijklmnopqrstuv
hex deadbeefdeadbeefdeadbeefdeadbeef`);
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain("sk-abcdefghijklmnop1234");
    expect(out).not.toContain("deadbeefdeadbeefdeadbeefdeadbeef");
    expect(out).toContain("[redacted]");
  });
});

describe("buildWorkflowGuidancePrompt — no secret/config/id leaves", () => {
  const { request } = sanitizeWorkflowForGuidance({ definition: dirtyDef, guidanceKind: "repair_suggestion" });
  const catalog = ["stripe:payment_failed", "gmail:send_email"];

  it("messages contain NO node config value, secret, label, or real id", () => {
    const messages = buildWorkflowGuidancePrompt({ request, capabilityCatalog: catalog, goalText: "Notify me when a Stripe payment fails" });
    const s = JSON.stringify(messages);
    // (the literal word "config" legitimately appears in the system prompt's "no config VALUES"
    // rule — assert no config KEY NAMES or VALUES from the workflow leak instead.)
    for (const needle of [SECRET, "ceo@example.com", "confidential", "$4.2M", "apiKey", "webhook", "Private label", "REAL_TRIGGER_ID", "REAL_ACTION_ID"]) {
      expect(s).not.toContain(needle);
    }
  });

  it("redacts a pasted secret in the user goal text before sending", () => {
    const messages = buildWorkflowGuidancePrompt({ request, capabilityCatalog: catalog, goalText: `email me, my key is ${SECRET}` });
    const s = JSON.stringify(messages);
    expect(s).not.toContain(SECRET);
    expect(s).toContain("[redacted]");
  });

  it("includes the capability catalog + advisory/no-apply hard rules; keeps the (safe) shape", () => {
    const messages = buildWorkflowGuidancePrompt({ request, capabilityCatalog: catalog, goalText: "help" });
    const s = JSON.stringify(messages);
    expect(s).toContain("stripe:payment_failed");
    expect(s).toContain("gmail:send_email");
    expect(messages[0]!.role).toBe("system");
    expect(messages[0]!.content).toMatch(/do NOT create, change, save, run, or apply/i);
    expect(messages[0]!.content).toMatch(/ONLY steps whose .*appears in the provided capability catalog/i);
    // The generalized shape (kind/provider/type) IS allowed — it's capability, not user data.
    expect(s).toContain("stripe:payment_failed");
  });
});
