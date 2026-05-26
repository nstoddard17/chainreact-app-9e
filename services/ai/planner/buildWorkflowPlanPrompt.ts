/**
 * Deterministic workflow-plan prompt builder (Slice 4.AI-8A).
 *
 * Pure + deterministic: given a user request, the AI-2 provider catalog, and
 * the caller's connected integrations, it produces the system+user messages the
 * future planner (AI-8B) will hand to a {@link ModelClient}. It does NOT call a
 * model, touch repos, mutate anything, or create a workflow.
 *
 * Grounding guarantees (the whole point of this slice):
 *   - The model is told it may ONLY use providers/actions/triggers present in
 *     the catalog below — it cannot invent a provider, action, trigger, or
 *     field. Pending providers (no metadata → no action/trigger keys) never
 *     appear, so the model can't reference them.
 *   - Missing values become AI_FIELD placeholders or `requiredUserInput`, never
 *     guessed literals; credentials are never invented.
 *   - The prompt carries no secrets — it is built from the redacted AI-2 views,
 *     which expose display labels / keys / capabilities only.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4.2/§6.
 */

import type { ModelMessage } from "@/core/ai/modelTypes";
import { SUPPORTED_OPERATION_KINDS } from "@/services/workflows/patch";
import type {
  CatalogActionEntry,
  CatalogFieldOptions,
  ProviderCatalogEntry,
} from "@/services/ai/tools/providerCatalog";
import type {
  WorkflowPlanCostAwareness,
  WorkflowPlanPromptInput,
} from "./types";

/** Hard constraints the model must obey. Tests pin these exact intents. */
export const PLANNER_CONSTRAINTS: readonly string[] = [
  "Use ONLY the providers, actions, and triggers listed in the catalog below. Never invent a provider, action, trigger, or field name.",
  "Use field names exactly as they appear in the node metadata. Do not add fields that are not declared.",
  "Respond with EXACTLY ONE JSON object that matches the response schema and nothing else — the first character must be { and the last must be }. No prose, no markdown, no ```json fences, no comments, and no trailing commas.",
  "When a value is unknown, do NOT guess: emit an AI_FIELD placeholder ({{AI_FIELD:fieldName}}) for free-text content, or add a requiredUserInput entry for anything else (ids, enums, selections).",
  "If you cannot build a COMPLETE, schema-valid WorkflowPatch — a required node id, enum value, recipient, or selection is unknown and has no upstream source — set proposedPatch to null and list what is still needed under requiredUserInput. NEVER emit a partial, approximate, or guessed patch; a null patch with clear requiredUserInput is always better than an invalid one.",
  "Follow the WorkflowPatch shape below EXACTLY (envelope keys, operation vocabulary, node shape, edge shape). A patch with the wrong shape, an unknown operation, or an extra key is rejected before it can be reviewed.",
  "Never include secrets, API keys, access tokens, passwords, or auth-header values. Never invent credentials — connecting an integration is the user's job.",
  "Prefer low-risk, non-destructive actions. Avoid destructive or confirmation-required actions unless the user explicitly asked for them, and note them in safetyNotes.",
  "If part of the request cannot be satisfied with the available metadata, list it under unsupportedRequests instead of approximating it.",
  "Do not echo the user's secrets, message bodies, or file contents back into the plan.",
];

/**
 * Future-readiness note: templates are referenced as a FUTURE context source so
 * the contract is template-aware, but AI-8A has NO template dependency and the
 * model must not assume any template exists.
 */
export const TEMPLATE_FUTURE_NOTE =
  "Template-based creation is not available yet. Build the workflow from the provider catalog below, not from templates. (Template hooks are reserved for a future slice.)";

const RESPONSE_SCHEMA_DESCRIPTION = [
  "Return JSON with exactly these top-level keys:",
  '- "intentSummary" (string): one sentence describing what the workflow will do.',
  '- "assumptions" (string[]): assumptions you made; [] if none.',
  '- "requiredUserInput" (array): { label, kind, nodeId?, field? } for each value the user must still supply. kind is one of "config_value" | "select_integration" | "choose_trigger" | "variable_reference" | "clarification".',
  '- "proposedPatch" (object | null): a WorkflowPatch (patchId, workflowId, baseRevision, operations[], summary, rationale) that builds the workflow, or null when you need user input or cannot satisfy the request.',
  '- "confidence" ("high" | "medium" | "low").',
  '- "safetyNotes" (string[]): risks/destructive steps the user should review; [] if none.',
  '- "unsupportedRequests" (string[]): parts of the request you could not satisfy with available metadata; [] if none.',
].join("\n");

