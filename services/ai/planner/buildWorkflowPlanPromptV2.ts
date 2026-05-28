/**
 * Structured v2 planner prompt builder (Slice 4.AI-29).
 *
 * Reorganizes the v1 prose-heavy system message into:
 *
 *   1. A machine-readable CONTEXT PACKET JSON envelope (counts only — no
 *      raw config, no secrets) at the top, summarizing the user's current
 *      state + the deterministic safety constraint flags the model must
 *      respect. The detailed grounding sections (catalog, connected
 *      integrations, current canvas) are rendered as text further down
 *      because their existing per-line shape is already more compact than
 *      a JSON re-encoding.
 *
 *   2. Eight named CRITICAL RULE groups (R1..R8) that wrap every existing
 *      PLANNER_CONSTRAINTS string verbatim. The grouping is presentational
 *      — the underlying rule text is byte-identical to v1 so every
 *      substring assertion in `buildWorkflowPlanPrompt.test.ts` continues
 *      to pass. The named headers improve scannability for the model
 *      (Claude tends to weight numbered headers more than mid-bullet
 *      text — see AI-27 audit §D.1).
 *
 *   3. Everything below the rules is UNCHANGED from v1: TEMPLATE_FUTURE_NOTE,
 *      catalog rendering, connected integrations, current canvas, optional
 *      cost section, response schema description, PATCH_SHAPE_GUIDE,
 *      VALUE_SHAPE_RULES, JSON_OUTPUT_RULES.
 *
 * BEHAVIOR: identical to v1.
 *  - Same catalog: all usable providers, every action + trigger, every
 *    config field + option + output. NO provider narrowing (that lands
 *    in AI-30).
 *  - Same downstream parser, same WorkflowPatchSchema, same AI-5 preview,
 *    same AI-20 apply-readiness gate, same `propose_workflow_plan`
 *    forced tool-use.
 *  - Same constraint text — `PLANNER_CONSTRAINTS` is the source of truth
 *    for both versions.
 *  - Same attribution shape — only `packetVersion` (`workflow-planner-v2`)
 *    distinguishes a v2 emission from a v1 emission in `ai_cost_events`.
 *
 * ROLLBACK: set `ENABLE_STRUCTURED_PROMPT_PACKET=false` in env to route
 * through `buildWorkflowPlanPromptV1WithAttribution` instead. AI-30 will
 * delete v1 once v2 is observed in production.
 */

import type { ModelMessage } from "@/core/ai/modelTypes";
import {
  computePlannerAttribution,
  isUsableProvider,
  PLANNER_CONSTRAINTS,
  TEMPLATE_FUTURE_NOTE,
  PATCH_SHAPE_GUIDE,
  VALUE_SHAPE_RULES,
  JSON_OUTPUT_RULES,
  renderCatalog,
  renderConnectedIntegrations,
  renderCurrentGraph,
  renderCostAwareness,
} from "./buildWorkflowPlanPrompt";
import {
  filterCatalogToNarrowed,
  narrowProvidersForPlan,
  type NarrowProvidersResult,
} from "./narrowProvidersForPlan";
import {
  PLANNER_PACKET_VERSION,
  type PlannerPromptAttribution,
  type WorkflowPlanPromptInput,
} from "./types";

/**
 * Eight named rule groups. Each group wraps a contiguous subset of the
 * PLANNER_CONSTRAINTS array, preserving the source-of-truth wording so
 * every substring assertion (and the array-position guard for the
 * no-substitution rule) continues to pass.
 *
 * Group ordering is deliberate: SAFETY first (catalog-only + no-
 * substitution), then current canvas, then config grounding, then
 * variable references, then connected integrations, then output format,
 * then unknown values, then safety hygiene. This mirrors the AI-27
 * audit §E.2 recommendation while keeping the v1 array intact.
 */
