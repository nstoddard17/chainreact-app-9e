/**
 * Safe guidance-prompt builder for the Hermes Agent gateway (HERMES-AGENT-PROD-CLIENT).
 *
 * Builds the SINGLE `prompt` string ChainReact sends in the gateway body `{ "prompt": ... }` from
 * SAFE inputs ONLY:
 *   - the de-identified generalized workflow shape (from sanitizeWorkflowForGuidance — NO config),
 *   - the public ChainReact capability catalog (provider:type keys — not user data),
 *   - the user's own goal text, defensively scrubbed of obvious secret/token shapes.
 *
 * It NEVER includes node config values, secrets, OAuth/refresh tokens, API keys, the gateway token,
 * provider credentials, raw integration/Supabase rows, service-role data, private provider config,
 * or real workflow/account/user/node ids (nodes are opaque `n0/n1` refs). The Hermes Agent owns the
 * heavy system prompting on its side; this is just the safe, user-facing request payload.
 */

import type { GuidanceConversationTurn, WorkflowGuidanceRequest } from "@/contracts/aiGuidance";
import { MAX_GUIDANCE_CONVERSATION_TURNS, MAX_GUIDANCE_CONVERSATION_TURN_TEXT } from "@/contracts/aiGuidance";
import type { EditableWorkflowGraph } from "@/contracts/editableWorkflowGraph";
import { EXISTING_EDGE_REF_PREFIX, EXISTING_NODE_REF_PREFIX, NEW_NODE_REF_PREFIX } from "@/contracts/editableWorkflowGraph";
import type { SafeGuidanceContext } from "../guidanceContextPolicy";

export interface BuildGatewayPromptInput {
  /** Already-sanitized request (generalized shape + guidance kind + safe finding codes). */
  readonly request: WorkflowGuidanceRequest;
  /** The user's own goal text (their words). Scrubbed of obvious secrets before inclusion. */
  readonly goalText?: string;
  /**
   * HERMES-AGENT-BUILDER-RAIL-CHAT-MODE — optional session-scoped recent conversation (plain-text
   * user/assistant turns). Each turn is defensively secret-scrubbed + truncated and the list is bounded
   * to the most recent turns, so a follow-up reads in context without leaking config/secrets/ids.
   */
  readonly recentTurns?: readonly GuidanceConversationTurn[];
  /** Public capability catalog the brain may propose from (provider:type keys). Safe — not user data. */
  readonly capabilityCatalog?: readonly string[];
  /**
   * REACT-CONFIG-COVERAGE-1 — pre-rendered field-schema lines for a NARROWED, relevant provider
   * subset (see `promptFieldSchemas`). PUBLIC registry metadata only (field keys/types/flags/static
   * option values) — never user data or config values. Lets the model see every declared field
   * (required AND optional) so a user-supplied constraint lands in its canonical field.
   */
  readonly fieldSchemaLines?: readonly string[];
  /**
   * REACT-AGENT-MULTISTEP-DATA-MAPPING-1 — pre-rendered OUTPUT lines (what each relevant node
   * PRODUCES). Without these the model was asked to reference "declared output names" it had never
   * been shown, which is why multi-step workflows came back with invented sample data instead of
   * upstream references. PUBLIC registry metadata only — names/types/descriptions, never values.
   */
  readonly outputSchemaLines?: readonly string[];
  /**
   * HERMES-AGENT-WORKFLOW-EDITOR-LIVE — the SAFE, model-facing editable view of the user's CURRENT local
   * draft (opaque node refs + safe editable config + edges + a version token). Present ONLY for an EDIT
   * request. Built by `buildEditableWorkflowGraph` (the editor privacy boundary) — it carries NO real
   * ids / credentials / secrets. When present, the prompt shows THIS instead of the de-identified shape
   * line so the model has one consistent, referenceable view to propose `WorkflowPatch` ops against.
   */
  readonly editableGraph?: EditableWorkflowGraph;
  /**
   * Scope-guarded context (HERMES-AGENT-MEMORY-SCOPE-GUARD) — account summary, account-shared /
   * own-connection availability, and a private-connection notice. Built by `buildSafeGuidanceContext`,
   * which guarantees no other-member private data / secrets / identity ever appears here.
   */
  readonly context?: SafeGuidanceContext;
}

