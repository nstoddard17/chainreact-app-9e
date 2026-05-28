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
import {
  PLANNER_PACKET_VERSION_V1,
  type PlannerPromptAttribution,
  type WorkflowPlanCostAwareness,
  type WorkflowPlanPromptInput,
} from "./types";
import { buildWorkflowPlanPromptV2WithAttribution } from "./buildWorkflowPlanPromptV2";
import { computePlannerAttribution } from "./computePlannerAttribution";
import {
  filterCatalogToNarrowed,
  narrowProvidersForPlan,
} from "./narrowProvidersForPlan";
import { resolvePromptClassifier } from "./resolvePromptClassifier";

/** Hard constraints the model must obey. Tests pin these exact intents. */
export const PLANNER_CONSTRAINTS: readonly string[] = [
  "Use ONLY the providers, actions, and triggers listed in the catalog below. Never invent a provider, action, trigger, or field name.",
  // Slice 4.AI-24 — HARD no-substitution rule. Top-of-list prominence is
  // deliberate: prior to AI-24 this lived as a single mid-list trigger-only
  // rule (`Do NOT substitute a different trigger…`) and Marcus's smoke
  // surfaced the model emitting `native:manual.run → slack:send_channel_message`
  // for the prompt "Send a slack message when I get an email" — substituting
  // Manual Trigger for the requested Gmail new-email event AND silently
  // narrowing the requested Slack semantics. AI-24 promotes the rule to a
  // comprehensive prohibition covering trigger, action, and provider
  // substitution; the prior single-bullet rule is folded in here.
  "HARD RULE — NEVER substitute a different provider, action, or trigger for one the user explicitly asked for. This rule is non-negotiable and overrides any preference for emitting a non-null patch. (a) PROVIDER substitution is forbidden: Gmail → Outlook, Slack → Discord, Stripe → Square, Google Drive → OneDrive — all forbidden without explicit user approval; if the user names a provider that is not in the catalog OR is disconnected, set proposedPatch to null, list the requested provider+capability under unsupportedRequests (or surface a `select_integration` requiredUserInput for the disconnected-but-supported case), and STOP — do not propose a different provider's trigger/action just because it is in the catalog or connected. (b) TRIGGER substitution is forbidden: Manual Trigger (`native:manual.run`), HTTP/webhook trigger, and Schedule trigger are NEVER stand-ins for an event-driven trigger the user named. `native:manual.run` is allowed ONLY when the user explicitly asked for manual / on-demand / \"run manually\" / \"test manually\" behavior. HTTP / webhook triggers are allowed ONLY when the user explicitly asked for webhook / HTTP / inbound-API behavior. Schedule / cron triggers are allowed ONLY when the user explicitly asked for time-based / scheduled / recurring behavior. Any other trigger substitution — including \"the user asked for Gmail new-email but I'll use Manual Trigger so the patch applies\" — is a violation. (c) ACTION substitution is forbidden: \"send a Slack DM\" requires `slack:send_direct_message`, NOT `slack:send_channel_message`; \"send a Gmail email\" requires Gmail, NOT Outlook; \"create a Notion page\" requires Notion, NOT Confluence. Even within the same provider, do not narrow or widen the requested action's semantics (DM ↔ channel, draft ↔ send, comment ↔ message). (d) When the requested capability is missing, unavailable, disconnected, or has no metadata, set proposedPatch to null + add the explicit `unsupportedRequests` entry naming the exact requested provider+capability + add `requiredUserInput` entries for any setup (e.g. `{ label: \"Connect Gmail\", kind: \"select_integration\" }`) — and STOP. A null patch with a clear unsupported / required-setup explanation is ALWAYS the right answer over a substitution patch.",
  // Slice 4.AI-24 — current-canvas awareness. Wired in `buildWorkflowPlanRequest`.
  "Current workflow context: when a `Current workflow on the canvas` section is provided below it lists the nodes presently on the user's builder canvas (provider:type pairs only — no config). It is the AUTHORITATIVE picture of what the user has right now; the persisted server copy may lag. If the user's request implies replacing the existing trigger (e.g. canvas has `native:manual.run` but the request names a Gmail email trigger) emit a `replaceTrigger` operation, NOT a substitution; if the user's request implies adding to / editing existing nodes, prefer `updateNodeConfig` / targeted `addNode` over rebuilding the canvas. Empty Current-workflow section means the canvas is empty — build from scratch. The catalog + no-substitution rule above still bind: existing canvas nodes never license a substitution.",
  "config object keys MUST come from the catalog's `config fields:` block for that node. Never use a key derived from the action/trigger displayName, the field's UI label, the field's description, or an output name — those are NOT config keys. Example: `slack:send_direct_message` has config field `text` (not `message`); `native:if_then_condition` has config field `input` (not `field`).",
  "Match each config value's SHAPE to the field's renderer type and `multi-select` flag (see the value-shape rules below). A `multi-select` field requires an ARRAY of allowed option values — e.g. `enabledEvents: [\"payment_intent.payment_failed\"]`, NOT the scalar `\"payment_intent.payment_failed\"`. A single-select takes ONE value.",
  "Every field listed under `required:` for a node MUST appear in that node's config — either as a literal value (only for static enums or known ids), an upstream `{{nodeId.field}}` variable reference, or an `{{AI_FIELD:fieldName}}` placeholder for free-text content. Do not omit a required field.",
  "If a required field is an id, enum, selection, or recipient that you cannot derive from the catalog or an upstream node, set proposedPatch to null and add a requiredUserInput entry for it. A null patch with clear requiredUserInput is always better than an invalid one.",
  "Required-field discipline (Slice 4.AI-22): NEVER silently default, guess, or invent a required field's value to make the patch apply-ready. Required fields may be filled ONLY when: (a) the user explicitly supplied the value in the request, (b) it is safely derivable from an upstream node's declared `outputs`, (c) it is safely derivable from connected-integration context (e.g. Slack `me=<userId>` for a DM recipient), (d) the field has an existing safe `defaultValue` declared in its FieldMeta, OR (e) the field is a free-text content field where `{{AI_FIELD:fieldName}}` is appropriate per the AI_FIELD rule. For anything else — channel ids, user ids, record ids, enum picks the user hasn't named, attachments — emit a `requiredUserInput` entry and set proposedPatch to null. Do NOT pick a plausible-looking default value (e.g. \"#general\", \"general\", \"announcements\") for a required selection just to ship a patch.",
  "NEVER treat a display label as an opaque id. If the user said \"send to #general\" you may pass the literal \"#general\" ONLY when the field accepts free-text (renderer type `text`/`textarea`) OR the field's static `config options` list contains \"#general\" as a value. For an id-shaped field (Slack channelId, Discord channelId, Airtable recordId, etc.) WITHOUT a literal-id value in the catalog options AND without a connected resolver result in scope, set proposedPatch to null and add a requiredUserInput entry asking the user to pick the channel. NEVER fabricate ids like `C123456`, `U01ABC23DEF`, `rec12345`. The user picking the value via the React Agent's required-input control (which calls the live options resolver) is the correct path.",
  "Variable references `{{nodeId.field}}` (or `{{trigger.field}}` when nodeId is the trigger) MUST use ONLY the output names declared in that node's `outputs:` block. Do NOT invent output keys (e.g. `id`, `amount`, `currency`, `last_payment_error`) from a provider's public API documentation, the displayName, or general knowledge — if metadata doesn't list it, V2 doesn't expose it and the patch is rejected. For opaque object outputs (e.g. an event's `data` payload) you MAY descend into nested paths, but values inside are NOT metadata-validated — prefer top-level declared outputs (e.g. `{{trigger.stripeEventType}}`) for message bodies and use `{{AI_FIELD:fieldName}}` or `requiredUserInput` when no declared output fits.",
  "Connected-integration awareness: every action/trigger you propose for a provider that does NOT appear in the connected-integrations list above MUST be accompanied by a `requiredUserInput` entry with `kind: \"select_integration\"` naming that provider — e.g. `{ label: \"Connect Stripe\", kind: \"select_integration\" }`. Do NOT claim the workflow is ready, do NOT say a provider is connected when it isn't. (The substitution prohibition at the top of this list already forbids swapping a disconnected provider for a different connected one.) You MAY still propose the patch as a draft so the user can review the shape; the missing-connection requirement is what the UI surfaces as the blocker. Conversely: when a provider IS in the connected list, do not add a `select_integration` entry for it.",
  "\"Me\" resolution: when the user refers to themselves (\"me\" / \"myself\" / \"I\" / \"send me\") as a per-user recipient — typically the `userId` on a DM action — resolve it from the connected integration's `me=<id>` value when present. Example: for `slack:send_direct_message.userId`, if the connected slack entry shows `me=U01ABC23DEF`, set `userId: \"U01ABC23DEF\"`. If the connected provider has NO `me=` value, add a `requiredUserInput` entry asking for the recipient (e.g. `{ label: \"Which Slack user should receive the DM?\", kind: \"config_value\", field: \"userId\" }`) and use `{{AI_FIELD:userId}}` is NOT correct here — recipient ids are not free text. NEVER guess a user id, NEVER use a bot user id as the human recipient, NEVER use a channel id where a user id is required.",
  "Respond with EXACTLY ONE JSON object that matches the response schema and nothing else — the first character must be { and the last must be }. No prose, no markdown, no ```json fences, no comments, and no trailing commas.",
  "When a value is unknown, do NOT guess: emit an AI_FIELD placeholder ({{AI_FIELD:fieldName}}) for free-text content, or add a requiredUserInput entry for anything else (ids, enums, selections).",
  "If you cannot build a COMPLETE, schema-valid WorkflowPatch — a required node id, enum value, recipient, or selection is unknown and has no upstream source — set proposedPatch to null and list what is still needed under requiredUserInput. NEVER emit a partial, approximate, or guessed patch; a null patch with clear requiredUserInput is always better than an invalid one.",
  "Follow the WorkflowPatch shape below EXACTLY (envelope keys, operation vocabulary, node shape, edge shape). A patch with the wrong shape, an unknown operation, or an extra key is rejected before it can be reviewed.",
  "Never include secrets, API keys, access tokens, passwords, or auth-header values. Never invent credentials — connecting an integration is the user's job.",
  "Prefer low-risk, non-destructive actions. Avoid destructive or confirmation-required actions unless the user explicitly asked for them, and note them in safetyNotes.",
  "If part of the request cannot be satisfied with the available metadata, list it under unsupportedRequests instead of approximating it.",
  "Do not echo the user's secrets, message bodies, or file contents back into the plan.",
  // Slice 4.AI-30 — narrowing-aware no-substitution rule. Defense in depth
  // for the HARD no-substitution rule at the top of this list: the catalog
  // is sometimes narrowed for cost, and the model must still refuse to
  // substitute when a named provider isn't in the narrowed view.
  "The catalog above may have been narrowed to a subset of supported providers for cost reasons. The narrowing layer is best-effort: it tries to include every provider the user names, but a missed alias is always possible. If the user explicitly names a provider (or a capability that requires one) that is NOT in the catalog below, do NOT substitute another provider. Set proposedPatch to null, add an `unsupportedRequests` entry naming the requested provider, and add a `requiredUserInput` entry with `kind: \"select_integration\"` for that provider so the user can connect it. This is a defense-in-depth restatement of the top-of-list HARD RULE; the no-substitution prohibition ALWAYS overrides any cost-narrowing assumption. The CONTEXT PACKET JSON at the top of this prompt reports `catalog.providersIncluded` vs `catalog.providersTotal` so you can tell when narrowing was applied.",
  // Slice 4.AI-33 — ambiguous-category clarification. A generic capability
  // word is NOT a specific provider. Closes the live bug where "send a
  // Slack message when I get an email" silently became "when a new email
  // arrives in Gmail" — the model picked Gmail because both Gmail + Outlook
  // were in the (ambiguous-email) narrowed catalog. Sits in R1 next to the
  // no-substitution rule because "assume a provider the user didn't name"
  // is the same failure class as substituting one.
  "Generic provider CATEGORIES are NOT a specific provider. When the user names a capability generically — \"email\", \"calendar\", \"spreadsheet\", \"file storage\" / \"drive\", \"chat\" / \"message\", \"payment\" — and does NOT name the specific provider, and more than one provider in the catalog could satisfy that category, you MUST NOT pick one. Set proposedPatch to null and add a `requiredUserInput` entry asking WHICH provider/app to use (`kind: \"choose_trigger\"` when it's the trigger, otherwise `\"select_integration\"` / `\"clarification\"`), naming the plausible options in the label — e.g. \"Which email app should trigger this — Gmail or Outlook?\". NEVER default \"email\" to Gmail, \"calendar\" to Google Calendar, \"drive\" / \"file storage\" to Google Drive, or \"chat\" / \"message\" to Slack. When the user DOES name the provider (\"a Gmail email\", \"in Outlook\", \"send a Slack message\", \"to my Google Sheet\"), use exactly that provider — naming it resolves the ambiguity.",
  // Slice 4.AI-33 — content-field completeness. Closes the live bug where
  // the model proposed slack:send_channel_message without ever asking what
  // the message should say (it AI_FIELD'd or omitted the text). Grouped
  // into R3 (config grounding / required-field discipline).
  "Free-text CONTENT fields — a chat / Slack / Discord message body, an email subject or body, a document body, a comment — require content the user actually specified OR content safely derivable from an upstream node's declared outputs. If the user said \"send a Slack message\" / \"send an email\" WITHOUT saying what it should say, the content is UNSPECIFIED: add a `requiredUserInput` entry for that field (e.g. \"What should the Slack message say?\") and do NOT invent it. An `{{AI_FIELD:fieldName}}` placeholder is correct ONLY when the user asked for generated / summarized content (\"send a summary\", \"draft a reply\") OR the body is built from declared upstream outputs (\"send the email subject and sender\" → reference `{{trigger.subject}}` etc.). Do NOT use AI_FIELD to skip asking for content the user simply did not provide.",
  // Slice 4.AI-33 — null-patch required-field completeness. Closes the live
  // bug where, because the email provider was ambiguous (null patch), the
  // model asked only for the Slack channel and forgot the message text.
  // Grouped into R7 (unknown values / requiredUserInput / null-over-partial).
  "When you set proposedPatch to null but you DO intend to build specific nodes (you named the actions/triggers in intentSummary), you MUST still list EVERY missing required field of those intended nodes under requiredUserInput — not only the single blocking item. Example: the user wants an email trigger (provider ambiguous → null patch) plus a Slack channel message; even with a null patch, list \"Which email app should trigger this?\" AND \"Which Slack channel?\" AND \"What should the Slack message say?\". A null patch is NOT an excuse to ask only one question — surface the full set of answers the user must provide.",
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

export function renderActionFlags(a: CatalogActionEntry): string {
  const flags: string[] = [];
  if (a.isDestructive) flags.push("destructive");
  if (a.requiresConfirmation) flags.push("requires-confirmation");
  if (a.riskLevel !== "low") flags.push(`risk:${a.riskLevel}`);
  return flags.length > 0 ? ` [${flags.join(", ")}]` : "";
}

/** A provider is usable only if metadata exposes at least one action or trigger. */
export function isUsableProvider(p: ProviderCatalogEntry): boolean {
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

export function renderCatalog(input: WorkflowPlanPromptInput): string {
  const usable = input.catalog.providers.filter(isUsableProvider);
  if (usable.length === 0) {
    return "No providers with usable metadata are available. Only built-in logic may be used.";
  }
  return usable.map(renderProvider).join("\n");
}

export function renderConnectedIntegrations(input: WorkflowPlanPromptInput): string {
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

/**
 * Slice 4.AI-24 — render the current builder-canvas snapshot so the planner
 * sees what the user has RIGHT NOW (not what's in the persisted server copy,
 * which may lag). Deliberately compact + value-free: `kind provider:type`
 * per node + `from → to` per edge. The model only needs to know what is on
 * the canvas, not the config values (it proposes config via patch ops).
 *
 * When `currentGraph` is undefined OR empty, the section explicitly says the
 * canvas is empty — that prevents the model from inferring "well there must
 * have been something there before" and substituting a placeholder.
 */
export function renderCurrentGraph(input: WorkflowPlanPromptInput): string {
  const graph = input.currentGraph;
  if (!graph || graph.nodes.length === 0) {
    return "Current workflow on the canvas: (empty — no nodes on the canvas right now)";
  }
  const nodeLines = graph.nodes.map(
    (n) => `  - ${n.id}: ${n.kind} ${n.provider}:${n.type}`,
  );
  const edgeLines = graph.edges.length === 0
    ? ["  (no edges)"]
    : graph.edges.map((e) => `  - ${e.id}: ${e.from} → ${e.to}`);
  return [
    "Current workflow on the canvas (authoritative — this is what the user has RIGHT NOW; the no-substitution rule above still binds, so use these as context not as license to substitute):",
    "Nodes:",
    ...nodeLines,
    "Edges:",
    ...edgeLines,
  ].join("\n");
}

export function renderCostAwareness(cost: WorkflowPlanCostAwareness | undefined): string | null {
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
 *
 * Back-compat wrapper around {@link buildWorkflowPlanPromptWithAttribution}
 * (Slice 4.AI-28). Callers that need per-section size attribution for
 * `ai_cost_events` should use the sibling directly.
 */
export function buildWorkflowPlanPrompt(
  input: WorkflowPlanPromptInput,
): ModelMessage[] {
  return buildWorkflowPlanPromptWithAttribution(input).messages;
}

/**
 * Slice 4.AI-28 — same deterministic output as
 * {@link buildWorkflowPlanPrompt} plus a side-channel
 * {@link PlannerPromptAttribution} the planner threads into
 * `recordAiPlanOutcome` so dashboards can decompose where the input-token
 * bill goes (catalog vs rules vs connected-integrations vs canvas vs user
 * request) without persisting any raw prompt text.
 *
 * Slice 4.AI-29 — dispatches to the structured v2 builder by default; falls
 * back to the v1 builder when `ENABLE_STRUCTURED_PROMPT_PACKET=false` is
 * set in the environment. Both implementations are deterministic + share
 * the same renderers (`renderCatalog`, `renderConnectedIntegrations`,
 * `renderCurrentGraph`, `renderCostAwareness`); only the section
 * orchestration + rule grouping differs. The attribution shape is
 * identical across versions — only `packetVersion` distinguishes them.
 *
 * The attribution carries CHAR counts (exact, deterministic) + structural
 * inventory counts (provider / action / trigger / field / output / canvas).
 * NO secrets, NO raw user text, NO raw catalog content — only sizes +
 * counts + the packet version label. Safe against the existing
 * `sanitizeAiEventMetadata` denylist (every field name avoids
 * `/token|secret|password|authorization|prompt|config|body|raw/i`).
 */
export function buildWorkflowPlanPromptWithAttribution(
  input: WorkflowPlanPromptInput,
): { readonly messages: ModelMessage[]; readonly attribution: PlannerPromptAttribution } {
  // AI-29 — opt-out via env. Default (env unset OR any value other than the
  // literal string "false") is v2. The flag is read at call-time so unit
  // tests can toggle it via `process.env.ENABLE_STRUCTURED_PROMPT_PACKET = …`
  // without a module reload. Documented rollback path: set to "false" to
  // restore the v1 prompt for one slice while AI-30 stabilizes.
  if (process.env.ENABLE_STRUCTURED_PROMPT_PACKET === "false") {
    return buildWorkflowPlanPromptV1WithAttribution(input);
  }
  return buildWorkflowPlanPromptV2WithAttribution(input);
}

/**
 * Slice 4.AI-29 — the original v1 prose builder preserved for rollback +
 * documentation. The dispatcher (`buildWorkflowPlanPromptWithAttribution`)
 * routes to this implementation when `ENABLE_STRUCTURED_PROMPT_PACKET=false`.
 * v2's structural changes never altered the semantic guarantees, so this
 * path remains safe; AI-30 will delete it once v2 is observed in production.
 */
export function buildWorkflowPlanPromptV1WithAttribution(
  input: WorkflowPlanPromptInput,
): { readonly messages: ModelMessage[]; readonly attribution: PlannerPromptAttribution } {
  // Slice 4.AI-30 — apply provider narrowing for V1 too. Same helper
  // V2 uses; the safety invariants (no substitution of explicit, canvas,
  // connected, native; full-catalog fallback for ambiguous broad
  // requests) hold for both packet shapes. Rollback for narrowing alone
  // is `ENABLE_AI_PROVIDER_NARROWING=false`; rollback for packet shape
  // back to v1 is `ENABLE_STRUCTURED_PROMPT_PACKET=false`.
  const narrowingInput = {
    userRequest: input.userRequest,
    catalog: input.catalog,
    connectedIntegrations: input.connectedIntegrations,
    ...(input.currentGraph ? { currentGraph: input.currentGraph } : {}),
  };
  const narrowing = narrowProvidersForPlan(narrowingInput);
  // Slice 4.AI-31 deterministic classifier OR Slice 4.AI-34C model classifier
  // (when threaded in by the async layer). ADVISORY: can only ADD valid
  // catalog providers to the narrowed set — never removes a deterministic /
  // explicit / connected / canvas provider.
  const resolved = resolvePromptClassifier(input, narrowingInput, narrowing);
  const classifier = resolved.classifier;
  const effectiveInput: WorkflowPlanPromptInput = {
    ...input,
    catalog: filterCatalogToNarrowed(input.catalog, resolved.effectiveNarrowing),
  };

  const preamble =
    "You are ChainReact's workflow planner. You design an automation workflow from the user's request by proposing a WorkflowPatch grounded ONLY in the metadata provided below.";
  const rulesSection = `Rules:\n${PLANNER_CONSTRAINTS.map((c) => `- ${c}`).join("\n")}`;
  const catalogSection = `Available providers, triggers, and actions (the ONLY ones you may use):\n${renderCatalog(effectiveInput)}`;
  const connectedSection = renderConnectedIntegrations(effectiveInput);
  const canvasSection = renderCurrentGraph(effectiveInput);

  const sections: string[] = [
    preamble,
    rulesSection,
    TEMPLATE_FUTURE_NOTE,
    catalogSection,
    connectedSection,
    canvasSection,
  ];

  const costSection = renderCostAwareness(input.costAwareness);
  if (costSection) sections.push(costSection);

  sections.push(`Response format:\n${RESPONSE_SCHEMA_DESCRIPTION}`);
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
    packetVersion: PLANNER_PACKET_VERSION_V1,
    fullCatalog: input.catalog,
    effectiveCatalog: effectiveInput.catalog,
    systemContent,
    userContent,
    catalogSection,
    rulesSection,
    connectedSection,
    canvasSection,
    connectedIntegrationCount: input.connectedIntegrations.length,
    currentGraph: input.currentGraph,
    narrowing: resolved.effectiveNarrowing,
    ...(input.plannerTier ? { plannerTier: input.plannerTier } : {}),
    classifier,
    ...(resolved.classifierAbsentReason
      ? { classifierAbsentReason: resolved.classifierAbsentReason }
      : {}),
    deterministicProviderCountOverride: resolved.deterministicProviderCount,
    finalProviderCount: resolved.finalProviderCount,
    ...(resolved.modelClassifierOutcome
      ? { modelClassifierOutcome: resolved.modelClassifierOutcome }
      : {}),
  });

  return { messages, attribution };
}

