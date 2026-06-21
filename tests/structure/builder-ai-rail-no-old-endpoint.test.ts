/**
 * Structural guard — the VISIBLE builder AI chat rail no longer uses the deprecated
 * plan endpoint (HERMES-AGENT-REPLACE-BUILDER-AI-PLAN).
 *
 * The left builder rail was switched from the old `POST /api/workflows/[id]/ai/plan`
 * (`planWorkflow`) path to the Hermes account workflow-guidance path
 * (`POST /api/accounts/[id]/ai/workflow-guidance`). This test proves the rail's own
 * source (the rail component, the panel it renders, and the helper it calls):
 *   - does NOT import/call `planWorkflow` or reference `/ai/plan`;
 *   - only calls the account `workflow-guidance` route (via the helper);
 *   - never names a model/provider/gateway secret in client code.
 *
 * It also proves `WorkflowBuilder` no longer mounts the old `BuilderAiPanel` and no
 * longer renders the duplicate floating `BuilderGuidanceEntry`. The old endpoint /
 * components are intentionally NOT deleted (other tests/routes still cover them) — we
 * only assert the visible rail is disconnected from them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Read a source file with comments stripped, so the scan asserts on actual CODE — not the
 * explanatory doc comments (which legitimately NAME the old endpoint / token to say the rail
 * deliberately avoids them).
 */
function read(rel: string): string {
  const src = readFileSync(resolve(process.cwd(), rel), "utf8");
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/([^:])\/\/.*$/gm, "$1") // trailing line comments (keep `://` in URLs)
    .replace(/^\s*\/\/.*$/gm, ""); // full-line comments
}

/** Files that constitute the visible builder AI chat rail (its own import graph). */
const RAIL_SOURCES = [
  "features/workflow-builder/panels/BuilderGuidanceRail.tsx",
  "features/workflows/WorkflowGuidancePanel.tsx",
  "lib/api/ai/guidance.ts",
] as const;

describe("builder AI rail — disconnected from the deprecated plan endpoint", () => {
  it.each(RAIL_SOURCES)("%s does not reference planWorkflow or /ai/plan", (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/planWorkflow/);
    expect(src).not.toMatch(/\/ai\/plan/);
    // No direct calls to the deprecated workflow-scoped AI client surface.
    expect(src).not.toMatch(/applyWorkflowPatch|completePlan/);
  });

  it("the rail calls ONLY the account workflow-guidance route (through the helper)", () => {
    const helper = read("lib/api/ai/guidance.ts");
    expect(helper).toMatch(/\/api\/accounts\/.*\/ai\/workflow-guidance/);
    const rail = read("features/workflow-builder/panels/BuilderGuidanceRail.tsx");
    // The rail reuses WorkflowGuidancePanel (which imports the helper) — it must not
    // open its own fetch/network path.
    expect(rail).not.toMatch(/\bfetch\s*\(/);
    expect(rail).toMatch(/WorkflowGuidancePanel/);
  });

  it.each(RAIL_SOURCES)("%s does not expose the gateway token or a model/provider name in client code", (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/CHAINREACT_AI_GATEWAY_TOKEN/);
    expect(src).not.toMatch(/\bopenai\b/i);
    expect(src).not.toMatch(/\bnous\b/i);
  });

  it("WorkflowBuilder no longer mounts BuilderAiPanel or the floating BuilderGuidanceEntry", () => {
    const builder = read("features/workflow-builder/WorkflowBuilder.tsx");
    expect(builder).not.toMatch(/BuilderAiPanel/);
    expect(builder).not.toMatch(/<BuilderGuidanceEntry/);
    // The single AI entry is the guidance rail.
    expect(builder).toMatch(/BuilderGuidanceRail/);
  });

  it("the builder rail header no longer labels the model as 'claude'", () => {
    const rail = read("features/workflow-builder/layout/BuilderLeftAgentRail.tsx");
    expect(rail).not.toMatch(/claude/i);
  });
});
