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
import { existsSync, readFileSync } from "node:fs";
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

/**
 * HERMES-AGENT-LEGACY-AI-ROUTE-AUDIT — the deprecated `…/ai/plan` path is no longer USER-MOUNTED.
 * The only client of `planWorkflow` is the legacy `BuilderAiPanel`, which no builder composition
 * root renders. We assert that here (against the actual builder composition files) so a future
 * re-mount of the old chat — and with it the deprecated plan endpoint — fails CI.
 */
describe("legacy plan path is not user-mounted", () => {
  const COMPOSITION_ROOTS = [
    "features/workflow-builder/WorkflowBuilder.tsx",
    "features/workflow-builder/layout/BuilderShell.tsx",
    "features/workflow-builder/layout/BuilderLeftAgentRail.tsx",
    "features/workflow-builder/panels/BuilderGuidanceRail.tsx",
  ] as const;

  it.each(COMPOSITION_ROOTS)("%s does not render <BuilderAiPanel> (the legacy chat)", (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/<BuilderAiPanel[\s/>]/);
  });

  // TEST-REDUNDANCY-REMOVAL-1 — removed "the superseded floating
  // BuilderGuidanceEntry component was removed" (an existsSync === false pin
  // on an already-deleted file). Unlike the retired ROUTE files, whose mere
  // presence would re-expose an HTTP endpoint, a re-added presentational
  // component is inert unless something renders it — and rendering it is
  // already banned by the live composition-root scan directly above plus
  // "WorkflowBuilder no longer mounts BuilderAiPanel or the floating
  // BuilderGuidanceEntry". Those are the survivors.

  // (The /ai/plan route was retired in Phase 2 — see "legacy chat AI routes ... retired (Phase 2)".)
});

/**
 * HERMES-AGENT-REHOME-RUN-RESULTS-REPAIR — the run-results repair "Ask" call is now on the governed
 * account-scoped route. The deterministic apply stays on the existing path. These guards lock the
 * rehome: the UI calls the new helper (not the legacy per-workflow one) and the new route stays
 * deterministic (no model/gateway/token) and never applies a patch itself.
 */
describe("run-results repair rehome — governed, deterministic", () => {
  it("RunResultsRepairBlock asks via the governed account helper, not the legacy per-workflow call", () => {
    const src = read("features/workflow-builder/panels/RunResultsRepairBlock.tsx");
    expect(src).toMatch(/requestAccountWorkflowRepair/);
    // The legacy ask (`requestWorkflowRepair(workflowId, runId)`) is gone from the UI.
    expect(src).not.toMatch(/\brequestWorkflowRepair\b/);
  });

  it("the account repair client posts ONLY to /api/accounts/[id]/ai/workflow-repair (no raw fetch / token)", () => {
    const src = read("lib/api/ai/workflowRepair.ts");
    expect(src).toMatch(/\/api\/accounts\/.*\/ai\/workflow-repair/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/CHAINREACT_AI_GATEWAY_TOKEN/);
  });

  it("the account repair route is deterministic — no model/gateway call, and never applies a patch", () => {
    const src = read("app/api/accounts/[id]/ai/workflow-repair/route.ts");
    expect(src).not.toMatch(/openai|anthropic|callLLM|getAnthropic|getOpenAI|hermes|gateway/i);
    expect(src).not.toMatch(/CHAINREACT_AI_GATEWAY_TOKEN/);
    // Suggestion only — applying stays on the separate deterministic apply route.
    expect(src).not.toMatch(/applyWorkflowPatch|applyRepairPatch/);
  });
});

/**
 * HERMES-AGENT-RETIRE-LEGACY-REPAIR-ROUTE — the dead per-workflow legacy repair route + client
 * request function are gone; the governed account route + the explicit apply path stay.
 */
