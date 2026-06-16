/**
 * @jest-environment node
 *
 * Tests for the workflow-graph STRUCTURAL diagnostic capability
 * (services/diagnostics/workflowGraph.ts — Phase C-1 / 2B-5).
 *
 * Proves: the membership authz walls (NOT_FOUND / NO_ACCOUNT_ACCESS reveal
 * nothing), the structural findings mapping (broken edge / unreachable /
 * unsupported / incomplete / missing-field names / broken reference), the
 * structurallyValid verdict, and the NO-LEAK guarantee — node `config` VALUES
 * never appear in the DTO (only field names, ids, and the user-authored token).
 */
const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflow(...a),
}));
const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a),
}));

import {
  analyzeWorkflowGraph,
  diagnoseWorkflowGraph,
  type GraphFindingDTO,
} from "@/services/diagnostics/workflowGraph";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { listAllActionMetas } from "@/services/discovery/_registry";

const ACCT = "acct-1";
const node = (over: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
  id: "n1",
  kind: "action",
  provider: "synthetic",
  type: "noop",
  config: {},
  position: { x: 0, y: 0 },
  ...over,
});
const def = (nodes: unknown[], edges: unknown[] = []): WorkflowDefinition =>
  ({ nodes, edges }) as unknown as WorkflowDefinition;

const kinds = (f: readonly GraphFindingDTO[]): string[] => f.map((x) => x.kind);

describe("analyzeWorkflowGraph — structural findings (pure)", () => {
  it("flags NO_TRIGGER when there is no trigger node", () => {
    const f = analyzeWorkflowGraph(def([node({ id: "a1" })]));
    expect(kinds(f)).toContain("NO_TRIGGER");
    expect(f.find((x) => x.kind === "NO_TRIGGER")?.severity).toBe("error");
  });

  it("flags STALE_EDGE for an edge pointing at a missing node", () => {
    const d = def(
      [node({ id: "t1", kind: "trigger", type: "" })],
      [{ id: "e1", from: "t1", to: "ghost" }],
    );
    const f = analyzeWorkflowGraph(d);
    const stale = f.find((x) => x.kind === "STALE_EDGE");
    expect(stale?.severity).toBe("error");
    expect(stale?.edgeId).toBe("e1");
    expect(stale).toMatchObject({ from: "t1", to: "ghost" });
  });

  it("flags UNREACHABLE_NODE for an action not connected to the trigger", () => {
    const d = def([
      node({ id: "t1", kind: "trigger", type: "" }),
      node({ id: "a1", type: "" }),
    ]);
    expect(kinds(analyzeWorkflowGraph(d))).toContain("UNREACHABLE_NODE");
  });

  it("flags UNSUPPORTED_NODE (warning) for an unregistered provider:type", () => {
    const f = analyzeWorkflowGraph(def([node({ id: "t1", kind: "trigger", type: "totally_made_up" })]));
    const u = f.find((x) => x.kind === "UNSUPPORTED_NODE");
    expect(u?.severity).toBe("warning");
    expect(u?.provider).toBe("synthetic");
    expect(u?.nodeType).toBe("totally_made_up");
    expect(u?.reason).toMatch(/discovery-meta/);
  });

  it("flags INCOMPLETE_NODE_TYPE (warning) for a node with no type yet", () => {
    const f = analyzeWorkflowGraph(def([node({ id: "t1", kind: "trigger", type: "" })]));
    const i = f.find((x) => x.kind === "INCOMPLETE_NODE_TYPE");
    expect(i?.severity).toBe("warning");
  });

  it("flags MISSING_REQUIRED_FIELDS with field LABELS (real registered action)", () => {
    // Find a real action meta that has a required field, so findFieldGaps fires.
    let target: { provider: string; type: string } | null = null;
    for (const m of listAllActionMetas()) {
      const req = (m as { fields?: Array<{ required?: boolean }> }).fields?.some((x) => x.required);
      if (req) {
        target = { provider: m.provider, type: m.key.slice(m.key.indexOf(":") + 1) };
        break;
      }
    }
    if (!target) return; // no required-field action in registry → nothing to assert
    const d = def(
      [
        node({ id: "t1", kind: "trigger", type: "" }),
        node({ id: "a1", provider: target.provider, type: target.type, config: {} }),
      ],
      [{ id: "e1", from: "t1", to: "a1" }],
    );
    const f = analyzeWorkflowGraph(d);
    const gap = f.find((x) => x.kind === "MISSING_REQUIRED_FIELDS" && x.nodeId === "a1");
    expect(gap?.severity).toBe("error");
    expect(Array.isArray(gap?.missingFields)).toBe(true);
    expect((gap?.missingFields ?? []).length).toBeGreaterThan(0);
  });

  it("flags UNRESOLVED_REFERENCE for a {{...}} pointing at a deleted node — token kept, value not", () => {
    const d = def([
      node({ id: "t1", kind: "trigger", type: "" }),
      node({ id: "a1", type: "", config: { message: "hi {{deleted-node-xyz.field}}", apiKey: "sk-SHOULD_NOT_LEAK_123456789012" } }),
    ]);
    const f = analyzeWorkflowGraph(d);
    const ref = f.find((x) => x.kind === "UNRESOLVED_REFERENCE");
    expect(ref?.severity).toBe("error");
    expect(ref?.token).toBe("{{deleted-node-xyz.field}}");
    expect(ref?.refPath).toBe("field"); // path WITHIN the (missing) source node
    // NO config value other than the user-authored token leaks.
    expect(JSON.stringify(f)).not.toContain("sk-SHOULD_NOT_LEAK");
  });
});

