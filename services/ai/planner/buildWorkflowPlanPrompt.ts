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
  CatalogConfigField,
  CatalogFieldOptions,
  CatalogOutputField,
  CatalogTriggerEntry,
  ProviderCatalogEntry,
} from "@/services/ai/tools/providerCatalog";
import type {
  WorkflowPlanCostAwareness,
  WorkflowPlanPromptInput,
} from "./types";

/** Hard constraints the model must obey. Tests pin these exact intents. */
export const PLANNER_CONSTRAINTS: readonly string[] = [
  "Use ONLY the providers, actions, and triggers listed in the catalog below. Never invent a provider, action, trigger, or field name.",
  "config object keys MUST come from the catalog's `config fields:` block for that node. Never use a key derived from the action/trigger displayName, the field's UI label, the field's description, or an output name — those are NOT config keys. Example: `slack:send_direct_message` has config field `text` (not `message`); `native:if_then_condition` has config field `input` (not `field`).",
  "Match each config value's SHAPE to the field's renderer type and `multi-select` flag (see the value-shape rules below). A `multi-select` field requires an ARRAY of allowed option values — e.g. `enabledEvents: [\"payment_intent.payment_failed\"]`, NOT the scalar `\"payment_intent.payment_failed\"`. A single-select takes ONE value.",
  "Every field listed under `required:` for a node MUST appear in that node's config — either as a literal value (only for static enums or known ids), an upstream `{{nodeId.field}}` variable reference, or an `{{AI_FIELD:fieldName}}` placeholder for free-text content. Do not omit a required field.",
  "If a required field is an id, enum, selection, or recipient that you cannot derive from the catalog or an upstream node, set proposedPatch to null and add a requiredUserInput entry for it. A null patch with clear requiredUserInput is always better than an invalid one.",
  "Variable references `{{nodeId.field}}` (or `{{trigger.field}}` when nodeId is the trigger) MUST use ONLY the output names declared in that node's `outputs:` block. Do NOT invent output keys (e.g. `id`, `amount`, `currency`, `last_payment_error`) from a provider's public API documentation, the displayName, or general knowledge — if metadata doesn't list it, V2 doesn't expose it and the patch is rejected. For opaque object outputs (e.g. an event's `data` payload) you MAY descend into nested paths, but values inside are NOT metadata-validated — prefer top-level declared outputs (e.g. `{{trigger.stripeEventType}}`) for message bodies and use `{{AI_FIELD:fieldName}}` or `requiredUserInput` when no declared output fits.",
  "Do NOT substitute a different trigger for one the user explicitly asked for. If the user names a triggering event (e.g. \"when a Stripe payment fails\", \"on new Salesforce lead\") and no matching trigger key appears in the catalog, set proposedPatch to null, list the requested trigger under unsupportedRequests, and surface anything else still needed under requiredUserInput. `native:manual.run` is for user-initiated workflows ONLY — never use it as a stand-in for an event-driven trigger the user actually asked for.",
  "Connected-integration awareness: every action/trigger you propose for a provider that does NOT appear in the connected-integrations list above MUST be accompanied by a `requiredUserInput` entry with `kind: \"select_integration\"` naming that provider — e.g. `{ label: \"Connect Stripe\", kind: \"select_integration\" }`. Do NOT claim the workflow is ready, do NOT say a provider is connected when it isn't, and do NOT silently substitute a different connected provider's trigger/action for the user's requested one. You MAY still propose the patch as a draft so the user can review the shape; the missing-connection requirement is what the UI surfaces as the blocker. Conversely: when a provider IS in the connected list, do not add a `select_integration` entry for it.",
  "\"Me\" resolution: when the user refers to themselves (\"me\" / \"myself\" / \"I\" / \"send me\") as a per-user recipient — typically the `userId` on a DM action — resolve it from the connected integration's `me=<id>` value when present. Example: for `slack:send_direct_message.userId`, if the connected slack entry shows `me=U01ABC23DEF`, set `userId: \"U01ABC23DEF\"`. If the connected provider has NO `me=` value, add a `requiredUserInput` entry asking for the recipient (e.g. `{ label: \"Which Slack user should receive the DM?\", kind: \"config_value\", field: \"userId\" }`) and use `{{AI_FIELD:userId}}` is NOT correct here — recipient ids are not free text. NEVER guess a user id, NEVER use a bot user id as the human recipient, NEVER use a channel id where a user id is required.",
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
 * Per-renderer-type value-shape grounding (Slice 4.AI-16). Rendered after
 * `PATCH_SHAPE_GUIDE` so the model has a concrete table when assembling a
 * node's `config` object. Type-mapping is generic and metadata-driven —
 * no per-provider logic. The actual SHAPE the runtime expects is owned by
 * the handler's strict Zod schema; this guide mirrors that contract so the
 * planner produces patches that pass AI-3's `INVALID_CONFIG` check.
 */
export const VALUE_SHAPE_RULES = [
  "Config value shape per renderer type (the `config fields:` block above tags each field with its renderer type — match the value to that type):",
  "- `text` / `textarea` — string. Free-text content; OK to embed `{{nodeId.field}}` refs and `{{AI_FIELD:fieldName}}` placeholders.",
  "- `number` — number (NOT a string).",
  "- `boolean` — true or false (NOT \"true\"/\"false\").",
  "- `cron` — string (a cron expression).",
  "- `select` (without `multi-select`) — exactly ONE of the static option values declared under `config options` for that field.",
  "- `select` with `multi-select` — array of static option values: `[\"valueA\", \"valueB\"]`. NEVER a scalar string.",
  "- `combobox` (without `multi-select`) — one option value, OR an upstream `{{nodeId.field}}` reference for a dynamic picker. Treat it as a single-pick id field.",
  "- `combobox` with `multi-select` — array of values: `[\"valueA\", \"valueB\"]`. NEVER a scalar string. Example: Stripe `enabledEvents: [\"payment_intent.payment_failed\"]`.",
  "- `keyvalue` — object: `{ \"key\": \"value\" }`. Not an array.",
  "- `string-array` — array of strings: `[\"a\", \"b\"]`.",
  "- `file` — string (a `{{nodeId.path}}` FileRef reference). Never inline file content.",
  "- `file-array` — array of FileRef references / objects per the action's docs.",
  "- `router-routes` — array of route objects per the action's docs.",
  "If a required field cannot be filled with a value of the correct shape, set proposedPatch to null and add a requiredUserInput entry — never coerce a scalar into an array or vice-versa.",
].join("\n");

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
  "config maps a node's declared `config fields:` (shown in the catalog above) to values. Keys MUST come from that per-node list — never from a displayName, the field's UI label, the field's description, or an output name. Every field shown under `required:` for the node must appear in config (a literal, an upstream {{nodeId.field}} reference, or an {{AI_FIELD:fieldName}} placeholder for free-text). For an unknown id/enum/selection, omit the field AND add a requiredUserInput entry; if a REQUIRED field still cannot be filled, set proposedPatch to null. Never invent a config field name and never include a secret value.",
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

function renderActionFlags(a: CatalogActionEntry): string {
  const flags: string[] = [];
  if (a.isDestructive) flags.push("destructive");
  if (a.requiresConfirmation) flags.push("requires-confirmation");
  if (a.riskLevel !== "low") flags.push(`risk:${a.riskLevel}`);
  return flags.length > 0 ? ` [${flags.join(", ")}]` : "";
}

/** A provider is usable only if metadata exposes at least one action or trigger. */
function isUsableProvider(p: ProviderCatalogEntry): boolean {
  return p.actions.length > 0 || p.triggers.length > 0;
}

function renderFieldOptions(opts: readonly CatalogFieldOptions[]): string {
  return opts.map((o) => `${o.field}: [${o.values.join(", ")}]`).join("; ");
}

/**
 * Declared config-field grounding (Slice 4.AI-12D, extended in 4.AI-16): for
 * every action / trigger, print the EXACT config key names the planner must
 * use, split into a `required:` and an `optional:` line, with each entry tagged
 * by renderer type. Multi-select fields are tagged `multi-select` so the model
 * picks an array value shape instead of a scalar. Generic + metadata-driven —
 * derived from the catalog's `configFields`, no provider-specific logic.
 * Required is always present (may be empty); optional is omitted when the node
 * declares none, to keep the prompt lean.
 */
function renderConfigFieldLines(fields: readonly CatalogConfigField[]): string[] {
  const required = fields.filter((f) => f.required);
  const optional = fields.filter((f) => !f.required);
  const lines: string[] = ["      config fields:"];
  const fmt = (f: CatalogConfigField) =>
    `${f.name} (${f.type}${f.multiple === true ? ", multi-select" : ""})`;
  lines.push(
    `        required: ${required.length > 0 ? required.map(fmt).join(", ") : "<none>"}`,
  );
  if (optional.length > 0) {
    lines.push(`        optional: ${optional.map(fmt).join(", ")}`);
  }
  return lines;
}

/**
 * Declared-output grounding (Slice 4.AI-16): for every action / trigger,
 * print the EXACT top-level output names the planner may use in downstream
 * `{{nodeId.<name>}}` / `{{trigger.<name>}}` variable references. Sensitive
 * outputs are tagged so the model knows the container is opaque (it may
 * descend into nested paths but values inside are not metadata-validated —
 * the planner constraint steers it to prefer top-level declared outputs
 * anyway). Omitted entirely when a node declares no outputs.
 */
function renderOutputLines(outputs: readonly CatalogOutputField[]): string[] {
  if (outputs.length === 0) return [];
  const fmt = (o: CatalogOutputField) =>
    `${o.name} (${o.type}${o.sensitive === true ? ", sensitive" : ""})`;
  return [`        outputs: ${outputs.map(fmt).join(", ")}`];
}

function renderTriggerEntry(t: CatalogTriggerEntry): string[] {
  const lines: string[] = [`    - ${t.key}`];
  lines.push(...renderConfigFieldLines(t.configFields));
  if (t.configOptions && t.configOptions.length > 0) {
    lines.push(
      `        config options (use these exact values): ${renderFieldOptions(t.configOptions)}`,
    );
  }
  lines.push(...renderOutputLines(t.outputs));
  return lines;
}

function renderActionEntryLines(a: CatalogActionEntry): string[] {
  const lines: string[] = [`    - ${a.key}${renderActionFlags(a)}`];
  lines.push(...renderConfigFieldLines(a.configFields));
  if (a.configOptions && a.configOptions.length > 0) {
    lines.push(
      `        config options (use these exact values): ${renderFieldOptions(a.configOptions)}`,
    );
  }
  lines.push(...renderOutputLines(a.outputs));
  return lines;
}

function renderProvider(p: ProviderCatalogEntry): string {
  const lines: string[] = [`- ${p.displayName} (id: ${p.id})`];
  if (p.triggers.length > 0) {
    lines.push("  triggers:");
    for (const t of p.triggers) lines.push(...renderTriggerEntry(t));
  }
  if (p.actions.length > 0) {
    lines.push("  actions:");
    for (const a of p.actions) lines.push(...renderActionEntryLines(a));
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
    // Slice 4.AI-17: surface the installing-user's in-provider identity so the
    // planner can resolve "me" without asking. Omitted when the provider didn't
    // capture it during OAuth (the planner then asks via requiredUserInput).
    const meId = i.currentUserId ? `, me=${i.currentUserId}` : "";
    return `- ${i.provider} (${account}${scope}${meId})`;
  });
  return [
    "The user has connected these integrations (any provider NOT listed below is DISCONNECTED — every action/trigger from a disconnected provider requires connecting it first):",
    ...lines,
  ].join("\n");
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
  sections.push(VALUE_SHAPE_RULES);
  sections.push(JSON_OUTPUT_RULES);

  return [
    { role: "system", content: sections.join("\n\n") },
    { role: "user", content: input.userRequest },
  ];
}
