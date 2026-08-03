/** @jest-environment node */
/**
 * Export + template sanitizer — presentation retention (CS-4).
 *
 * The definition whitelist/sanitizer carries section metadata like displayName
 * (kept, length-capped, not stripped), normalizes membership against the
 * exported nodes, and never adds credentials. The strict TemplateDefinitionSchema
 * accepts it too, so a user template retains its sections.
 */
import { sanitizeWorkflowDefinitionForExport } from "@/services/workflows/exportWorkflow";
import { TemplateDefinitionSchema } from "@/contracts/workflowTemplate";
import { WorkflowDefinitionSchema, type WorkflowDefinition } from "@/contracts/workflowDefinition";

const def = (over: Partial<WorkflowDefinition> = {}): WorkflowDefinition =>
  WorkflowDefinitionSchema.parse({
    nodes: [
      { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
      { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 0 } },
      { id: "b", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 0 } },
    ],
    edges: [
      { id: "e1", from: "t", to: "a" },
      { id: "e2", from: "a", to: "b" },
    ],
    ...over,
  });

describe("sanitizeWorkflowDefinitionForExport — presentation", () => {
  it("retains valid section metadata (titles kept, like displayName)", () => {
    const exported = sanitizeWorkflowDefinitionForExport(
      def({ presentation: { version: 1, sections: [{ id: "s1", title: "Qualify", nodeIds: ["a", "b"] }] } }),
    );
    expect(exported.presentation?.sections[0]!.title).toBe("Qualify");
    expect(exported.presentation?.sections[0]!.nodeIds).toEqual(["a", "b"]);
  });

  it("prunes stale membership against the exported node ids", () => {
    // Craft a definition whose presentation references a node not exported.
    const raw = def();
    const withStale = {
      ...raw,
      presentation: { version: 1, sections: [{ id: "s1", title: "Q", nodeIds: ["a", "ghost"] }] },
    } as WorkflowDefinition;
    const exported = sanitizeWorkflowDefinitionForExport(withStale);
    expect(exported.presentation?.sections[0]!.nodeIds).toEqual(["a"]);
  });

  it("omits presentation entirely when there are no sections", () => {
    const exported = sanitizeWorkflowDefinitionForExport(def());
    expect(exported).not.toHaveProperty("presentation");
  });

  it("the strict TemplateDefinitionSchema accepts the sanitized presentation", () => {
    const exported = sanitizeWorkflowDefinitionForExport(
      def({ presentation: { version: 1, sections: [{ id: "s1", title: "Qualify", nodeIds: ["a"] }] } }),
    );
    const template = TemplateDefinitionSchema.parse(exported);
    expect(template.presentation?.sections[0]!.title).toBe("Qualify");
  });

  it("a template without presentation stays valid", () => {
    const template = TemplateDefinitionSchema.parse({ nodes: [], edges: [] });
    expect(template).not.toHaveProperty("presentation");
  });

  it("template use re-normalizes the template's presentation against the created workflow", () => {
    // A template carrying a member that won't exist on the workflow → pruned by
    // WorkflowDefinitionSchema (the use path parses tpl.definition through it).
    const workflow = WorkflowDefinitionSchema.parse({
      nodes: [{ id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 0 } }],
      edges: [],
      presentation: { version: 1, sections: [{ id: "s1", title: "Q", nodeIds: ["a", "gone"] }] },
    });
    expect(workflow.presentation?.sections[0]!.nodeIds).toEqual(["a"]);
  });
});