/**
 * Hard scope instruction sent every request (HERMES-AGENT-MEMORY-SCOPE-GUARD). The REAL enforcement
 * is in ChainReact code (the selector decides what crosses the boundary); this just reinforces it.
 */
const CONTEXT_SCOPE_INSTRUCTION =
  "Use only the context included in this request. Do not infer or claim access to other team members' private data, credentials, messages, files, or memories.";

/**
 * Provider-availability instruction (HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT). Keeps suggestions
 * grounded in the sanitized availability summary instead of assuming a connection exists.
 *
 * REACT-PROVIDER-AMBIGUITY-2 — it must NOT read as "prefer whatever is connected". The connection
 * list says what is AVAILABLE; it never says which provider the user WANTS. The second sentence
 * makes that explicit so the listed connections can't become an implicit default.
 */
const CREDENTIAL_AVAILABILITY_INSTRUCTION =
  "Do not assume a connection exists that isn't listed as available in this request; if a provider the user chose isn't connected, say it needs connecting. " +
  "A connected provider is AVAILABLE, not SELECTED — never treat the connection list as the user's choice of provider.";

/**
 * Defensive redaction of obvious secret/token shapes from user free text. The goal text is the
 * user's own words, but a user could paste a key — redact common shapes so a pasted secret never
 * reaches the gateway. Returns the text with matches replaced by "[redacted]".
 */
export function redactSecretsFromText(text: string): string {
  return text
    .replace(/\bxox[abprs]-[A-Za-z0-9-]{8,}\b/g, "[redacted]") // Slack tokens
    .replace(/\bsk-[A-Za-z0-9]{16,}\b/g, "[redacted]") // OpenAI-style keys
    .replace(/\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, "[redacted]") // GitHub tokens
    .replace(/\bya29\.[A-Za-z0-9._-]{10,}\b/g, "[redacted]") // Google OAuth
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi, "[redacted]") // bearer headers
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, "[redacted]") // JWTs
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[redacted]"); // long hex secrets
}

