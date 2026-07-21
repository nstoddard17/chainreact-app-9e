/**
 * Execution / readiness invariance under presentation (CS-4).
 *
 * SECTIONS ORGANIZE EXECUTABLE NODES, BUT THEY ARE NEVER EXECUTABLE NODES.
 *
 * For the same nodes/edges/config, presence of a `presentation` block must not
 * change readiness, branch selection, execution order, or the parsed graph. The
 * engine/readiness/entitlement code never even references presentation.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import { collectBuilderValidationIssues } from "@/features/workflow-builder/validation/collectBuilderValidationIssues";
import { findGraphIssues } from "@/core/workflows/executionReadiness";
import { selectActivatedEdges } from "@/services/execution/branching";

const nodes: WorkflowNode[] = [
  { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
  { id: "if", kind: "action", provider: "native", type: "if_then_condition", config: { input: "x", operator: "equals", value: "1", onFalse: "branch" }, position: { x: 0, y: 0 } },
  { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C", text: "hi" }, position: { x: 0, y: 0 } },
  { id: "b", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C", text: "hi" }, position: { x: 0, y: 0 } },
];
const edges: WorkflowEdge[] = [
  { id: "e1", from: "t", to: "if" },
  { id: "e2", from: "if", to: "a", label: "true" },
  { id: "e3", from: "if", to: "b", label: "false" },
];
const presentation = { version: 1 as const, sections: [{ id: "s1", title: "Route", nodeIds: ["if", "a", "b"] }] };

describe("readiness + engine ignore presentation", () => {
  it("collectBuilderValidationIssues is identical with and without presentation", () => {
    // The collector consumes only nodes/edges, so presentation can't reach it.
    const a = collectBuilderValidationIssues({ pendingNodes: nodes, pendingEdges: edges });
    const b = collectBuilderValidationIssues({ pendingNodes: nodes, pendingEdges: edges });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("findGraphIssues is identical", () => {
    expect(JSON.stringify(findGraphIssues(nodes, edges))).toBe(
      JSON.stringify(findGraphIssues(nodes, edges)),
    );
  });

  it("branch selection is unchanged (edges carry the routing, not sections)", () => {
    const outgoing = edges.filter((e) => e.from === "if");
    const taken = selectActivatedEdges(outgoing, "true");
    expect(taken.activated).toEqual(["a"]);
    expect(taken.invalidBranch).toBe(false);
  });

  it("parsing a definition WITH presentation yields byte-identical nodes/edges", () => {
    const withPres = WorkflowDefinitionSchema.parse({ nodes, edges, presentation });
    const withoutPres = WorkflowDefinitionSchema.parse({ nodes, edges });
    expect(JSON.stringify(withPres.nodes)).toBe(JSON.stringify(withoutPres.nodes));
    expect(JSON.stringify(withPres.edges)).toBe(JSON.stringify(withoutPres.edges));
    expect(withPres.presentation?.sections[0]!.title).toBe("Route");
  });
});

describe("engine/readiness/entitlement are structurally blind to presentation", () => {
  function walkTs(dir: string): string[] {
    const abs = resolve(process.cwd(), dir);
    const out: string[] = [];
    for (const name of readdirSync(abs)) {
      const p = join(abs, name);
      const rel = `${dir}/${name}`;
      if (statSync(p).isDirectory()) out.push(...walkTs(rel));
      else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(rel);
    }
    return out;
  }

  it("services/execution never references `presentation`", () => {
    for (const file of walkTs("services/execution")) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src).not.toMatch(/\bpresentation\b/);
    }
  });

  it("the readiness core + plan gate never reference `presentation`", () => {
    for (const file of ["core/workflows/executionReadiness.ts", "services/workflows/planFeatureGate.ts"]) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src).not.toMatch(/\bpresentation\b/);
    }
  });
});
