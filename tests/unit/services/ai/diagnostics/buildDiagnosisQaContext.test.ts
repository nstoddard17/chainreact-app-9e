/**
 * Tests for the AI-DIAG-QA-2 safe context projector + selected-node summary
 * (`services/ai/diagnostics/buildDiagnosisQaContext.ts`).
 *
 * Pins: the projector reuses the explain allow-list (no ids/tokens) and appends ONLY the
 * safe selected-node summary; the summary is path/type/description/sensitive-flag ONLY —
 * never a value, raw node id, or `{{nodeId.path}}` reference token; bogus/absent
 * selectedNodeId is ignored; a sensitive parent is not descended into.
 */

// Control the registry metadata so the test doesn't depend on a specific provider.
const mockTriggerMeta = jest.fn();
const mockActionMeta = jest.fn();
jest.mock("@/services/discovery/_registry", () => ({
  getTriggerMeta: (...a: unknown[]) => mockTriggerMeta(...a),
  getActionMeta: (...a: unknown[]) => mockActionMeta(...a),
}));

import {
  buildDiagnosisQaContext,
  buildSelectedNodeDataSummary,
} from "@/services/ai/diagnostics/buildDiagnosisQaContext";

const dto = {
  workflowId: "wf-OPAQUE",
  access: "OK",
  overallReady: false,
  summaryText: "Gmail isn't connected.",
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
} as never;

// trigger n1 → action n2; selecting n2 makes n1 an ancestor.
const def = {
  nodes: [
    { id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {} },
    { id: "n2", kind: "action", provider: "gmail", type: "send_email", config: {} },
  ],
  edges: [{ id: "e1", from: "n1", to: "n2" }],
} as never;

beforeEach(() => {
  mockTriggerMeta.mockReset();
  mockActionMeta.mockReset();
  mockTriggerMeta.mockReturnValue({
    payloadShape: [
      { name: "from", type: "string", description: "Sender" },
      { name: "secret", type: "string", sensitive: true, fields: [{ name: "inner", type: "string" }] },
    ],
  });
  mockActionMeta.mockReturnValue(null);
});

describe("buildDiagnosisQaContext", () => {
  it("reuses the explain allow-list (no raw node ids / tokens reach the context)", () => {
    const ctx = buildDiagnosisQaContext(dto);
    const s = JSON.stringify(ctx);
    expect(s).not.toContain("node-OPAQUE");
    expect(s).not.toContain("accessToken");
    expect(s).not.toContain("ya29.LEAK");
    // Safe bits present.
    expect(s).toContain("DISCONNECTED");
    expect(ctx.selectedNode).toBeUndefined();
  });

  it("appends the selected-node summary only when provided", () => {
    const summary = { available: [{ path: "from", type: "string", sensitive: false }], truncated: false };
    expect(buildDiagnosisQaContext(dto, summary).selectedNode).toEqual(summary);
  });
});

describe("buildSelectedNodeDataSummary", () => {
  it("returns undefined for an absent selectedNodeId", () => {
    expect(buildSelectedNodeDataSummary(def, undefined)).toBeUndefined();
  });

  it("returns undefined for a bogus selectedNodeId (not in the graph)", () => {
    expect(buildSelectedNodeDataSummary(def, "ghost-node")).toBeUndefined();
  });

  it("returns undefined when the node has no enumerable upstream data (e.g. the trigger itself)", () => {
    expect(buildSelectedNodeDataSummary(def, "n1")).toBeUndefined();
  });

  it("returns ONLY safe {path,type,description?,sensitive} fields for a valid node", () => {
    const summary = buildSelectedNodeDataSummary(def, "n2");
    expect(summary).toBeDefined();
    const fields = summary!.available;
    // The sensitive parent is listed but NOT descended into (no 'secret.inner').
    expect(fields).toEqual([
      { path: "from", type: "string", description: "Sender", sensitive: false },
      { path: "secret", type: "string", sensitive: true },
    ]);
    // No-leak: no node ids, no reference tokens, no values.
    const s = JSON.stringify(summary);
    expect(s).not.toContain("n1");
    expect(s).not.toContain("n2");
    expect(s).not.toContain("{{");
    expect(s).not.toContain("reference");
    expect(s).not.toContain("nodeId");
  });
});