/**
 * Exact structural contract for `proposedPatch` (Slice 4.AI-12B). The strict
 * AI-3 `WorkflowPatchSchema` rejects any patch whose envelope, operation, node,
 * or edge shape drifts from this — so a valid request would otherwise fail
 * parsing (INVALID_PATCH) before the deterministic preview ever runs. The
 * operation vocabulary is sourced from `SUPPORTED_OPERATION_KINDS`, so this guide
 * can never drift from the schema it describes.
 */
export const PATCH_SHAPE_GUIDE = [
  "WorkflowPatch shape (the value of proposedPatch). Match it EXACTLY — a missing key, an extra key, or an unknown operation is rejected before review.",
  'Envelope keys (all required): "patchId" (any unique string), "workflowId" (set to null — the system fills it in), "baseRevision" (set to "" — the system fills it in), "operations" (array with at least one entry), "summary" (string), "rationale" (string).',
  `Each operations[] entry has an "op" that is EXACTLY one of: ${SUPPORTED_OPERATION_KINDS.join(", ")}. An operation object may contain ONLY the keys listed for its op below — any extra key fails validation.`,
  '- addNode: { "op": "addNode", "node": <Node> } — add a trigger or action node.',
  '- addEdge: { "op": "addEdge", "edge": <Edge> } — connect two nodes.',
  '- updateNodeConfig: { "op": "updateNodeConfig", "nodeId": string, "config": object, "replace"?: boolean }.',
  '- removeNode: { "op": "removeNode", "nodeId": string }.',
  '- removeEdge: { "op": "removeEdge", "edgeId": string }.',
  '- replaceEdge: { "op": "replaceEdge", "edgeId": string, "edge": <Edge> }.',
  '- moveNode: { "op": "moveNode", "nodeId": string, "position": { "x": number, "y": number } }.',
  '- repairVariableReference: { "op": "repairVariableReference", "nodeId": string, "fieldPath": string, "newReference": string }.',
  '- replaceTrigger: { "op": "replaceTrigger", "node": <Node> }.',
  'Node shape: { "id": string (unique within the patch), "kind": "trigger" | "action", "provider": string, "type": string, "config": object, "position": { "x": number, "y": number } }.',
  "Catalog entries are written `provider:type` (e.g. `slack:send_direct_message`). In a node you MUST split that key: set provider to the part before the colon (\"slack\") and type to the part after it (\"send_direct_message\"). Never put the combined `provider:type` string into either field.",
  'Edge shape: { "id": string (unique within the patch), "from": string (source node id), "to": string (target node id), "label"?: string (optional branch label) }. The endpoint keys are "from" and "to" — never "source"/"target".',
  "config maps a node's metadata field names to values. Use {{AI_FIELD:fieldName}} for unknown free-text; for an unknown id/enum/selection, omit the field and add a requiredUserInput entry. Never invent a config field name and never include a secret value.",
  "A typical brand-new workflow is: one addNode for the trigger, one addNode per action, and addEdge operations linking them in order.",
].join("\n");

/**
 * JSON-only output contract (Slice 4.AI-12C). Rendered LAST so it is the final
 * instruction before generation (recency), reinforcing the constraint near the
 * top. Paired with the Anthropic adapter's assistant-`{` prefill, this is the
 * fix for `parse/NOT_JSON` (model returning prose / a fenced block instead of a
 * bare JSON object). The parser stays strict — it is NOT a broad JSON extractor.
 */
export const JSON_OUTPUT_RULES = [
  "OUTPUT FORMAT — follow exactly:",
  "- Return EXACTLY ONE JSON object and nothing else.",
  "- The FIRST character of your response must be { and the LAST character must be }.",
  "- Do NOT use markdown. Do NOT wrap the JSON in ```json or ``` code fences.",
  "- Do NOT write any prose, preamble, explanation, or commentary before or after the JSON object.",
  "- Do NOT include comments or trailing commas — it must be strict, parseable JSON.",
  "- If you are unsure or cannot complete the plan, STILL return one JSON object with proposedPatch set to null and the gaps listed in requiredUserInput.",
].join("\n");

function renderActionEntry(a: CatalogActionEntry): string {
  const flags: string[] = [];
  if (a.isDestructive) flags.push("destructive");
  if (a.requiresConfirmation) flags.push("requires-confirmation");
  if (a.riskLevel !== "low") flags.push(`risk:${a.riskLevel}`);
  const suffix = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
  return `${a.key}${suffix}`;
}