describe("legacy run-repair route retired", () => {
  it("the legacy /runs/[runId]/ai/repair route file is deleted", () => {
    expect(
      existsSync(resolve(process.cwd(), "app/api/workflows/[id]/runs/[runId]/ai/repair/route.ts")),
    ).toBe(false);
  });

  it("the legacy requestWorkflowRepair request function is gone (types-only module remains)", () => {
    const src = read("lib/api/ai/runRepair.ts");
    // No request function / its route path in the actual code (the doc comment that names it is
    // stripped by read()).
    expect(src).not.toMatch(/requestWorkflowRepair/);
    expect(src).not.toMatch(/\/runs\/.*\/ai\/repair/);
    // The live repair contract types remain.
    expect(src).toMatch(/AiRepairResult/);
  });

  it("the governed account repair route remains, and the UI keeps explicit apply", () => {
    expect(existsSync(resolve(process.cwd(), "app/api/accounts/[id]/ai/workflow-repair/route.ts"))).toBe(true);
    // Explicit apply is preserved in the run-results UI.
    expect(read("features/workflow-builder/panels/RunResultsRepairBlock.tsx")).toMatch(/applyWorkflowPatch/);
  });
});

/**
 * HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT (Phase 1) — the unmounted legacy builder chat UI subtree
 * (BuilderAiPanel + its hooks + the chat-only `ai/*` helpers) is deleted. The shared rendering views
 * used by the live run-results repair block survive.
 */
describe("legacy builder chat UI subtree retired (Phase 1)", () => {
  const DELETED = [
    "features/workflow-builder/panels/BuilderAiPanel.tsx",
    "features/workflow-builder/panels/useBuilderAiActions.ts",
    "features/workflow-builder/panels/useBuilderDiagnosisActions.ts",
    "features/workflow-builder/panels/useChatFill.ts",
    "features/workflow-builder/hooks/useBuilderAi.ts",
    "features/workflow-builder/ai/composeFollowUpPrompt.ts",
    "features/workflow-builder/ai/deterministicCompletion.ts",
    "features/workflow-builder/ai/setupFindings.ts",
    "features/workflow-builder/ai/chatFillAction.ts",
  ] as const;

  it.each(DELETED)("%s is deleted", (rel) => {
    expect(existsSync(resolve(process.cwd(), rel))).toBe(false);
  });

  it("the shared ai/ barrel keeps ONLY the live repair views (no chat-only helper exports)", () => {
    const src = read("features/workflow-builder/ai/index.ts");
    expect(src).toMatch(/AiBulletList/);
    expect(src).toMatch(/AiRequiredInputList/);
    // Chat-only helpers no longer exported.
    expect(src).not.toMatch(/composeFollowUpPrompt|evaluateDeterministicCompletion|prepareChatFill|setupFindingCards|RequiredInputControl/);
  });

  it("the live run-results repair block still uses the shared views (kept)", () => {
    const src = read("features/workflow-builder/panels/RunResultsRepairBlock.tsx");
    expect(src).toMatch(/AiBulletList/);
    expect(src).toMatch(/AiRequiredInputList/);
  });
});

/**
 * HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT (Phase 2) — the orphaned chat-only ROUTES + client helpers are
 * deleted; the LIVE apply route + guidance/repair routes survive.
 */
describe("legacy chat AI routes + client helpers retired (Phase 2)", () => {
  const DELETED_ROUTES = [
    "app/api/workflows/[id]/ai/plan/route.ts",
    "app/api/workflows/[id]/ai/complete/route.ts",
    "app/api/workflows/[id]/ai/thread/route.ts",
    "app/api/workflows/[id]/ai/diagnose/route.ts",
    "app/api/workflows/[id]/ai/diagnose/explain/route.ts",
    "app/api/workflows/[id]/ai/diagnose/qa/route.ts",
    "app/api/workflows/[id]/ai/repair/plan/route.ts",
    "app/api/workflows/[id]/ai/repair/preview/route.ts",
    "app/api/workflows/[id]/ai/repair/apply/route.ts",
    "app/api/workflows/[id]/ai/repair/apply-readiness/route.ts",
  ] as const;
  const DELETED_CLIENTS = [
    "lib/api/ai/thread.ts",
    "lib/api/ai/diagnostics.ts",
  ] as const;

  it.each(DELETED_ROUTES)("%s is deleted", (rel) => {
    expect(existsSync(resolve(process.cwd(), rel))).toBe(false);
  });

  it.each(DELETED_CLIENTS)("%s is deleted", (rel) => {
    expect(existsSync(resolve(process.cwd(), rel))).toBe(false);
  });

  it("the LIVE apply route + governed guidance/repair routes survive", () => {
    expect(existsSync(resolve(process.cwd(), "app/api/workflows/[id]/ai/apply/route.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "app/api/accounts/[id]/ai/workflow-guidance/route.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "app/api/accounts/[id]/ai/workflow-repair/route.ts"))).toBe(true);
  });

  it("the AI client barrel keeps applyWorkflowPatch + repair/guidance, drops the chat plan/complete/thread/diagnose helpers", () => {
    const barrel = read("lib/api/ai.ts");
    expect(barrel).not.toMatch(/\.\/ai\/thread|\.\/ai\/diagnostics/);
    const plan = read("lib/api/ai/plan.ts");
    expect(plan).toMatch(/applyWorkflowPatch/); // live
    // The dead chat client functions + their endpoints are gone from the code.
    expect(plan).not.toMatch(/export async function planWorkflow\b/);
    expect(plan).not.toMatch(/export async function completePlan\b/);
    expect(plan).not.toMatch(/\/ai\/plan|\/ai\/complete/);
  });

  it("no client code references the removed legacy endpoints", () => {
    for (const rel of ["lib/api/ai/plan.ts", "lib/api/ai/runRepair.ts", "lib/api/ai/workflowRepair.ts", "lib/api/ai/guidance.ts", "features/workflow-builder/panels/RunResultsRepairBlock.tsx"]) {
      const src = read(rel);
      expect(src).not.toMatch(/\/ai\/(plan|complete|thread|diagnose)/);
      expect(src).not.toMatch(/\/ai\/repair\/(plan|preview|apply)/);
    }
  });
});

