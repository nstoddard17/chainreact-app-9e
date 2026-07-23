/**
 * @jest-environment node
 *
 * Registration-plan output (CS-5A). Proves the plan prints deterministic,
 * shipped-only, copy/paste-ready inventory fragments that MATCH the actual
 * hand-maintained Linear wiring, reports resolver registration when a field
 * declares optionsSource, and rejects duplicate keys. Pure — no I/O, no mutation.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  compileProvider,
  buildRegistrationPlan,
  renderRegistrationPlan,
  McpCatalogSchema,
} from "@/core/mcpCompile";
import { linearMcpCatalog } from "@/integrations/linear/mcp-catalog";

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const snapshot = JSON.parse(
  readFileSync(path.join(repoRoot, "integrations", "linear", "mcp-snapshot.json"), "utf8"),
);

const compiled = compileProvider(snapshot, linearMcpCatalog);
const plan = buildRegistrationPlan(compiled);

describe("registration plan — Linear (matches the committed wiring)", () => {
  it("covers exactly the 4 shipped action keys", () => {
    expect(plan.actionKeys).toEqual([
      "linear:find_issues",
      "linear:create_issue",
      "linear:update_issue",
      "linear:add_comment",
    ]);
  });

  it("emits the four destinations in order", () => {
    expect(plan.fragments.map((f) => f.destination)).toEqual([
      "services/discovery/providers/linear.ts",
      "services/discovery/_metaInventory.ts",
      "services/execution/handlers/_handlerInventory.ts",
      "services/options/_registry.ts",
    ]);
  });

  it("meta sub-registry exports LINEAR_ACTION_METAS with each .meta import", () => {
    const f = plan.fragments[0]!;
    expect(f.action).toBe("create");
    expect(f.content).toContain("export const LINEAR_ACTION_METAS: ReadonlyArray<ActionMeta> = [");
    expect(f.content).toContain('import { findIssuesMeta } from "@/integrations/linear/actions/findIssues.meta";');
    expect(f.content).toContain('import { addCommentMeta } from "@/integrations/linear/actions/addComment.meta";');
  });

  it("handler fragment aliases each handler and registers the exact entries", () => {
    const f = plan.fragments[2]!;
    expect(f.content).toContain('import { createIssue as linearCreateIssue } from "@/integrations/linear/actions/createIssue";');
    expect(f.content).toContain('{ provider: "linear", type: "create_issue", handler: linearCreateIssue },');
    expect(f.content).toContain('{ provider: "linear", type: "find_issues", handler: linearFindIssues },');
  });

  it("the printed handler entries actually match the committed _handlerInventory.ts", () => {
    const inv = readFileSync(
      path.join(repoRoot, "services", "execution", "handlers", "_handlerInventory.ts"),
      "utf8",
    );
    for (const type of ["find_issues", "create_issue", "update_issue", "add_comment"]) {
      expect(inv).toContain(`{ provider: "linear", type: "${type}", handler: linear`);
    }
  });

  it("options fragment reports Linear's resolver sources (CS-6B)", () => {
    expect(plan.resolverSources).toEqual(["linear:assignees", "linear:labels", "linear:teams"]);
    const optionsFragment = plan.fragments.find((f) => f.destination === "services/options/_registry.ts")!;
    for (const s of ["linear:teams", "linear:assignees", "linear:labels"]) {
      expect(optionsFragment.content).toContain(s);
    }
  });

  it("is deterministic (same compile → identical render)", () => {
    const again = renderRegistrationPlan(buildRegistrationPlan(compileProvider(snapshot, linearMcpCatalog)));
    expect(again).toBe(renderRegistrationPlan(plan));
  });

  it("render never claims to have edited anything", () => {
    expect(renderRegistrationPlan(plan)).toContain("does NOT edit any registry");
  });
});

describe("registration plan — resolver reporting + validation", () => {
  it("reports optionsSource resolvers to register when a field declares one", () => {
    const catalogWithResolver = McpCatalogSchema.parse({
      provider: "linear",
      serverUrl: "https://mcp.linear.app/mcp",
      tools: [
        {
          tool: "save_issue",
          decision: "ship",
          type: "create_issue",
          displayName: "Create Issue",
          reason: "x",
          fieldOverrides: {
            id: { omit: true },
            title: { required: true },
            team: { required: true },
            // `labels` compiles to string-array — a valid optionsSource target.
            labels: { optionsSource: "linear:labels" },
          },
        },
      ],
    });
    const p = buildRegistrationPlan(compileProvider(snapshot, catalogWithResolver));
    expect(p.resolverSources).toEqual(["linear:labels"]);
    const optionsFragment = p.fragments.find((f) => f.destination === "services/options/_registry.ts")!;
    expect(optionsFragment.content).toContain("linear:labels");
    expect(optionsFragment.content).toContain("ALL_OPTIONS_RESOLVERS");
  });

  it("only ship decisions appear (skip/defer never register)", () => {
    // The Linear catalog defers get_issue and skips delete_comment; neither key
    // should appear in the plan.
    expect(plan.actionKeys.join(",")).not.toContain("get_issue");
    expect(plan.actionKeys.join(",")).not.toContain("delete_comment");
  });

  it("throws on a duplicate handler key", () => {
    const dup = {
      ...compiled,
      actions: [...compiled.actions, compiled.actions[0]!],
    };
    expect(() => buildRegistrationPlan(dup)).toThrow(/duplicate/);
  });
});