/** Build the safe gateway prompt string. Pure; reads only safe inputs; forwards no config/secret/id. */
export function buildGatewayGuidancePrompt(input: BuildGatewayPromptInput): string {
  const wf = input.request.workflow;

  const goal = input.goalText ? redactSecretsFromText(input.goalText).slice(0, 4_000) : "";
  const goalLine = goal
    ? `User goal (their words): ${goal}`
    : "The user has not described a goal yet — ask clarifying questions.";

  // Session-scoped recent conversation (HERMES-AGENT-BUILDER-RAIL-CHAT-MODE). Bounded to the most
  // recent turns; each turn defensively secret-scrubbed + truncated. Plain text only — no config/ids.
  const recent = (input.recentTurns ?? [])
    .slice(-MAX_GUIDANCE_CONVERSATION_TURNS)
    .map((t) => {
      const who = t.role === "assistant" ? "Assistant" : "User";
      const text = redactSecretsFromText(t.text).slice(0, MAX_GUIDANCE_CONVERSATION_TURN_TEXT);
      return `  ${who}: ${text}`;
    })
    .filter((l) => l.trim().length > 0);
  const conversationLine = recent.length
    ? `Recent conversation (most recent last, for context — the latest user goal above is the request to answer now):\n${recent.join("\n")}`
    : "";

  // HERMES-AGENT-WORKFLOW-EDITOR-LIVE — when an editable graph is present (an EDIT request), show IT and
  // suppress the de-identified shape line, so the model references nodes by ONE consistent opaque scheme.
  const editing = !!input.editableGraph && input.editableGraph.nodes.length > 0;
  const shapeLine = editing
    ? ""
    : wf.nodeCount > 0
      ? `Current workflow shape: ${wf.nodeCount} step(s), ${wf.edgeCount} connection(s).\n` +
        wf.nodes.map((n) => `  - ${n.ref}: ${n.kind} ${n.provider}:${n.type}`).join("\n")
      : "There is no workflow yet.";

  const editableGraphBlock = editing ? buildEditableGraphBlock(input.editableGraph!) : "";
  const editInstructions = editing ? EDIT_RESPONSE_INSTRUCTIONS : "";

  const catalogLine = input.capabilityCatalog?.length
    ? "Available ChainReact capabilities (provider:type) to propose from:\n" +
      input.capabilityCatalog.map((c) => `  - ${c}`).join("\n")
    : "";

  // REACT-CONFIG-COVERAGE-1 — declared config fields for the relevant capabilities (public registry
  // metadata). "required" fields gate validity; "optional" fields must STILL be filled whenever the
  // user supplied the information (see FIELD_VALUE_INSTRUCTIONS).
  const fieldSchemaBlock = input.fieldSchemaLines?.length
    ? "Config fields for the most relevant capabilities (field name, type, required/optional):\n" +
      input.fieldSchemaLines.join("\n")
    : "";

  // REACT-AGENT-MULTISTEP-DATA-MAPPING-1 — what each node PRODUCES. This is the reference material
  // for {{...}} mappings; without it the model cannot wire one step's data into the next.
  const outputSchemaBlock = input.outputSchemaLines?.length
    ? "Data each capability PRODUCES — reference these with {{stepRef.outputName}} to pass data downstream:\n" +
      input.outputSchemaLines.join("\n")
    : "";

  const findingsLine = input.request.findingCodes?.length
    ? `Known issues (codes): ${input.request.findingCodes.join(", ")}`
    : "";

  // Scope-guarded context (account-safe only). Each line is omitted when its field is absent.
  const ctx = input.context;
  const accountLine = ctx
    ? `Account context: type=${ctx.account.type}${ctx.account.role ? `, your role=${ctx.account.role}` : ""}.`
    : "";
  const sharedConnLine = ctx?.sharedCredentialProviders?.length
    ? `Shared account connections available: ${ctx.sharedCredentialProviders.join(", ")}.`
    : "";
  const ownConnLine = ctx?.ownConnectionProviders?.length
    ? `Your own connected accounts: ${ctx.ownConnectionProviders.join(", ")}.`
    : "";
  const privateConnLine = ctx?.privateConnectionNotice ?? "";

  return [
    `Guidance kind: ${input.request.guidanceKind}`,
    goalLine,
    conversationLine,
    shapeLine,
    editableGraphBlock,
    findingsLine,
    catalogLine,
    fieldSchemaBlock,
    outputSchemaBlock,
    DATA_MAPPING_INSTRUCTIONS,
    accountLine,
    sharedConnLine,
    ownConnLine,
    privateConnLine,
    RESPONSE_FORMAT_INSTRUCTIONS,
    FIELD_VALUE_INSTRUCTIONS,
    editInstructions,
    CONTEXT_SCOPE_INSTRUCTION,
    CREDENTIAL_AVAILABILITY_INSTRUCTION,
    "This is advice only. ChainReact validates any proposed plan and is the only thing that can build, change, or run a workflow.",
  ]
    .filter((l) => l.length > 0)
    .join("\n\n");
}

/**
 * HERMES-AGENT-WORKFLOW-EDITOR-LIVE — render the SAFE editable graph the model edits against. Lists each
 * node by its OPAQUE ref (never a real id), its capability id (`provider:type`), a safe description, and
 * its safe editable config fields (key/label/type + value only when low-risk). Edges are by ref. The
 * `version` token is echoed back by the model so the server can reject a stale proposal.
 */
