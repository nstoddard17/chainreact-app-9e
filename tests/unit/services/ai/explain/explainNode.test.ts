/**
 * @jest-environment node
 *
 * Tests for services/ai/explain/explainNode.ts (Slice 4.AI-4).
 *
 * Mocks the AI-2 context tools. The load-bearing test is no-leak: a configured
 * field's raw VALUE must never appear in the explanation — only its STATUS.
 */
const mockGetWorkflowGraphForAI = jest.fn();
const mockGetActionMeta = jest.fn();
const mockGetTriggerMeta = jest.fn();
const mockGetAvailableVariablesForAI = jest.fn();
const mockGetConnectedIntegrationsForAI = jest.fn();

jest.mock("@/services/ai/tools/workflowContext", () => ({
  getWorkflowGraphForAI: (...a: unknown[]) => mockGetWorkflowGraphForAI(...a),
}));
jest.mock("@/services/ai/tools/providerCatalog", () => ({
  getActionMeta: (...a: unknown[]) => mockGetActionMeta(...a),
  getTriggerMeta: (...a: unknown[]) => mockGetTriggerMeta(...a),
}));
jest.mock("@/services/ai/tools/variables", () => ({
  getAvailableVariablesForAI: (...a: unknown[]) => mockGetAvailableVariablesForAI(...a),
}));
jest.mock("@/services/ai/tools/integrations", () => ({
  getConnectedIntegrationsForAI: (...a: unknown[]) => mockGetConnectedIntegrationsForAI(...a),
}));

import { explainNodeForAI } from "@/services/ai/explain/explainNode";

const ok = <T>(data: T) => ({ ok: true as const, data });
const err = (code: string, message: string) => ({ ok: false as const, code, message });

function field(name: string, label: string, required = false) {
  return { name, label, type: "text", required };
}