/** A provider is usable only if metadata exposes at least one action or trigger. */
function isUsableProvider(p: ProviderCatalogEntry): boolean {
  return p.actions.length > 0 || p.triggers.length > 0;
}

function renderFieldOptions(opts: readonly CatalogFieldOptions[]): string {
  return opts.map((o) => `${o.field}: [${o.values.join(", ")}]`).join("; ");
}

/**
 * Static-enum config grounding (Slice 4.AI-12B): for every action/trigger whose
 * metadata declares fixed `options` (select/combobox), surface the field's
 * allowed VALUES so the model picks a real enum instead of guessing. Generic and
 * metadata-driven — no provider-specific logic. Entries without static options
 * (the common case) produce nothing, keeping the compact catalog lean.
 */
function renderNodeOptionLines(
  entries: readonly { key: string; configOptions?: readonly CatalogFieldOptions[] }[],
): string[] {
  const lines: string[] = [];
  for (const e of entries) {
    if (e.configOptions && e.configOptions.length > 0) {
      lines.push(`      ${e.key} — ${renderFieldOptions(e.configOptions)}`);
    }
  }
  return lines;
}

function renderProvider(p: ProviderCatalogEntry): string {
  const lines: string[] = [`- ${p.displayName} (id: ${p.id})`];
  if (p.triggers.length > 0) {
    lines.push(`    triggers: ${p.triggers.map((t) => t.key).join(", ")}`);
  }
  if (p.actions.length > 0) {
    lines.push(`    actions: ${p.actions.map(renderActionEntry).join(", ")}`);
  }
  const optionLines = [
    ...renderNodeOptionLines(p.triggers),
    ...renderNodeOptionLines(p.actions),
  ];
  if (optionLines.length > 0) {
    lines.push("    config options (use these exact values):");
    lines.push(...optionLines);
  }
  return lines.join("\n");
}

function renderCatalog(input: WorkflowPlanPromptInput): string {
  const usable = input.catalog.providers.filter(isUsableProvider);
  if (usable.length === 0) {
    return "No providers with usable metadata are available. Only built-in logic may be used.";
  }
  return usable.map(renderProvider).join("\n");
}

function renderConnectedIntegrations(input: WorkflowPlanPromptInput): string {
  if (input.connectedIntegrations.length === 0) {
    return "The user has no connected integrations yet. Any action or trigger that requires an integration will need the user to connect it first — surface that via requiredUserInput (kind: select_integration) and safetyNotes.";
  }
  const lines = input.connectedIntegrations.map((i) => {
    const account = i.accountLabel ? `account: ${i.accountLabel}` : "account: default";
    const scope = i.accountScope ? `, scope: ${i.accountScope}` : "";
    return `- ${i.provider} (${account}${scope})`;
  });
  return ["The user has connected these integrations:", ...lines].join("\n");
}

function renderCostAwareness(cost: WorkflowPlanCostAwareness | undefined): string | null {
  if (!cost) return null;
  const parts: string[] = [];
  if (typeof cost.estimatedTasksPerRunHint === "number") {
    parts.push(`Rough cost so far: ~${cost.estimatedTasksPerRunHint} task(s) per run.`);
  }
  for (const note of cost.notes ?? []) parts.push(note);
  if (parts.length === 0) return null;
  return ["Cost / risk awareness (prefer cheaper, lower-risk plans):", ...parts.map((p) => `- ${p}`)].join("\n");
}

/**
 * Build the deterministic system+user messages for a ground-up workflow plan.
 * Returns `ModelMessage[]` ready to drop into `ModelGenerateInput.messages`.
 */
export function buildWorkflowPlanPrompt(
  input: WorkflowPlanPromptInput,
): ModelMessage[] {
  const sections: string[] = [
    "You are ChainReact's workflow planner. You design an automation workflow from the user's request by proposing a WorkflowPatch grounded ONLY in the metadata provided below.",
    `Rules:\n${PLANNER_CONSTRAINTS.map((c) => `- ${c}`).join("\n")}`,
    TEMPLATE_FUTURE_NOTE,
    `Available providers, triggers, and actions (the ONLY ones you may use):\n${renderCatalog(input)}`,
    renderConnectedIntegrations(input),
  ];

  const costSection = renderCostAwareness(input.costAwareness);
  if (costSection) sections.push(costSection);

  sections.push(`Response format:\n${RESPONSE_SCHEMA_DESCRIPTION}`);
  sections.push(PATCH_SHAPE_GUIDE);
  sections.push(JSON_OUTPUT_RULES);

  return [
    { role: "system", content: sections.join("\n\n") },
    { role: "user", content: input.userRequest },
  ];
}