function buildEditableGraphBlock(graph: EditableWorkflowGraph): string {
  const lines: string[] = [];
  lines.push(
    `Editable workflow (the canvas you can change — version "${graph.version}"): ${graph.nodeCount} step(s), ${graph.edgeCount} connection(s).`,
  );
  lines.push(
    `Each step has an opaque REFERENCE (e.g. "${EXISTING_NODE_REF_PREFIX}1") that names WHICH step, and a capability id "provider:type" that names WHAT it is. Use the reference to target a step; use "provider:type" only to say which capability.`,
  );
  for (const n of graph.nodes) {
    const desc = n.description ? ` — ${n.description}` : "";
    lines.push(`  - ${n.ref} [${n.role}] ${n.capabilityKey}${desc}`);
    for (const f of n.config) {
      const valuePart =
        f.value !== undefined
          ? `, current=${JSON.stringify(f.value)}`
          : f.isSet
            ? ", currently set"
            : ", not set yet";
      lines.push(`      • ${f.key} (${f.label}, ${f.type}${f.required ? ", required" : ""}${valuePart})`);
    }
  }
  if (graph.edges.length > 0) {
    lines.push(`  Connections (target one by its "${EXISTING_EDGE_REF_PREFIX}" ref for removeEdge / replaceEdge):`);
    for (const e of graph.edges) {
      lines.push(`    ${e.ref}: ${e.fromRef} → ${e.toRef}${e.label ? ` [${e.label}]` : ""}`);
    }
  }
  return lines.join("\n");
}

/**
 * REACT-CONFIG-COVERAGE-1 — the canonical field-value rule, sent on EVERY request (create + edit).
 * Required fields are only the validity gate; the model must consider EVERY declared field and
 * carry the user's explicit constraints — optional or not — into config. It must never guess a
 * value the user didn't supply, and must copy `[[EMAIL_n]]` / `[[PHONE_n]]` placeholder tokens
 * VERBATIM (ChainReact substitutes the user's real value locally; the raw literal never crosses
 * this boundary).
 */
/**
 * REACT-AGENT-MULTISTEP-DATA-MAPPING-1 — the data-flow rules for MULTI-STEP workflows.
 *
 * The production failure these answer: a Typeform → Mailchimp → HubSpot → Gmail request produced the
 * right four nodes with no data flowing between them — Email fields held invented addresses and the
 * Gmail body was empty. Two rules fix the general case: map from the declared outputs above, and when
 * the needed data genuinely is not declared, SAY SO rather than filling the hole with something that
 * looks real. The third rule covers the Typeform-shaped case where the data only becomes describable
 * after the user picks a provider resource.
 */
const DATA_MAPPING_INSTRUCTIONS = [
  "Passing data between steps (multi-step workflows):",
  "- When a later step needs a value an EARLIER step produces, reference it: {{stepRef.outputName}} using the step's `ref` from your plan and an output name from the 'produces' list above (the trigger's ref works too). NEVER retype or approximate the data.",
  "- ONE upstream value may feed MANY downstream steps. If the trigger produces an email and three later steps each need an email, all three reference the SAME output. Do not ask the user to supply it three times.",
  "- NEVER invent a realistic-looking sample value. Addresses like subscriber@example.com or alice@example.com, names like John Smith, companies like Acme Inc. are FORBIDDEN as config values unless the user typed that exact value themselves. ChainReact removes invented values and the step comes back incomplete, so inventing one makes the workflow WORSE than leaving the field out.",
  "- If a value should come from upstream but no declared output provides it, leave the field OUT and name it in `requiredInputs`, and say plainly in your prose which data you could not find. An incomplete-but-honest plan is correct; a complete-looking plan built on invented data is not.",
  "- For a summary/notification body, BUILD it from references — e.g. \"Name: {{s0.firstName}} {{s0.lastName}}\\nEmail: {{s0.email}}\" — never leave it blank and never fill it with example prose.",
  "- SCHEMA-DEPENDENT DATA (important): some triggers only describe their data as a generic list/object (e.g. a form's `answers` array) because the individual questions depend on WHICH form/board/sheet the user picks. When the user's request needs those per-item values and the resource is not chosen yet, do NOT guess field names and do NOT invent values. Ask the user to pick that resource FIRST, explain that you will map its fields once it is selected, and list the affected downstream fields in `requiredInputs`.",
].join("\n");