const RULE_GROUPS: readonly { readonly title: string; readonly indexes: readonly number[] }[] = [
  // R1 wraps the catalog-only + HARD no-substitution rules so they stay
  // top-of-prompt. The no-substitution rule sits at index 1 in
  // PLANNER_CONSTRAINTS (within first 4 — the array-position test). AI-30
  // appends a narrowing-aware restatement at PLANNER_CONSTRAINTS[20] so the
  // model can't silently substitute when the catalog has been narrowed —
  // the new rule lives in R1 so it shares the top-of-prompt visibility
  // with the original HARD RULE.
  { title: "R1 — SAFETY-CRITICAL (catalog-only use + no substitution, including under narrowing)", indexes: [0, 1, 20] },
  { title: "R2 — CURRENT CANVAS GROUNDING", indexes: [2] },
  // R3 covers config-key + value-shape + required-fill discipline +
  // display-label-vs-id grounding — every rule about HOW config values
  // are constructed.
  {
    title: "R3 — CONFIG GROUNDING (keys, shapes, required-fill, label vs id)",
    indexes: [3, 4, 5, 6, 7, 8],
  },
  { title: "R4 — VARIABLE REFERENCES MUST USE DECLARED OUTPUTS", indexes: [9] },
  { title: "R5 — CONNECTED INTEGRATIONS (awareness + me-resolution)", indexes: [10, 11] },
  { title: "R6 — OUTPUT FORMAT (strict JSON via tool-use)", indexes: [12, 15] },
  { title: "R7 — UNKNOWN VALUES (AI_FIELD / requiredUserInput / null-over-partial)", indexes: [13, 14] },
  { title: "R8 — SAFETY HYGIENE (no secrets, low-risk bias, unsupported surfaced)", indexes: [16, 17, 18, 19] },
];

/**
 * Render the structured CONTEXT PACKET JSON envelope. Counts only — no
 * raw user request, no raw catalog content, no integration account
 * labels, no canvas node ids. Sanitizer-safe by construction.
 *
 * AI-30 — also reports the narrowing decision (`catalog.providersTotal`,
 * `catalog.narrowingMode`, `catalog.narrowingReason`) so the model knows
 * when the catalog it sees has been narrowed and can apply the R1
 * narrowing-aware no-substitution rule with confidence.
 */
function renderContextPacket(
  fullCatalog: WorkflowPlanPromptInput["catalog"],
  effectiveCatalog: WorkflowPlanPromptInput["catalog"],
  input: WorkflowPlanPromptInput,
  narrowing: NarrowProvidersResult,
): string {
  const providersIncluded = effectiveCatalog.providers.filter(isUsableProvider).length;
  const providersTotal = fullCatalog.providers.filter(isUsableProvider).length;
  const packet = {
    task: "workflow_plan",
    promptVersion: PLANNER_PACKET_VERSION,
    mode: input.currentGraph && input.currentGraph.nodes.length > 0 ? "edit" : "create",
    currentCanvas: {
      nodeCount: input.currentGraph?.nodes.length ?? 0,
      edgeCount: input.currentGraph?.edges.length ?? 0,
    },
    connectedIntegrationCount: input.connectedIntegrations.length,
    catalog: {
      providersIncluded,
      providersTotal,
      // AI-30: the model needs the narrowing mode + reason so it can act
      // on R1's narrowing-aware no-substitution clause. Reason is null
      // (JSON serializes to `null`) when narrowing was applied so the
      // shape stays stable. No provider id arrays here — only counts +
      // enums, sanitizer-safe.
      narrowingMode: narrowing.mode,
      narrowingReason: narrowing.fallbackReason,
    },
    constraints: {
      noSubstitution: true,
      noRequiredFieldGuessing: true,
      noMutationDuringPlan: true,
      nullPatchWhenBlocked: true,
      outputNamesMustBeDeclared: true,
      neverInventCredentials: true,
    },
  };
  return [
    "Context packet (machine-readable summary; the detailed sections follow):",
    "```json",
    JSON.stringify(packet, null, 2),
    "```",
    "The user's request is in the user message that follows this system message.",
  ].join("\n");
}

/**
 * Render the eight CRITICAL RULES groups. Each group's body is the
 * verbatim PLANNER_CONSTRAINTS entries for its indexes, joined with a
 * blank line so the model sees them as separate clauses.
 */
function renderCriticalRules(): string {
  const lines: string[] = [
    "CRITICAL RULES (non-negotiable; violations are rejected downstream):",
  ];
  for (const group of RULE_GROUPS) {
    lines.push("");
    lines.push(group.title);
    for (const idx of group.indexes) {
      const rule = PLANNER_CONSTRAINTS[idx];
      if (rule) lines.push(`- ${rule}`);
    }
  }
  return lines.join("\n");
}

