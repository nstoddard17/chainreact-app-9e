/**
 * Pure Document section grouping + summary + selection resolution (CS-4).
 *
 * Grouping is applied AFTER projection: every node still appears exactly once, a
 * fork is one sectionable unit, nested lane steps can't be independently
 * sectioned, non-contiguous membership degrades to a split (never reorders), and
 * collapsed summaries are deterministic.
 */
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type { WorkflowPresentation } from "@/contracts/workflowPresentation";
import { projectDefinitionToDocument } from "@/features/workflow-builder/document/projection";
import {
  blockOwnedNodeIds,
  groupBlocksIntoSections,
  summarizeDocumentSection,
} from "@/features/workflow-builder/document/documentSections";
import {
  resolveWrapSelection,
  resolveBlockNodeIds,
} from "@/features/workflow-builder/document/documentSectionCommands";

function node(id: string, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return { id, kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 0 }, ...over };
}
function trigger(id = "t"): WorkflowNode {
  return node(id, { kind: "trigger", provider: "hubspot", type: "new_contact" });
}
function edge(from: string, to: string, label?: string): WorkflowEdge {
  return { id: `${from}->${to}${label ? `:${label}` : ""}`, from, to, ...(label !== undefined ? { label } : {}) };
}
function ifNode(id: string): WorkflowNode {
  return node(id, { provider: "native", type: "if_then_condition", config: { input: "x", operator: "equals", value: "1", onFalse: "branch" } });
}

function pres(sections: WorkflowPresentation["sections"]): WorkflowPresentation {
  return { version: 1, sections };
}

function allNodeIds(rows: ReturnType<typeof groupBlocksIntoSections>["rows"]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const blocks = row.kind === "loose" ? [row.block] : row.section.blocks;
    for (const b of blocks) out.push(...blockOwnedNodeIds(b));
  }
  return out.sort();
}

describe("groupBlocksIntoSections", () => {
  it("no presentation → every block loose, no sections", () => {
    const model = projectDefinitionToDocument({ nodes: [trigger(), node("a")], edges: [edge("t", "a")] });
    const { rows, hasSplitSection } = groupBlocksIntoSections(model.blocks, null);
    expect(rows.every((r) => r.kind === "loose")).toBe(true);
    expect(hasSplitSection).toBe(false);
  });

  it("wraps the correct contiguous top-level blocks; every node once", () => {
    const nodes = [trigger(), node("a"), node("b"), node("c")];
    const edges = [edge("t", "a"), edge("a", "b"), edge("b", "c")];
    const model = projectDefinitionToDocument({ nodes, edges });
    const { rows } = groupBlocksIntoSections(model.blocks, pres([{ id: "s1", title: "Middle", nodeIds: ["a", "b"] }]));
    // t (loose), section[a,b], c (loose)
    expect(rows.map((r) => (r.kind === "section" ? `section:${r.section.title}` : "loose"))).toEqual([
      "loose",
      "section:Middle",
      "loose",
    ]);
    const section = rows.find((r) => r.kind === "section");
    expect(section?.kind === "section" && section.section.blocks.map((b) => (b.kind === "sentence" ? b.nodeId : b.kind))).toEqual(["a", "b"]);
    expect(allNodeIds(rows)).toEqual(["a", "b", "c", "t"]);
  });

  it("a fork is ONE sectionable structural unit (header + lane nodes owned together)", () => {
    const nodes = [trigger(), ifNode("if"), node("x"), node("y")];
    const edges = [edge("t", "if"), edge("if", "x", "true"), edge("if", "y", "false")];
    const model = projectDefinitionToDocument({ nodes, edges });
    const forkBlock = model.blocks.find((b) => b.kind === "fork")!;
    expect(blockOwnedNodeIds(forkBlock).sort()).toEqual(["if", "x", "y"]);
    // Section the whole fork by its owned ids.
    const { rows } = groupBlocksIntoSections(model.blocks, pres([{ id: "s1", title: "Route", nodeIds: ["if", "x", "y"] }]));
    const section = rows.find((r) => r.kind === "section");
    expect(section?.kind === "section" && section.section.blocks[0]?.kind).toBe("fork");
    expect(allNodeIds(rows)).toEqual(["if", "t", "x", "y"]);
  });

  it("non-contiguous membership degrades to a split (never reorders the workflow)", () => {
    const nodes = [trigger(), node("a"), node("b"), node("c")];
    const edges = [edge("t", "a"), edge("a", "b"), edge("b", "c")];
    const model = projectDefinitionToDocument({ nodes, edges });
    // Section claims a AND c but not b → two runs.
    const { rows, hasSplitSection } = groupBlocksIntoSections(model.blocks, pres([{ id: "s1", title: "Split", nodeIds: ["a", "c"] }]));
    expect(hasSplitSection).toBe(true);
    const sectionRuns = rows.filter((r) => r.kind === "section");
    expect(sectionRuns).toHaveLength(2);
    expect(sectionRuns.every((r) => r.kind === "section" && r.section.split)).toBe(true);
    // Order preserved: a, then b (loose), then c.
    expect(allNodeIds(rows)).toEqual(["a", "b", "c", "t"]);
  });
});