const FIELD_VALUE_INSTRUCTIONS = [
  "Filling config fields (applies to plans AND edits):",
  "- Required fields are only the minimum needed for the step to be valid. Consider EVERY declared field of the chosen capability — required and optional, including ones marked 'advanced'.",
  '- If the user supplies information that matches ANY field (an address to filter on, a subject phrase, a folder, a flag like "reply to all"), include that field with the user\'s value in the step\'s "config". NEVER omit a constraint the user stated just because its field is optional.',
  "- If the user did NOT mention a field and nothing determines its value, leave it out entirely. Do not guess, pad, or fill defaults.",
  "- Preserve explicit false and 0 values exactly — they are real values, not omissions.",
  "- For a field marked 'dynamic options', put the user's own words as the value (e.g. the channel or board NAME); ChainReact resolves it to the stored id through its own picker, or asks the user. Never invent an id.",
  "- When the user wants a value taken from an earlier step's output, use the {{...}} variable reference to a declared output name.",
  "- Placeholders like [[EMAIL_1]] or [[PHONE_1]] stand for a literal value the user provided (hidden for privacy). Copy the placeholder EXACTLY, unchanged, into the config field where that value belongs (e.g. a sender filter or recipient field). Never expand, alter, or guess the hidden value.",
  "- Never fabricate ids, recipients, enum values, account resources, or credentials. Never fill secret/credential/connection fields at all.",
].join("\n");

/**
 * HERMES-AGENT-WORKFLOW-EDITOR-LIVE — how to propose an EDIT against the editable graph above. The model
 * MUST reference existing steps ONLY by the opaque refs shown (never by position, provider, or a guessed
 * id), declare NEW nodes with `new_`-prefixed refs, and echo the graph `version` so a stale proposal is
 * rejected rather than applied to a changed canvas.
 */
const EDIT_RESPONSE_INSTRUCTIONS = [
  "Editing this workflow:",
  `- To change the workflow, return ONE fenced \`\`\`json block: {"editVersion": "<the version string shown in the editable workflow above>", "operations": [ ... ]}. Operations are WorkflowPatch ops: addNode, removeNode, updateNodeConfig, addEdge, removeEdge, replaceEdge, moveNode, replaceTrigger.`,
  `- Reference an EXISTING step ONLY by its opaque reference shown above (e.g. "${EXISTING_NODE_REF_PREFIX}2") — for updateNodeConfig.nodeId, removeNode.nodeId, moveNode.nodeId, removeEdge/replaceEdge targets, and edge from/to endpoints. NEVER use a step's position ("the first Slack step") or its provider as the reference.`,
  `- For a step you ADD, give it a NEW reference beginning with "${NEW_NODE_REF_PREFIX}" (e.g. "${NEW_NODE_REF_PREFIX}email"). Use that same new reference in the edges that wire it in. The server assigns the real id.`,
  `- Target an EXISTING connection for removeEdge / replaceEdge ONLY by its "${EXISTING_EDGE_REF_PREFIX}" reference shown under Connections. For a NEW connection, addEdge with from/to node references (give the edge any id).`,
  "- A replacement is removeNode (old reference) + addNode (new reference) + addEdge(s) re-wiring the new node — NOT an append. To insert a step BEFORE another, removeEdge the existing connection (by its edge_ ref) and addEdge through the new step.",
  "- Use ONLY references that appear in the editable workflow above, or new_ references you introduce in the SAME patch. Do not invent or reuse a reference for a step that isn't shown.",
  "- Config VALUES the user did not supply are fine to leave out — ChainReact collects them with a setup form. But every value the user DID supply must be carried in the operation: use updateNodeConfig for an existing step, or set config on the node you add (see 'Filling config fields'). Provider:type for any added/replaced step MUST come from the capability catalog.",
  '- Each operation uses this EXACT shape: {"op":"removeNode","nodeId":"node_2"}, {"op":"addNode","node":{"id":"new_step","kind":"action","provider":"<provider from the catalog>","type":"<type from the catalog>"}}, {"op":"addEdge","edge":{"id":"e1","from":"node_1","to":"new_step"}}, {"op":"removeEdge","edgeId":"edge_1"}. Do NOT invent other shapes.',
  '- BRANCH LABELS: an addEdge/replaceEdge edge may carry an optional "label" field — {"op":"addEdge","edge":{"id":"e2","from":"node_1","to":"new_step","label":"true"}} — and the label decides WHICH route the edge belongs to. Edges leaving a native:if_then_condition step are labeled "true"/"false" — wire a "false" edge ONLY when that step\'s onFalse is "branch" (with onFalse "skip", wire only "true"; the false path simply ends). Edges leaving a native:router step carry a route label from its config.routes[].label (plus its defaultRoute when configured). Edges from any OTHER step are unlabeled.',
  '- RECONVERGENCE: mutually exclusive routes may — and usually should — reconverge on ONE shared downstream step instead of duplicating it; the shared step runs once (whichever route ran). Example (payment If/Then): {"op":"addEdge","edge":{"id":"e1","from":"node_if","to":"new_receipt","label":"true"}}, {"op":"addEdge","edge":{"id":"e2","from":"node_if","to":"new_notify","label":"false"}}, {"op":"addEdge","edge":{"id":"e3","from":"new_receipt","to":"new_log"}}, {"op":"addEdge","edge":{"id":"e4","from":"new_notify","to":"new_log"}} — the labeled edges pick the route; the unlabeled edges rejoin both routes on the shared log step.',
  "- CLARIFICATION RULE (critical): whenever you need the user to CHOOSE something before you can commit — which app/provider to use (e.g. Gmail vs Outlook for email), or which of several similar steps they mean — ask ONLY that question in plain prose and OMIT the json block entirely. NEVER pick one option AND ask which to use in the same reply, and never include operations alongside a question. Only return operations when you are committing to a specific change with no question.",
  "- Only claim a change is proposed when you return a valid operations block (no question). The rail shows the user a plain summary and a preview — do not paste the json into your prose.",
].join("\n");

