import { describe, expect, it } from "@jest/globals";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import {
  projectDefinitionToDocument,
  type DocumentBlock,
  type DocumentModel,
} from "@/features/workflow-builder/document/projection";

/**
 * 5.DUAL-BUILDER-1 CS-7B — structural performance / robustness on representative
 * larger workflows. These are STRUCTURAL assertions (totality, no duplication,
 * no exponential expansion, determinism) — NOT brittle machine-time gates. The
 * projection is pure, so this exercises the exact model the Document + Whole
 * Workflow map + Finish Setup queue all derive from.
 */

const pos = { x: 0, y: 0 };
const trig = (id: string): WorkflowNode => ({ id, kind: "trigger", provider: "native", type: "manual", config: {}, position: pos });
const act = (id: string, provider = "native", type = "delay"): WorkflowNode => ({ id, kind: "action", provider, type, config: {}, position: pos });
const ifn = (id: string): WorkflowNode => ({ id, kind: "action", provider: "native", type: "if_then_condition", config: { input: "x", operator: "is_not_empty", onFalse: "branch" }, position: pos });
const edge = (from: string, to: string, label?: string): WorkflowEdge => ({ id: `${from}->${to}${label ? `:${label}` : ""}`, from, to, ...(label ? { label } : {}) });

/** Every node id the model represents (sentences, fork headers, lane steps, complex lists). */
function representedIds(blocks: readonly DocumentBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === "sentence") out.push(b.nodeId);
    else if (b.kind === "fork") {
      out.push(b.nodeId);
      for (const lane of b.lanes) out.push(...representedIds(lane.blocks));
    } else out.push(...b.nodeIds);
  }
  return out;
}

function countBlocks(blocks: readonly DocumentBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    n++;
    if (b.kind === "fork") for (const lane of b.lanes) n += countBlocks(lane.blocks);
  }
  return n;
}

function project(nodes: WorkflowNode[], edges: WorkflowEdge[]): DocumentModel {
  return projectDefinitionToDocument({ nodes, edges });
}

function assertTotalAndUnique(model: DocumentModel, nodes: WorkflowNode[]) {
  const rep = representedIds(model.blocks);
  // No node represented more than once (rejoins never duplicated).
  expect(new Set(rep).size).toBe(rep.length);
  // Every live node is represented exactly once.
  expect(new Set(rep)).toEqual(new Set(nodes.map((n) => n.id)));
  expect(model.nodeCount).toBe(nodes.length);
}

describe("Document projection — large-fixture structural performance", () => {
  it("10-node linear: total, unique, tier A, no block blow-up", () => {
    const nodes = [trig("t"), ...Array.from({ length: 9 }, (_, i) => act(`a${i}`))];
    const edges = [edge("t", "a0"), ...Array.from({ length: 8 }, (_, i) => edge(`a${i}`, `a${i + 1}`))];
    const m = project(nodes, edges);
    assertTotalAndUnique(m, nodes);
    expect(m.tier).toBe("A");
    expect(countBlocks(m.blocks)).toBe(10);
  });

  it("30-node sectioned: total, unique, linear block count", () => {
    const nodes = [trig("t"), ...Array.from({ length: 29 }, (_, i) => act(`a${i}`))];
    const edges = [edge("t", "a0"), ...Array.from({ length: 28 }, (_, i) => edge(`a${i}`, `a${i + 1}`))];
    const m = project(nodes, edges);
    assertTotalAndUnique(m, nodes);
    expect(countBlocks(m.blocks)).toBe(30);
  });

  it("nested branches to depth 3: no recursion failure, rejoins not duplicated", () => {
    // t -> if1 -{true}-> if2 -{true}-> if3 -{true}-> leaf ; each if false -> shared rejoin
    const nodes = [
      trig("t"), ifn("if1"), ifn("if2"), ifn("if3"), act("leaf"), act("r1"), act("r2"), act("r3"),
    ];
    const edges = [
      edge("t", "if1"),
      edge("if1", "if2", "true"), edge("if1", "r1", "false"),
      edge("if2", "if3", "true"), edge("if2", "r2", "false"),
      edge("if3", "leaf", "true"), edge("if3", "r3", "false"),
    ];
    let m!: DocumentModel;
    expect(() => { m = project(nodes, edges); }).not.toThrow();
    assertTotalAndUnique(m, nodes);
  });

  it("100-node mixed (linear + branches + a cycle region): total, deterministic, no exponential", () => {
    const nodes: WorkflowNode[] = [trig("t")];
    const edges: WorkflowEdge[] = [];
    // 40-node linear spine
    let prev = "t";
    for (let i = 0; i < 40; i++) { const id = `l${i}`; nodes.push(act(id)); edges.push(edge(prev, id)); prev = id; }
    // 10 diamonds hanging off the spine (branch + reconverge) = 40 nodes
    for (let i = 0; i < 10; i++) {
      const f = `if${i}`, a = `ya${i}`, b = `nb${i}`, s = `sh${i}`;
      nodes.push(ifn(f), act(a), act(b), act(s));
      edges.push(edge(prev, f), edge(f, a, "true"), edge(f, b, "false"), edge(a, s), edge(b, s));
      prev = s;
    }
    // a deliberate 3-node cycle island (Tier C region) = ~19 more nodes padding to ~100
    for (let i = 0; i < 16; i++) nodes.push(act(`p${i}`));
    nodes.push(act("c0"), act("c1"), act("c2"));
    edges.push(edge("c0", "c1"), edge("c1", "c2"), edge("c2", "c0"));

    let m!: DocumentModel;
    expect(() => { m = project(nodes, edges); }).not.toThrow();
    // Every node classified exactly once (reachable prose OR complex region).
    assertTotalAndUnique(m, nodes);
    // Block count is BOUNDED (roughly linear) — never exponential in branches.
    expect(countBlocks(m.blocks)).toBeLessThan(nodes.length * 2);
    // Deterministic: a second projection of the same input is byte-identical.
    const m2 = project(nodes, edges);
    expect(JSON.stringify(m2.blocks)).toBe(JSON.stringify(m.blocks));
  });
});