/**
 * HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT (Phase 3) — the route-less planner / diagnostics / chat-only
 * repair SERVICES are deleted, the dead `AiPlan*` contract types are pruned, and the dead plan
 * recorder is removed. The live deterministic-repair keep-set + the apply/repair recorders stay.
 */
describe("legacy route-less AI services retired (Phase 3)", () => {
  const DELETED = [
    "services/ai/planner",
    "services/ai/diagnostics",
    "services/ai/repair/planWorkflowRepair.ts",
    "services/ai/repair/previewWorkflowRepair.ts",
    "services/ai/repair/applyRepairPatch.ts",
    "services/ai/repair/assessRepairApplyReadiness.ts",
    "services/ai/repair/deterministicRepairPreview.ts",
  ] as const;

  it.each(DELETED)("%s is deleted", (rel) => {
    expect(existsSync(resolve(process.cwd(), rel))).toBe(false);
  });

  it("the dead AiPlan* contract types are pruned from the apply client (applyWorkflowPatch stays)", () => {
    const plan = read("lib/api/ai/plan.ts");
    for (const t of ["AiPlanResult", "AiPlanSuccess", "AiPlanFailure", "AiModelMeta", "AiRequiredUserInput", "CurrentGraphSnapshot"]) {
      expect(plan).not.toMatch(new RegExp(`\\b${t}\\b`));
    }
    expect(plan).toMatch(/applyWorkflowPatch/);
  });

  it("the dead plan recorder is gone; the live apply/repair recorders stay (module + barrel)", () => {
    const rec = read("services/ai/events/recordAiRouteEvents.ts");
    expect(rec).not.toMatch(/recordAiPlanOutcome/);
    expect(rec).toMatch(/recordAiApplyOutcome/);
    expect(rec).toMatch(/recordAiRepairOutcome/);
    const barrel = read("services/ai/events/index.ts");
    expect(barrel).not.toMatch(/recordAiPlanOutcome/);
    expect(barrel).toMatch(/recordAiApplyOutcome/);
    expect(barrel).toMatch(/recordAiRepairOutcome/);
  });
});

/**
 * CHAINREACT-AI-SURFACE-STRUCTURE-LOCKS — single consolidated lock for the intended ChainReact AI
 * surface across the whole legacy-retirement arc. Encodes the architecture rules:
 *   1. The visible builder AI is the account-scoped Hermes guidance rail (rail → panel → helper →
 *      POST /api/accounts/[id]/ai/workflow-guidance).
 *   3. Run-results repair = governed account suggestion (requestAccountWorkflowRepair) + explicit
 *      apply (applyWorkflowPatch → /api/workflows/[id]/ai/apply) only.
 *   4. No browser/client AI file leaks a gateway/model secret or imports the server-only gateway client.
 *   5. Removed legacy modules stay removed.
 *   6. The live keep-set stays present.
 */