/**
 * Response-format guidance for the Hermes Agent (HERMES-AGENT-PLAN-EXTRACTION +
 * HERMES-AGENT-PREFER-PARTIAL-PREVIEW-WITH-SETUP). Asks for normal-language help PLUS an OPTIONAL
 * structured plan in a single fenced ```json block.
 *
 * KEY RULE (the partial-preview correction): the plan describes the workflow SHAPE (which trigger /
 * actions, in what order). Missing CONFIG VALUES — a Slack channel, a recipient, the exact message
 * text, dates — are NOT a reason to withhold the plan. ChainReact collects those itself with a guided
 * setup UI (dropdowns / text fields) AFTER the user reviews the shape. So whenever the trigger/action
 * shape is clear, the agent should RETURN the plan and list the unknown field keys in `requiredInputs`,
 * rather than asking for those values first. Clarifying questions come first ONLY when the SHAPE itself
 * is ambiguous. The plan shape mirrors ChainReact's WorkflowPlan; provider/type MUST come from the
 * capability catalog (ChainReact rejects anything it cannot find). The agent must NOT claim it
 * created/changed/saved anything — ChainReact never applies a plan automatically.
 */
const RESPONSE_FORMAT_INSTRUCTIONS = [
  "How to respond:",
  "- Answer in clear, normal language first (one or two sentences is fine).",
  "- The structured plan describes the workflow SHAPE — which trigger and actions, in what order. Missing CONFIG VALUES (e.g. which Slack channel, the recipient, the exact message text, specific dates) are NOT part of the shape and are NOT a reason to withhold the plan: ChainReact collects them itself with a guided setup form (dropdowns / text fields) after the user reviews the shape.",
  "- When the trigger/action shape is clear, RETURN the plan even if specific config values are still unknown. List each unknown field key the step needs in that step's `requiredInputs` (e.g. \"channel\", \"text\") and leave those values out — do NOT ask the user for a channel, recipient, or message text before returning the plan.",
  '- But every config value the user ALREADY supplied (or a [[...]] placeholder standing for one) goes into that step\'s "config" object under its declared field key — required or optional. A user constraint must never be dropped or downgraded to a requiredInputs entry when its value is known.',
  "- This applies to MULTI-STEP shapes too: a trigger plus two or more actions (e.g. tag a subscriber, then notify a channel) is still a clear shape — return the whole plan as steps, do NOT just describe the sequence in prose. The user will see the skeleton on the canvas as you talk.",
  '- CONDITIONAL requests ("if X … otherwise Y … then Z"): branch topology CANNOT be expressed in the ordered plan steps — describe the conditional intent in your prose and in the steps\' `purpose` fields, and expect the true/false wiring to happen in the edit flow after the skeleton exists. Do NOT emit a linear chain that would silently run both actions unconditionally.',
  "- EDITING an existing workflow (the user asks to change/remove/replace/reconfigure/reconnect a step, e.g. 'change it to email', 'remove that Slack step', 'put a delay before the email', 'change the trigger'): return a STRUCTURED EDIT — a single fenced ```json block of the form {\"operations\": [ ... ]} describing the change as WorkflowPatch operations: addNode, removeNode, updateNodeConfig, addEdge, removeEdge, replaceEdge, moveNode, replaceTrigger. Reference EXISTING steps by their exact node id from the current workflow (never by position or provider) so a workflow with two similar steps is unambiguous. Use new patch-local ids for nodes you add, and re-connect edges so the graph stays wired. Missing config is fine — leave it out (ChainReact collects it as setup). Do NOT reply that the change is fine without returning the operations, and do NOT claim you changed anything (ChainReact validates + applies only after the user clicks Apply). If two steps could match the user's reference, ASK which one instead of guessing.",
  "- Append the plan as ONE optional structured plan in a single fenced ```json code block, in this shape:",
  '  {"title": "...", "summary": "...", "steps": [{"ref": "s0", "role": "trigger|action|logic", "provider": "<from the catalog>", "type": "<from the catalog>", "purpose": "...", "requiredInputs": ["fieldKey"], "config": {"<declaredFieldKey>": "<value the user supplied>"}}], "clarifyingQuestions": ["..."]}',
  "- Every step's provider:type MUST be one of the listed ChainReact capabilities. Do not invent providers, actions, or triggers.",
  "- The TRIGGER (the source/event ChainReact watches) is held to the same rule: only use a trigger from the catalog. If the user describes watching a metric or condition with no matching catalog trigger (e.g. \"when usage drops\", \"low usage\", \"on churn\"), do NOT claim the flow is ready/straightforward and do NOT invent a trigger. Instead ASK which source the data should come from (e.g. Stripe, HubSpot, Google Analytics, a webhook, or their app), OR return a plan using the `native:manual.run` trigger and say it is a STARTING point they can re-point to a real source. List the still-needed pieces in `requiredInputs`/`clarifyingQuestions`.",
  "- Ask short clarifying questions FIRST (and OMIT the json block) ONLY when the SHAPE itself is ambiguous — e.g. you cannot tell which trigger or action to use, which app/provider the user means, or the request could map to materially different workflow structures. Missing config values alone never make the shape ambiguous.",
  '- PROVIDER RULE (critical): a generic capability word — "email", "spreadsheet", "message", "calendar", "document" — names a KIND of app, NOT a provider. It is NOT permission to pick one. When the catalog offers more than one provider for the capability and the user has not named one (and no step of that kind is already on their canvas), ASK which provider to use (e.g. "Gmail or Microsoft Outlook?") and OMIT the json block. Never default to Gmail or to the first catalog entry. When the user then names the provider, return the full plan with every value they already gave — they must never have to repeat details.',
  "- CONNECTION IS NOT A CHOICE: a connected provider is available, not selected. For a new workflow, do not choose among multiple supported providers unless the user identifies one. Ask a targeted clarification even when only one of those providers is connected — you may mention which one is already connected as a convenience, but the user still decides. (Only when the catalog has exactly ONE provider for the capability may you use it without asking.)",
  "- If the shape is genuinely unclear and you cannot pick capabilities from the catalog, OMIT the json block — do not guess providers/actions.",
  "- The plan is a suggestion for the user to review. Do NOT say you created, added, applied, saved, ran, or changed anything — nothing is changed in their workflow.",
].join("\n");
