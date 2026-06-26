/**
 * @jest-environment node
 *
 * Mutation-response normalization — the exact screenshot bug (HERMES-AGENT-WORKFLOW-EDITOR).
 *
 * Marcus asked "Change the Slack notification to an email instead." and React leaked the raw operations
 * JSON into the rail AND chose `gmail:send_email` while ALSO asking "Gmail or Outlook?". These tests pin
 * the normalizer fixes:
 *   - a mutation-shaped fenced block is ALWAYS stripped from the user-facing text (no raw JSON leak),
 *   - operations + a clarification question = contradiction → prefer clarification, DROP the operations,
 *   - a mutation block that can't become a usable patch flags `mutationMalformed` (no silent leak),
 *   - common loose model op encodings are coerced so a well-intentioned reply still validates.
 */

import { normalizeGatewayResponse } from "@/services/ai-guidance/gateway/gatewayResponseContract";

function envelope(content: string): unknown {
  return { ok: true, response: { choices: [{ message: { content } }] } };
}

/** The EXACT shape from Marcus's screenshot: loose `{opName:{...}}` + providerType + a Gmail/Outlook question. */
const SCREENSHOT_CONTENT =
  "I can switch the notification to email — should I use Gmail or Outlook? Tell me which and I'll update the preview.\n\n" +
  "```json\n" +
  JSON.stringify({
    editVersion: "47e9a55f",
    operations: [
      { removeEdge: { edgeId: "edge_1" } },
      { removeNode: { nodeId: "node_2" } },
      { addNode: { nodeId: "new_email", providerType: "gmail:send_email" } },
      { addEdge: { edgeId: "edge_2", from: "node_1", to: "new_email" } },
    ],
  }) +
  "\n```";

describe("normalizeGatewayResponse — mutation rail safety", () => {
  it("the screenshot reply: strips the JSON, drops the contradictory patch, keeps ONLY the question", () => {
    const n = normalizeGatewayResponse(envelope(SCREENSHOT_CONTENT));
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    // 1. No raw machine JSON in the rail text.
    expect(n.guidanceText).not.toContain("```");
    expect(n.guidanceText).not.toMatch(/"operations"|"editVersion"|providerType|edge_1|node_2|new_email/);
    // 2. The clarification question survives.
    expect(n.guidanceText).toMatch(/gmail or outlook/i);
    // 3. Contradiction → NO operations proposed (clarification wins), and it is not flagged malformed.
    expect(n.mutationOperations).toBeUndefined();
    expect(n.mutationMalformed).toBeFalsy();
  });

  it("a committed edit (prose + valid loose ops, NO question) → ops extracted + JSON stripped", () => {
    const content =
      "Replacing the Slack step with a Gmail email step.\n\n```json\n" +
      JSON.stringify({
        editVersion: "abc12345",
        operations: [
          { op: "removeNode", nodeId: "node_2" },
          { addNode: { nodeId: "new_email", providerType: "gmail:send_email" } },
          { addEdge: { edgeId: "e1", from: "node_1", to: "new_email" } },
        ],
      }) +
      "\n```";
    const n = normalizeGatewayResponse(envelope(content));
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.guidanceText).not.toContain("```");
    expect(n.guidanceText).not.toMatch(/operations|providerType/);
    expect(n.mutationOperations).toHaveLength(3);
    expect(n.mutationBaseVersion).toBe("abc12345");
    // The loose addNode coerced into a proper WorkflowNode (provider/type split from providerType).
    const addNode = n.mutationOperations!.find((o) => o.op === "addNode") as { node: { provider: string; type: string; kind: string } };
    expect(addNode.node).toMatchObject({ provider: "gmail", type: "send_email", kind: "action" });
  });

  it("a mutation-shaped block that can't validate (no question) → stripped + flagged malformed (no leak)", () => {
    const content =
      "Here's the change.\n\n```json\n" +
      JSON.stringify({ editVersion: "deadbeef", operations: [{ frobnicate: { whatever: 1 } }] }) +
      "\n```";
    const n = normalizeGatewayResponse(envelope(content));
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.guidanceText).not.toContain("```");
    expect(n.guidanceText).not.toContain("frobnicate");
    expect(n.mutationOperations).toBeUndefined();
    expect(n.mutationMalformed).toBe(true);
  });

  it("a reply that is ONLY the JSON block → stripped to a neutral, JSON-free lead-in", () => {
    const content =
      "```json\n" +
      JSON.stringify({ editVersion: "feedface", operations: [{ op: "removeNode", nodeId: "node_2" }] }) +
      "\n```";
    const n = normalizeGatewayResponse(envelope(content));
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.guidanceText).not.toContain("{");
    expect(n.guidanceText).not.toContain("removeNode");
    expect(n.mutationOperations).toHaveLength(1);
  });
});