describe("summarizeDocumentSection", () => {
  it("counts steps, distinct apps, and unresolved details deterministically", () => {
    const nodes = [node("a", { provider: "slack" }), node("b", { provider: "hubspot", type: "create_contact" })];
    const edges = [edge("a", "b")];
    const model = projectDefinitionToDocument({
      nodes,
      edges,
      providerLabels: { slack: "Slack", hubspot: "HubSpot" },
    });
    const { rows } = groupBlocksIntoSections(model.blocks, pres([{ id: "s1", title: "Grp", nodeIds: ["a", "b"] }]));
    const section = rows.find((r) => r.kind === "section")!;
    if (section.kind !== "section") throw new Error("expected section");
    const summary = summarizeDocumentSection(section.section, {
      providerLabels: { slack: "Slack", hubspot: "HubSpot" },
      unresolvedByNode: new Map([["a", 1]]),
    });
    expect(summary.stepCount).toBe(2);
    expect(summary.providers).toEqual(["Slack", "HubSpot"]);
    expect(summary.unresolvedCount).toBe(1);
    expect(summary.text).toContain("2 steps");
    expect(summary.text).toContain("1 detail still needed");
  });

  it("summarizes fork paths", () => {
    const nodes = [ifNode("if"), node("x"), node("y")];
    const edges = [edge("if", "x", "true"), edge("if", "y", "false")];
    const model = projectDefinitionToDocument({ nodes, edges });
    const { rows } = groupBlocksIntoSections(model.blocks, pres([{ id: "s1", title: "Route", nodeIds: ["if", "x", "y"] }]));
    const section = rows.find((r) => r.kind === "section")!;
    if (section.kind !== "section") throw new Error("expected section");
    const summary = summarizeDocumentSection(section.section);
    expect(summary.pathLabels).toEqual(["If yes", "Otherwise"]);
    expect(summary.text).toContain("2 paths");
  });
});

describe("resolveWrapSelection / resolveBlockNodeIds", () => {
  const nodes = [trigger(), node("a"), node("b"), node("c")];
  const edges = [edge("t", "a"), edge("a", "b"), edge("b", "c")];
  const model = projectDefinitionToDocument({ nodes, edges });

  it("resolves contiguous top-level blocks to their owned node ids", () => {
    const res = resolveWrapSelection(model.blocks, ["a", "b"]);
    expect(res.ok && [...res.nodeIds].sort()).toEqual(["a", "b"]);
  });

  it("refuses an empty selection", () => {
    expect(resolveWrapSelection(model.blocks, [])).toEqual({ ok: false, reason: "empty_selection" });
  });

  it("refuses a non-contiguous selection", () => {
    expect(resolveWrapSelection(model.blocks, ["a", "c"])).toEqual({ ok: false, reason: "noncontiguous" });
  });

  it("refuses a nested lane step (not a top-level block)", () => {
    const branchModel = projectDefinitionToDocument({
      nodes: [trigger(), ifNode("if"), node("x"), node("y")],
      edges: [edge("t", "if"), edge("if", "x", "true"), edge("if", "y", "false")],
    });
    // "x" is a nested lane step, not a top-level block.
    expect(resolveWrapSelection(branchModel.blocks, ["x"])).toEqual({ ok: false, reason: "not_top_level" });
  });

  it("resolves a single block's owned node ids", () => {
    const block = model.blocks.find((b) => b.kind === "sentence" && b.nodeId === "a")!;
    expect(resolveBlockNodeIds(block)).toEqual({ ok: true, nodeIds: ["a"] });
  });
});
