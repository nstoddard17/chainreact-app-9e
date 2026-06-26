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
 */
const CREDENTIAL_AVAILABILITY_INSTRUCTION =
  "Only suggest using connections listed as available in this request, or ask the user to connect or share the provider first.";

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
    accountLine,
    sharedConnLine,
    ownConnLine,
    privateConnLine,
    RESPONSE_FORMAT_INSTRUCTIONS,
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
  "- Missing config VALUES are fine — leave them out; ChainReact collects them with a setup form. Provider:type for any added/replaced step MUST come from the capability catalog.",
  '- Each operation uses this EXACT shape: {"op":"removeNode","nodeId":"node_2"}, {"op":"addNode","node":{"id":"new_email","kind":"action","provider":"gmail","type":"send_email"}}, {"op":"addEdge","edge":{"id":"e1","from":"node_1","to":"new_email"}}, {"op":"removeEdge","edgeId":"edge_1"}. Do NOT invent other shapes.',
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
  "- When the trigger/action shape is clear, RETURN the plan even if specific config values are still unknown. List each unknown field key the step needs in that step's `requiredInputs` (e.g. \"channel\", \"text\") and leave the values out — do NOT ask the user for a channel, recipient, or message text before returning the plan.",
  "- This applies to MULTI-STEP shapes too: a trigger plus two or more actions (e.g. tag a subscriber, then notify a channel) is still a clear shape — return the whole plan as steps, do NOT just describe the sequence in prose. The user will see the skeleton on the canvas as you talk.",
  "- EDITING an existing workflow (the user asks to change/remove/replace/reconfigure/reconnect a step, e.g. 'change it to email', 'remove that Slack step', 'put a delay before the email', 'change the trigger'): return a STRUCTURED EDIT — a single fenced ```json block of the form {\"operations\": [ ... ]} describing the change as WorkflowPatch operations: addNode, removeNode, updateNodeConfig, addEdge, removeEdge, replaceEdge, moveNode, replaceTrigger. Reference EXISTING steps by their exact node id from the current workflow (never by position or provider) so a workflow with two similar steps is unambiguous. Use new patch-local ids for nodes you add, and re-connect edges so the graph stays wired. Missing config is fine — leave it out (ChainReact collects it as setup). Do NOT reply that the change is fine without returning the operations, and do NOT claim you changed anything (ChainReact validates + applies only after the user clicks Apply). If two steps could match the user's reference, ASK which one instead of guessing.",
  "- Append the plan as ONE optional structured plan in a single fenced ```json code block, in this shape:",
  '  {"title": "...", "summary": "...", "steps": [{"ref": "s0", "role": "trigger|action|logic", "provider": "<from the catalog>", "type": "<from the catalog>", "purpose": "...", "requiredInputs": ["fieldKey"]}], "clarifyingQuestions": ["..."]}',
  "- Every step's provider:type MUST be one of the listed ChainReact capabilities. Do not invent providers, actions, or triggers.",
  "- The TRIGGER (the source/event ChainReact watches) is held to the same rule: only use a trigger from the catalog. If the user describes watching a metric or condition with no matching catalog trigger (e.g. \"when usage drops\", \"low usage\", \"on churn\"), do NOT claim the flow is ready/straightforward and do NOT invent a trigger. Instead ASK which source the data should come from (e.g. Stripe, HubSpot, Google Analytics, a webhook, or their app), OR return a plan using the `native:manual.run` trigger and say it is a STARTING point they can re-point to a real source. List the still-needed pieces in `requiredInputs`/`clarifyingQuestions`.",
  "- Ask short clarifying questions FIRST (and OMIT the json block) ONLY when the SHAPE itself is ambiguous — e.g. you cannot tell which trigger or action to use, which app/provider the user means, or the request could map to materially different workflow structures. Missing config values alone never make the shape ambiguous.",
  "- If the shape is genuinely unclear and you cannot pick capabilities from the catalog, OMIT the json block — do not guess providers/actions.",
  "- The plan is a suggestion for the user to review. Do NOT say you created, added, applied, saved, ran, or changed anything — nothing is changed in their workflow.",
].join("\n");