describe("ChainReact AI surface — locked", () => {
  // Rule 6 — live keep-set present.
  const KEEP_SET = [
    "features/workflow-builder/panels/BuilderGuidanceRail.tsx",
    "features/workflows/WorkflowGuidancePanel.tsx",
    "features/workflow-builder/panels/RunResultsRepairBlock.tsx",
    "services/ai-guidance/index.ts",
    "app/api/accounts/[id]/ai/workflow-guidance/route.ts",
    "app/api/accounts/[id]/ai/workflow-repair/route.ts",
    "app/api/workflows/[id]/ai/apply/route.ts",
    "services/ai/repair/suggestWorkflowRepair.ts",
    "services/ai/repair/repairStrategies.ts",
    "services/ai/repair/repairPatchRef.ts",
    "services/ai/repair/types.ts",
  ] as const;
  it.each(KEEP_SET)("%s is present (live keep-set)", (rel) => {
    expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
  });

  // Rule 5 — removed legacy modules stay removed (cross-phase summary lock).
  const REMOVED = [
    "features/workflow-builder/panels/BuilderAiPanel.tsx",
    "features/workflow-builder/hooks/useBuilderAi.ts",
    "features/workflow-builder/panels/useBuilderAiActions.ts",
    "features/workflow-builder/panels/useBuilderDiagnosisActions.ts",
    "features/workflow-builder/panels/useChatFill.ts",
    "features/workflow-builder/panels/BuilderGuidanceEntry.tsx",
    "services/ai/planner",
    "services/ai/diagnostics",
  ] as const;
  it.each(REMOVED)("%s stays removed", (rel) => {
    expect(existsSync(resolve(process.cwd(), rel))).toBe(false);
  });

  // Rule 1 + 3 — the builder rail delegates to the panel and adds no request/network logic, and must
  // not import removed legacy client helpers or the server-only Hermes gateway client.
  it("the builder rail delegates to WorkflowGuidancePanel and pulls in no removed helper / gateway client", () => {
    const rail = read("features/workflow-builder/panels/BuilderGuidanceRail.tsx");
    expect(rail).toMatch(/WorkflowGuidancePanel/);
    expect(rail).not.toMatch(/\bfetch\s*\(/);
    expect(rail).not.toMatch(/requestWorkflowGuidance/); // the panel owns the request
    expect(rail).not.toMatch(/useBuilderAi\b|useBuilderAiActions|useBuilderDiagnosisActions|useChatFill|planWorkflow|completePlan/);
    expect(rail).not.toMatch(/hermesAgentGatewayClient|ai-guidance\/gateway/);
  });

  // Rule 3 — run-results repair uses the governed suggestion helper + explicit apply only.
  it("run-results repair uses requestAccountWorkflowRepair + applyWorkflowPatch only", () => {
    const block = read("features/workflow-builder/panels/RunResultsRepairBlock.tsx");
    expect(block).toMatch(/requestAccountWorkflowRepair/);
    expect(block).toMatch(/applyWorkflowPatch/);
    expect(block).not.toMatch(/\brequestWorkflowRepair\b/);
    expect(block).not.toMatch(/\/ai\/repair\/(plan|preview|apply)/);
  });

  // Rule 4 — no browser/client AI file names a gateway/model secret or imports the gateway client.
  const CLIENT_AI_SURFACE = [
    "features/workflow-builder/panels/BuilderGuidanceRail.tsx",
    "features/workflows/WorkflowGuidancePanel.tsx",
    "features/workflow-builder/panels/RunResultsRepairBlock.tsx",
    "lib/api/ai/guidance.ts",
    "lib/api/ai/workflowRepair.ts",
    "lib/api/ai/plan.ts",
    "lib/api/ai/runRepair.ts",
  ] as const;
  it.each(CLIENT_AI_SURFACE)("%s names no gateway/model secret and no server-only gateway client", (rel) => {
    const src = read(rel);
    for (const pat of [
      /CHAINREACT_AI_GATEWAY_TOKEN/,
      /OPENAI_API_KEY|api\.openai\.com/i,
      /nousresearch/i,
      /onrender\.com/,
      /\/api\/hermes-agent\/guidance/, // server-only gateway endpoint
      /hermesAgentGatewayClient/, // server-only gateway client
      /services\/ai-guidance\/gateway/, // server-only gateway module subtree
    ]) {
      expect({ rel, pat: String(pat), matched: pat.test(src) }).toEqual({ rel, pat: String(pat), matched: false });
    }
  });
});
