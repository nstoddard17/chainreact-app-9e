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
import type {
  CatalogActionEntry,
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
  "Respond with a SINGLE JSON object that matches the response schema and nothing else — no prose, no markdown, no code fences.",
  "When a value is unknown, do NOT guess: emit an AI_FIELD placeholder ({{AI_FIELD:fieldName}}) for free-text content, or add a requiredUserInput entry for anything else (ids, enums, selections).",
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

function renderProvider(p: ProviderCatalogEntry): string {
  const lines: string[] = [`- ${p.displayName} (id: ${p.id})`];
  if (p.triggers.length > 0) {
    lines.push(`    triggers: ${p.triggers.map((t) => t.key).join(", ")}`);
  }
  if (p.actions.length > 0) {
    lines.push(`    actions: ${p.actions.map(renderActionEntry).join(", ")}`);
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

  return [
    { role: "system", content: sections.join("\n\n") },
    { role: "user", content: input.userRequest },
  ];
}