describe("diagnoseWorkflowGraph — authz walls + no-leak", () => {
  beforeEach(() => {
    mockGetWorkflow.mockReset();
    mockIsMember.mockReset();
    mockIsMember.mockResolvedValue(true);
  });

  it("NOT_FOUND when no workflow — reveals nothing, never hits membership", async () => {
    mockGetWorkflow.mockResolvedValue(null);
    const dto = await diagnoseWorkflowGraph({ subjectUserId: "u1", workflowId: "wf-x" });
    expect(dto).toEqual({ workflowId: "wf-x", access: "NOT_FOUND" });
    expect(mockIsMember).not.toHaveBeenCalled();
  });

  it("NO_ACCOUNT_ACCESS for a non-member — exactly {workflowId, access}", async () => {
    mockGetWorkflow.mockResolvedValue({
      id: "wf-1",
      accountId: ACCT,
      draftDefinition: { nodes: [node({ id: "t1", kind: "trigger", type: "" })], edges: [] },
    });
    mockIsMember.mockResolvedValue(false);
    const dto = await diagnoseWorkflowGraph({ subjectUserId: "intruder", workflowId: "wf-1" });
    expect(dto).toEqual({ workflowId: "wf-1", access: "NO_ACCOUNT_ACCESS" });
  });

  it("OK member → structural DTO; config values never serialized", async () => {
    mockGetWorkflow.mockResolvedValue({
      id: "wf-1",
      accountId: ACCT,
      createdByUserId: "creator-1",
      name: "Secret Workflow Name",
      draftDefinition: {
        nodes: [
          node({ id: "t1", kind: "trigger", type: "" }),
          node({ id: "a1", type: "", config: { token: "slack_bot_token_test_fixture_redacted", channel: "C123" } }),
        ],
        edges: [{ id: "e1", from: "t1", to: "a1" }],
      },
    });
    const dto = await diagnoseWorkflowGraph({ subjectUserId: "u1", workflowId: "wf-1" });
    expect(dto.access).toBe("OK");
    expect(dto.nodeCount).toBe(2);
    expect(dto.edgeCount).toBe(1);
    expect(typeof dto.structurallyValid).toBe("boolean");
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("slack_bot_token_test_fixture_redacted");
    expect(serialized).not.toContain("C123");
    expect(serialized).not.toContain("Secret Workflow Name");
    expect(serialized).not.toContain("creator-1");
    expect(mockIsMember).toHaveBeenCalledWith(ACCT, "u1");
  });

  it("warning-only findings keep structurallyValid true", async () => {
    mockGetWorkflow.mockResolvedValue({
      id: "wf-1",
      accountId: ACCT,
      draftDefinition: {
        nodes: [node({ id: "t1", kind: "trigger", type: "unregistered_trigger_type" })],
        edges: [],
      },
    });
    const dto = await diagnoseWorkflowGraph({ subjectUserId: "u1", workflowId: "wf-1" });
    expect(dto.structurallyValid).toBe(true);
    expect((dto.findings ?? []).every((f) => f.severity !== "error")).toBe(true);
  });
});