/**
 * Slice 4.AI-29 — structured packet builder. Same deterministic output
 * contract as `buildWorkflowPlanPromptV1WithAttribution` (every
 * substring still present, attribution shape unchanged) but reorganized
 * for machine scannability. See file-level JSDoc for the section
 * layout.
 */
export function buildWorkflowPlanPromptV2WithAttribution(
  input: WorkflowPlanPromptInput,
): { readonly messages: ModelMessage[]; readonly attribution: PlannerPromptAttribution } {
  // AI-30 — narrow the catalog deterministically before rendering. The
  // helper returns the FULL catalog with `mode: "full-catalog"` when it
  // can't safely narrow (broad request, complex-canvas vague edit, env
  // disabled). The R1 narrowing-aware no-substitution rule is the model-
  // side defense in depth; the CONTEXT PACKET below reports the mode +
  // reason so the model can act on it.
  const narrowing = narrowProvidersForPlan({
    userRequest: input.userRequest,
    catalog: input.catalog,
    connectedIntegrations: input.connectedIntegrations,
    ...(input.currentGraph ? { currentGraph: input.currentGraph } : {}),
  });
  const effectiveCatalog = filterCatalogToNarrowed(input.catalog, narrowing);
  const effectiveInput: WorkflowPlanPromptInput = {
    ...input,
    catalog: effectiveCatalog,
  };

  const preamble =
    "You are ChainReact's workflow planner. You design an automation workflow from the user's request by proposing a WorkflowPatch grounded ONLY in the metadata provided below.";
  const contextPacketSection = renderContextPacket(
    input.catalog,
    effectiveCatalog,
    input,
    narrowing,
  );
  const rulesSection = renderCriticalRules();
  const catalogSection = `Available providers, triggers, and actions (the ONLY ones you may use):\n${renderCatalog(effectiveInput)}`;
  const connectedSection = renderConnectedIntegrations(effectiveInput);
  const canvasSection = renderCurrentGraph(effectiveInput);

  const sections: string[] = [
    preamble,
    contextPacketSection,
    rulesSection,
    TEMPLATE_FUTURE_NOTE,
    catalogSection,
    connectedSection,
    canvasSection,
  ];

  const costSection = renderCostAwareness(input.costAwareness);
  if (costSection) sections.push(costSection);

  // The patch-shape guide + value-shape rules + JSON output rules round
  // out the system message. Same verbatim text as v1; v2 keeps them as
  // the FINAL instructions (recency) so the strict-JSON / tool-use
  // contract is the last thing the model reads before generating.
  sections.push(`Response format:\n${RESPONSE_SCHEMA_DESCRIPTION_V2}`);
  sections.push(PATCH_SHAPE_GUIDE);
  sections.push(VALUE_SHAPE_RULES);
  sections.push(JSON_OUTPUT_RULES);

  const systemContent = sections.join("\n\n");
  const userContent = input.userRequest;

  const messages: ModelMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];

  const attribution = computePlannerAttribution({
    packetVersion: PLANNER_PACKET_VERSION,
    fullCatalog: input.catalog,
    effectiveCatalog,
    systemContent,
    userContent,
    catalogSection,
    rulesSection,
    connectedSection,
    canvasSection,
    connectedIntegrationCount: input.connectedIntegrations.length,
    currentGraph: input.currentGraph,
    narrowing,
  });

  return { messages, attribution };
}

/**
 * Response-schema description rendered in v2. Mirrors the v1 string
 * (referenced by tests) — kept here so v2 stays independent of v1's
 * private constant.
 */
const RESPONSE_SCHEMA_DESCRIPTION_V2 = [
  "Return JSON with exactly these top-level keys:",
  '- "intentSummary" (string): one sentence describing what the workflow will do.',
  '- "assumptions" (string[]): assumptions you made; [] if none.',
  '- "requiredUserInput" (array): { label, kind, nodeId?, field? } for each value the user must still supply. kind is one of "config_value" | "select_integration" | "choose_trigger" | "variable_reference" | "clarification".',
  '- "proposedPatch" (object | null): a WorkflowPatch (patchId, workflowId, baseRevision, operations[], summary, rationale) that builds the workflow, or null when you need user input or cannot satisfy the request.',
  '- "confidence" ("high" | "medium" | "low").',
  '- "safetyNotes" (string[]): risks/destructive steps the user should review; [] if none.',
  '- "unsupportedRequests" (string[]): parts of the request you could not satisfy with available metadata; [] if none.',
].join("\n");