function graphWith(node: Record<string, unknown>) {
  return ok({
    workflowId: "wf-1",
    name: "WF",
    state: "draft",
    activeRevisionId: null,
    updatedAt: "2026-05-25T00:00:00Z",
    nodes: [node],
    edges: [],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAvailableVariablesForAI.mockResolvedValue(ok({ nodeId: "n2", variables: [], triggerAlias: null, unknownUpstreamNodeIds: [], truncated: false }));
  mockGetConnectedIntegrationsForAI.mockResolvedValue(ok({ integrations: [] }));
});

describe("explainNodeForAI", () => {
  it("describes config by STATUS and never leaks raw values", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphWith({
        id: "n2",
        kind: "action",
        provider: "slack",
        type: "send_channel_message",
        config: {
          to: "secret@example.com", // literal — value must NOT appear
          message: "{{n1.text}}", // variable reference
          token: "[REDACTED]", // already redacted upstream
          note: "{{AI_FIELD:summary}}", // AI-generated
          blank: "", // not set
        },
        position: { x: 0, y: 0 },
      }),
    );
    mockGetActionMeta.mockReturnValue(
      ok({
        key: "slack:send_channel_message",
        displayName: "Send Channel Message",
        description: "Posts a message.",
        requiresIntegration: true,
        riskLevel: "medium",
        isDestructive: false,
        requiresConfirmation: false,
        riskDescription: null,
        fields: [
          field("to", "Recipient", true),
          field("message", "Message"),
          field("token", "Token"),
          field("note", "Note"),
          field("blank", "Blank"),
          field("channelId", "Channel", true),
        ],
      }),
    );
    mockGetConnectedIntegrationsForAI.mockResolvedValue(ok({ integrations: [{ provider: "slack" }] }));

    const res = await explainNodeForAI("u1", "wf-1", "n2");
    if (!res.ok) throw new Error("expected ok");

    const byField = Object.fromEntries(res.data.configFields.map((c) => [c.field, c]));
    expect(byField.to!.status).toBe("literal");
    expect(byField.message!.status).toBe("variable_reference");
    expect(byField.message!.references).toEqual(["{{n1.text}}"]);
    expect(byField.token!.status).toBe("redacted");
    expect(byField.note!.status).toBe("ai_generated");
    expect(byField.blank!.status).toBe("not_set");
    expect(byField.channelId!.status).toBe("not_set");

    // No-leak: the literal value never appears anywhere in the explanation.
    expect(JSON.stringify(res.data)).not.toContain("secret@example.com");

    // Missing required field surfaced in notes.
    expect(res.data.notes.some((n) => n.includes("Channel"))).toBe(true);
    expect(res.data.integrationConnected).toBe(true);
  });

  it("flags a high-risk action and a disconnected integration", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphWith({ id: "n2", kind: "action", provider: "stripe", type: "create_refund", config: {}, position: { x: 0, y: 0 } }),
    );
    mockGetActionMeta.mockReturnValue(
      ok({
        key: "stripe:create_refund",
        displayName: "Create Refund",
        description: "Refunds a charge.",
        requiresIntegration: true,
        riskLevel: "high",
        isDestructive: true,
        requiresConfirmation: true,
        riskDescription: "Moves money.",
        fields: [],
      }),
    );
    mockGetConnectedIntegrationsForAI.mockResolvedValue(ok({ integrations: [{ provider: "slack" }] }));

    const res = await explainNodeForAI("u1", "wf-1", "n2");
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.risk.riskLevel).toBe("high");
    expect(res.data.integrationConnected).toBe(false);
    expect(res.data.notes.some((n) => n.includes("high-risk"))).toBe(true);
    expect(res.data.notes.some((n) => n.includes("not connected"))).toBe(true);
  });

  it("explains a trigger node with low risk and no integration lookup when not required", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphWith({ id: "n1", kind: "trigger", provider: "native", type: "manual", config: {}, position: { x: 0, y: 0 } }),
    );
    mockGetTriggerMeta.mockReturnValue(
      ok({ key: "native:manual", displayName: "Manual", description: "Run on demand.", requiresIntegration: false, fields: [], payloadShape: [] }),
    );

    const res = await explainNodeForAI("u1", "wf-1", "n1");
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.kind).toBe("trigger");
    expect(res.data.risk.riskLevel).toBe("low");
    expect(res.data.integrationConnected).toBeNull();
    expect(mockGetConnectedIntegrationsForAI).not.toHaveBeenCalled();
  });

  it("includes upstream variable count", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphWith({ id: "n2", kind: "action", provider: "native", type: "delay", config: {}, position: { x: 0, y: 0 } }),
    );
    mockGetActionMeta.mockReturnValue(
      ok({ key: "native:delay", displayName: "Delay", description: "Waits.", requiresIntegration: false, riskLevel: "low", isDestructive: false, requiresConfirmation: false, riskDescription: null, fields: [] }),
    );
    mockGetAvailableVariablesForAI.mockResolvedValue(
      ok({ nodeId: "n2", variables: [{ nodeId: "n1", path: "a" }, { nodeId: "n1", path: "b" }], triggerAlias: "trigger", unknownUpstreamNodeIds: [], truncated: false }),
    );
    const res = await explainNodeForAI("u1", "wf-1", "n2");
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.availableVariableCount).toBe(2);
  });

  it("returns an honest explanation for an unknown node type", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphWith({ id: "n2", kind: "action", provider: "madeup", type: "nope", config: {}, position: { x: 0, y: 0 } }),
    );
    mockGetActionMeta.mockReturnValue(err("NOT_FOUND", "No action metadata for 'madeup:nope'."));
    const res = await explainNodeForAI("u1", "wf-1", "n2");
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.configFields).toEqual([]);
    expect(res.data.notes.some((n) => n.includes("not in the registry"))).toBe(true);
  });

  it("returns NOT_FOUND for an unknown node id", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphWith({ id: "n1", kind: "action", provider: "native", type: "delay", config: {}, position: { x: 0, y: 0 } }));
    const res = await explainNodeForAI("u1", "wf-1", "ghost");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("NOT_FOUND");
  });

  it("propagates NOT_FOUND from the graph tool (ownership/missing workflow)", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(err("NOT_FOUND", "No workflow 'wf-x'."));
    const res = await explainNodeForAI("intruder", "wf-x", "n2");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("NOT_FOUND");
  });
});
